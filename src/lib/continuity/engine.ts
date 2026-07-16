// ═══════════════════════════════════════════════════════════════════
// CONTEXTUAL CONTINUITY ENGINE
//
// Nueva capa de inteligencia que se ejecuta inmediatamente antes
// de construir el prompt final del modelo.
//
// No sustituye ninguna capa existente. Solo añade inteligencia
// contextual cuando mejora realmente la respuesta.
//
// FILOSOFÍA:
//   "La memoria no sirve para recordar todo. Sirve para responder mejor."
//   Antes de usar cualquier conocimiento previo, pregunta:
//   "¿Esta información mejora realmente la respuesta que voy a dar?"
//
// INTEGRACIÓN:
//   Se invoca en route.ts DESPUÉS de que groqMessages está ensamblado
//   y ANTES de la llamada a Groq. Modifica groqMessages[0].content
//   (el system prompt) inyectando un bloque adicional de continuidad.
//
// PRIVACIDAD:
//   El mentor nunca inicia conversaciones. Nunca envía mensajes por
//   sí mismo. Solo utiliza recuerdos cuando ayudan a responder mejor.
//   El usuario debe sentir: "Mi mentor me conoce."
//   Nunca: "La aplicación está pendiente de mí."
//
// TECNOLOGÍA:
//   Sin embeddings. Sin vector DB. Sin LLM adicional.
//   Coincidencia temática basada en categorías por imperio.
//   Búsqueda directa en mensajes de hilos anteriores.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Tipos públicos ───

export interface ContinuityInput {
  userId: string;
  currentThreadId: string;
  currentMessage: string;
  history: { role: string; content: string }[];
  plan: string;
}

export interface ContinuityResult {
  /** Fragmento de texto a inyectar en el prompt. Vacío si no hay continuidad relevante. */
  snippet: string;
  /** Número de mensajes examinados de hilos anteriores. */
  threadsSearched: number;
  /** Número de hits temáticos encontrados. */
  hitsFound: number;
}

// ─── Categorías temáticas ───
// Cada categoría agrupa palabras clave relacionadas con un tema vital.
// Se usan para detectar de qué habla el usuario sin LLM.
// Las categorías pueden relacionarse entre sí (cross-imperio).

const THEME_CATEGORIES: Record<string, string[]> = {
  // Sueño y descanso
  sueño: [
    'dormir', 'sueño', 'despertar', 'noche', 'insomnio', 'descanso',
    'madrugar', 'acostar', 'cama', 'pesadilla', 'dormía', 'duermo',
    'horas de sueño', 'calidad del sueño', 'desperté', 'me cuesta dormir',
    'no pude dormir', 'dormí mal', 'dormí bien', 'descansé', 'fatiga',
  ],

  // Ejercicio y movimiento
  ejercicio: [
    'caminar', 'caminata', 'pasos', 'correr', 'gimnasio', 'entrenar',
    'ejercicio', 'actividad física', 'deporte', 'estirar', 'yoga',
    'pesas', 'cardio', 'rutina', 'caminé', 'corrí', 'entrené',
    '10.000 pasos', '10000 pasos', 'salir a caminar', 'dar un paseo',
    'moverse', 'sedentario', 'movimiento',
  ],

  // Meditación y mente
  meditación: [
    'meditar', 'meditación', 'mindfulness', 'respirar', 'respiración',
    'atención plena', 'calma mental', 'serenidad', 'silencio interior',
    'medité', 'medito', 'práctica mental', 'concentración',
    'visualización', 'enfoque', 'claridad mental', 'despejar la mente',
  ],

  // Finanzas y ahorro
  finanzas: [
    'ahorrar', 'ahorro', 'gastar', 'gasto', 'dinero', 'ingresos',
    'presupuesto', 'vivienda', 'alquiler', 'hipoteca', 'entrada',
    'inversión', 'invertir', 'etf', 'fondo', 'renta', 'sueldo',
    'economía', 'finanzas', 'cuenta', 'bolsa', 'precio', 'coste',
    'caro', 'barato', 'compra', 'pagar', 'deuda', 'préstamo',
    'ahorré', 'gasté', 'invertí', 'cotización',
  ],

  // Nutrición y alimentación
  nutrición: [
    'comer', 'comida', 'dieta', 'alimentación', 'nutrición', 'receta',
    'cocinar', 'desayuno', 'almuerzo', 'cena', 'snack', 'proteína',
    'calorías', 'hidratación', 'agua', 'café', 'azúcar', 'vegetales',
    'fruta', 'saludable', 'picar', 'hambre', 'sobrepeso', 'peso',
    'cociné', 'comí', 'dieta', 'ayuno',
  ],

  // Estrés y ansiedad
  estrés: [
    'estrés', 'ansiedad', 'ansioso', 'nervioso', 'preocupación',
    'preocupar', 'agobio', 'presión', 'tensión', 'pánico', 'miedo',
    'angustia', 'sobrecarga', 'agotado', 'burnout', 'cansancio',
    'estresado', 'estoy agotado', 'no aguanto', 'demasiado',
  ],

  // Disciplina y hábitos
  disciplina: [
    'hábito', 'hábitos', 'constancia', 'rutina', 'disciplina',
    'compromiso', 'hábito diario', 'racha', 'rachas', 'procrastinar',
    'procrastinación', 'motivación', 'fuerza de voluntad',
    'empecé', 'dejé', 'volver a', 'mantener', 'ser constante',
    'cree el hábito', 'romper el hábito',
  ],

  // Relaciones y sociales
  relaciones: [
    'pareja', 'relación', 'familia', 'amigos', 'amistad', 'hijos',
    'compañeros', 'trabajo', 'jefe', 'equipo', 'conflicto',
    'comunicación', 'límites', 'persona', 'conocer', 'conversar',
  ],

  // Trabajo y productividad
  trabajo: [
    'trabajo', 'trabajar', 'productividad', 'proyecto', 'empresa',
    'reunión', 'deadline', 'plazo', 'objetivo profesional', 'carrera',
    'promoción', 'cargo', 'jornada', 'home office', 'teletrabajo',
    'oficina', 'tarea', 'tareas',
  ],

  // Energía y vitalidad
  energía: [
    'energía', 'vitalidad', 'cansado', 'cansancio', 'agotado',
    'fatiga', 'sin energía', 'con energía', 'activo', 'letargo',
    'somnolencia', 'rendimiento', 'forma física',
  ],

  // Emociones y bienestar general
  emociones: [
    'feliz', 'triste', 'enojado', 'frustrado', 'contento', 'grato',
    'agradecimiento', ' Gratitud ', 'bienestar', 'estado de ánimo',
    'ánimo', 'deprimido', 'motivado', 'desmotivado', 'ilusión',
    'esperanza', 'frustración', 'irritado', 'tranquilo', 'inquieto',
    'me siento', 'estado emocional', 'emocional',
  ],

  // Objetivos y metas
  objetivos: [
    'objetivo', 'meta', 'propósito', 'meta', 'lograr', 'conseguir',
    'alcanzar', 'pretendo', 'quiero', 'me gustaría', 'mi sueño',
    'aspiración', 'deseo', 'plan', 'proyecto de vida', 'propósito',
    'estoy intentando', 'quiero lograr', 'mi meta es',
  ],
};

// ─── Mapa de conexiones cross-imperio ───
// Define qué categorías están relacionadas entre sí para permitir
// que el motor conecte temas de diferentes imperios de forma natural.

const CROSS_IMPERIO_LINKS: Record<string, string[]> = {
  sueño: ['energía', 'disciplina', 'estrés', 'emociones'],
  ejercicio: ['energía', 'disciplina', 'nutrición', 'emociones', 'sueño'],
  meditación: ['energía', 'estrés', 'emociones', 'trabajo', 'sueño'],
  finanzas: ['estrés', 'trabajo', 'emociones', 'disciplina'],
  nutrición: ['energía', 'ejercicio', 'emociones', 'sueño'],
  estrés: ['sueño', 'meditación', 'finanzas', 'trabajo', 'emociones', 'energía'],
  disciplina: ['ejercicio', 'meditación', 'objetivos', 'finanzas', 'hábitos'],
  relaciones: ['emociones', 'estrés', 'trabajo', 'sueño'],
  trabajo: ['estrés', 'finanzas', 'sueño', 'emociones', 'energía'],
  energía: ['sueño', 'ejercicio', 'nutrición', 'estrés', 'meditación'],
  emociones: ['estrés', 'sueño', 'relaciones', 'meditación', 'trabajo'],
  objetivos: ['disciplina', 'finanzas', 'trabajo', 'ejercicio', 'meditación'],
};

// ─── Expresiones que indican intención/compromiso/decisión ───
// El motor prioriza mensajes que contienen estas expresiones,
// ya que representan información memorable (objetivos, compromisos).

const INTENTION_PATTERNS: RegExp[] = [
  /quiero\s+(empezar|crear|lograr|conseguir|ser|tener|hacer|mejorar|cambiar|dejar|intentar)/i,
  /voy\s+a\s+(empezar|intentar|probar|hacer|cambiar|mejorar|crear)/i,
  /mi\s+(objetivo|meta|propósito|plan|meta es|goal)/i,
  /me\s+(gustaría|propongo|comprometo|he propuesto)/i,
  /tengo\s+que\s+(empezar|cambiar|mejorar|dejar|hacer)/i,
  /necesito\s+(empezar|cambiar|mejorar|dejar|hacer|ser)/i,
  /estoy\s+(intentando|probando|tratando|buscando)/i,
  /a\s+(partir\s+de|hora|partir)\s+(hoy|mañana|ahora)/i,
  /mi\s+(problema\s+(principal|más\s+grande)|mayor\s+(problema|dificultad|reto))/i,
  /quiero\s+ser\s+(más\s+)?(constante|disciplinado|regular|constante)/i,
  /he\s+(decidido|empezado|logrado|conseguido)/i,
  /ahorrar\s+(para|dinero)/i,
  /dejar\s+de\s+(fumar|beber|procrastinar|comer|dormir\s+tarde)/i,
];

// ─── Configuración ───

const RELEVANCE_THRESHOLD = 0.35;

/** Número máximo de hilos previos a buscar. PREMIUM: 5, FREE: 1 */
function getThreadSearchLimit(plan: string): number {
  return plan === 'PREMIUM' ? 5 : 1;
}

/** Número máximo de mensajes a extraer por hilo */
const MAX_MESSAGES_PER_THREAD = 8;

/** Número máximo de hits a considerar para generar el snippet */
const MAX_HITS = 3;

/** Longitud máxima del snippet inyectado (caracteres) */
const MAX_SNIPPET_LENGTH = 350;

// ─── Funciones internas ───

/**
 * Detecta las categorías temáticas presentes en un texto.
 * Retorna un Map<categoria, número de matches> ordenado por frecuencia.
 */
function detectCategories(text: string): Map<string, number> {
  const lower = text.toLowerCase();
  const matches = new Map<string, number>();

  for (const [category, keywords] of Object.entries(THEME_CATEGORIES)) {
    let count = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        count++;
      }
    }
    if (count > 0) {
      matches.set(category, count);
    }
  }

  return matches;
}

/**
 * Verifica si un texto contiene patrones de intención/compromiso/decisión.
 * Estos mensajes son prioritarios porque representan información memorable.
 */
function hasIntentionPattern(text: string): boolean {
  return INTENTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Calcula la relevancia entre las categorías del mensaje actual
 * y las de un mensaje anterior, considerando conexiones cross-imperio.
 *
 * Retorna un valor entre 0 (sin relación) y 1 (relación directa fuerte).
 */
function calculateRelevance(
  currentCategories: Map<string, number>,
  pastCategories: Map<string, number>
): number {
  if (currentCategories.size === 0 || pastCategories.size === 0) return 0;

  let directMatchScore = 0;
  let crossMatchScore = 0;
  let totalWeight = 0;

  for (const [category, currentCount] of currentCategories) {
    const weight = currentCount;
    totalWeight += weight;

    // Coincidencia directa en la misma categoría
    if (pastCategories.has(category)) {
      directMatchScore += weight * 1.0;
    }

    // Coincidencia cross-imperio (peso reducido)
    const linkedCategories = CROSS_IMPERIO_LINKS[category] || [];
    for (const linked of linkedCategories) {
      if (pastCategories.has(linked)) {
        crossMatchScore += weight * 0.5;
      }
    }
  }

  if (totalWeight === 0) return 0;

  // La puntuación máxima teórica es totalWeight * 1.0 (todas las categorías
  // coinciden directamente). Normalizamos a [0, 1].
  const maxPossibleScore = totalWeight * 1.0;
  const rawScore = (directMatchScore + crossMatchScore) / maxPossibleScore;

  // Bonus por intención: si el mensaje anterior expresa un objetivo/compromiso
  // y hay alguna conexión temática, aumentamos la relevancia
  // (se aplica después, en la función principal)

  return Math.min(rawScore, 1.0);
}

/**
 * Formatea una fecha relativa en español, similar a daysAgo() en mentor-context.
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffDays < 14) return 'la semana pasada';
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 60) return 'el mes pasado';
  return `hace ${Math.floor(diffDays / 30)} meses`;
}

/**
 * Extrae un fragmento relevante del mensaje anterior.
 * Prioriza la parte que contiene la intención/compromiso.
 * Trunca si es demasiado largo.
 */
function extractRelevantFragment(message: string, matchedCategories: Set<string>): string {
  // Intentar encontrar la oración que contiene una intención
  const sentences = message.split(/[.!?\n]+/).filter(s => s.trim().length > 0);

  // Primero: buscar una oración con patrón de intención
  for (const sentence of sentences) {
    if (hasIntentionPattern(sentence)) {
      return truncateFragment(sentence.trim(), 120);
    }
  }

  // Segundo: usar las primeras 1-2 oraciones
  const fragment = sentences.slice(0, 2).join('. ').trim();
  return truncateFragment(fragment, 120);
}

function truncateFragment(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace <= maxLen * 0.5) return truncated.trim() + '…';
  return truncated.slice(0, lastSpace).trim() + '…';
}

/**
 * Genera el snippet de continuidad a partir de los hits encontrados.
 * El snippet se inyecta en el prompt de forma natural.
 */
function buildSnippet(hits: ContinuityHit[]): string {
  if (hits.length === 0) return '';

  const parts: string[] = [];

  for (const hit of hits) {
    const timeStr = formatRelativeTime(hit.date);
    parts.push(`${timeStr}: "${hit.fragment}"`);
  }

  const block = parts.join('\n');

  // Verificar longitud máxima
  if (block.length > MAX_SNIPPET_LENGTH) {
    // Reducir a los hits más relevantes
    const reduced = hits.slice(0, 2);
    const reducedBlock = reduced
      .map(h => {
        const timeStr = formatRelativeTime(h.date);
        return `${timeStr}: "${h.fragment}"`;
      })
      .join('\n');
    return reducedBlock;
  }

  return block;
}

// ─── Tipos internos ───

interface PastMessage {
  role: string;
  content: string;
  createdAt: Date;
  threadTitle: string;
}

interface ContinuityHit {
  /** Fragmento del mensaje anterior relevante */
  fragment: string;
  /** Fecha del mensaje */
  date: Date;
  /** Puntuación de relevancia (0-1) */
  relevance: number;
  /** Categorías que coincidieron */
  matchedCategories: Set<string>;
  /** Si el mensaje contenía un patrón de intención */
  hasIntention: boolean;
}

// ─── Función principal exportada ───

/**
 * Contextual Continuity Engine
 *
 * Analiza el mensaje actual del usuario, busca en conversaciones anteriores
 * información relacionada, y si encuentra continuidad relevante, genera
 * un snippet que se inyecta en el prompt del sistema.
 *
 * REGLAS FUNDAMENTALES:
 * 1. Solo se ejecuta si hay categorías temáticas en el mensaje actual
 * 2. Solo busca en hilos ANTERIORES al actual (no en la conversación en curso)
 * 3. Solo inyecta si la relevancia supera el umbral
 * 4. Nunca recupera información que no aporte valor
 * 5. Si falla, retorna snippet vacío (non-blocking)
 * 6. PREMIUM busca en más hilos que FREE
 */
export async function buildContinuityContext(input: ContinuityInput): Promise<ContinuityResult> {
  const emptyResult: ContinuityResult = {
    snippet: '',
    threadsSearched: 0,
    hitsFound: 0,
  };

  // Paso 1: Detectar categorías del mensaje actual
  const currentCategories = detectCategories(input.currentMessage);
  if (currentCategories.size === 0) {
    return emptyResult;
  }

  // Paso 2: Buscar mensajes de hilos anteriores
  const threadLimit = getThreadSearchLimit(input.plan);
  let pastMessages: PastMessage[] = [];

  try {
    // Buscar hilos recientes del usuario, excluyendo el actual
    const recentThreads = await db.aIThread.findMany({
      where: {
        userId: input.userId,
        archived: false,
        id: { not: input.currentThreadId },
      },
      orderBy: { updatedAt: 'desc' },
      take: threadLimit,
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    if (recentThreads.length === 0) {
      return emptyResult;
    }

    // Extraer mensajes de cada hilo (solo user messages, los más recientes)
    const threadIds = recentThreads.map(t => t.id);
    const allMessages = await db.aIMessage.findMany({
      where: {
        threadId: { in: threadIds },
        role: 'user',
      },
      orderBy: { createdAt: 'desc' },
      take: threadLimit * MAX_MESSAGES_PER_THREAD,
      select: {
        content: true,
        createdAt: true,
        threadId: true,
      },
    });

    // Mapear threadId → título
    const threadTitleMap = new Map(recentThreads.map(t => [t.id, t.title]));

    // Filtrar mensajes muy cortos (saludos, "ok", etc.) que no aportan contexto
    pastMessages = allMessages
      .filter(m => m.content.trim().length >= 15)
      .map(m => ({
        role: 'user',
        content: m.content.trim(),
        createdAt: m.createdAt,
        threadTitle: threadTitleMap.get(m.threadId) || '',
      }))
      // Ordenar cronológicamente (más antiguo primero) para prioridad
      .reverse();

  } catch {
    // Non-blocking: si la DB falla, continuar sin continuidad
    return emptyResult;
  }

  if (pastMessages.length === 0) {
    return emptyResult;
  }

  // Paso 3: Para cada mensaje anterior, calcular relevancia
  const hits: ContinuityHit[] = [];

  for (const msg of pastMessages) {
    const pastCategories = detectCategories(msg.content);
    const relevance = calculateRelevance(currentCategories, pastCategories);

    if (relevance >= RELEVANCE_THRESHOLD) {
      // Determinar qué categorías coincidieron (directas o cross-imperio)
      const matchedCategories = new Set<string>();

      for (const category of currentCategories.keys()) {
        if (pastCategories.has(category)) {
          matchedCategories.add(category);
        }
        const linked = CROSS_IMPERIO_LINKS[category] || [];
        for (const l of linked) {
          if (pastCategories.has(l)) {
            matchedCategories.add(l);
          }
        }
      }

      const hasIntention = hasIntentionPattern(msg.content);
      const fragment = extractRelevantFragment(msg.content, matchedCategories);

      // Bonus por intención: los compromisos/objetivos son más valiosos
      const finalRelevance = hasIntention
        ? Math.min(relevance * 1.3, 1.0)
        : relevance;

      hits.push({
        fragment,
        date: msg.createdAt,
        relevance: finalRelevance,
        matchedCategories,
        hasIntention,
      });
    }
  }

  if (hits.length === 0) {
    return {
      snippet: '',
      threadsSearched: threadLimit,
      hitsFound: 0,
    };
  }

  // Paso 4: Priorizar hits
  // 1. Hits con intención primero (objetivos, compromisos)
  // 2. Luego por relevancia
  // 3. Más recientes primero (como desempate)
  hits.sort((a, b) => {
    // Intención tiene prioridad
    if (a.hasIntention !== b.hasIntention) {
      return a.hasIntention ? -1 : 1;
    }
    // Luego por relevancia
    if (Math.abs(b.relevance - a.relevance) > 0.05) {
      return b.relevance - a.relevance;
    }
    // Desempate: más reciente primero
    return b.date.getTime() - a.date.getTime();
  });

  // Tomar los mejores hits
  const topHits = hits.slice(0, MAX_HITS);

  // Paso 5: Generar snippet
  const snippet = buildSnippet(topHits);

  if (!snippet.trim()) {
    return {
      snippet: '',
      threadsSearched: threadLimit,
      hitsFound: hits.length,
    };
  }

  // Formatear como bloque de instrucción para el sistema
  const formattedSnippet = [
    '',
    '── Continuidad contextual ──',
    'El usuario mencionó anteriormente (usa esta información SOLO si encaja naturalmente con lo que te acaba de decir, nunca la fuerces):',
    snippet,
    '── Fin de continuidad ──',
    '',
  ].join('\n');

  return {
    snippet: formattedSnippet,
    threadsSearched: threadLimit,
    hitsFound: topHits.length,
  };
}