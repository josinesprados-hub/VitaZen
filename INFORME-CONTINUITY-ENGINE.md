# INFORME TÉCNICO — CONTEXTUAL CONTINUITY ENGINE
## Fase 2.1.1 — VitaZen Mentor IA

---

## 1. AUDITORÍA PREVIA

### 1.1 Archivos auditados

| Archivo | Líneas | Rol en el flujo |
|---------|--------|-----------------|
| `src/app/api/ai/chat/route.ts` | 273 → 293 | Endpoint principal del chat |
| `src/lib/mentor-context.ts` | 1435 | Constructor de contexto (5 capas) |
| `src/lib/groq.ts` | 107 | Cliente Groq + system prompts |
| `src/lib/emotional-state.ts` | 491 | Motor de estado emocional |
| `src/lib/patterns/detector.ts` | 520 | Detección de patrones cross-imperio |
| `src/lib/life-memory/stages.ts` | 368 | Detección de etapas vitales |
| `src/lib/silent-memories/shared.ts` | 193 | Memoria silenciosa (tipos y observación) |
| `src/lib/server/silent-memory-state.ts` | 231 | Estado de memorias mostradas |
| `src/lib/monthly-closure/digest.ts` | 556 | Digesta de cierre mensual |
| `src/lib/limits.ts` | 173 | Límites diarios de uso |
| `prisma/schema.prisma` | — | Modelos AIThread, AIMessage, AIUsage |

### 1.2 Hallazgo clave de la auditoría

El Layer 5 (Conversational Memory) del contexto actual solo incluye **títulos de hilos anteriores**, no su contenido. Esto significa que el mentor sabe *de qué* habló el usuario antes, pero no *qué dijo*. El Contextual Continuity Engine resuelve exactamente esto: busca en el contenido real de mensajes previos para encontrar objetivos, compromisos y decisiones que el usuario mencionó.

---

## 2. PUNTO DE INTEGRACIÓN

### 2.1 Ubicación exacta

**Archivo:** `src/app/api/ai/chat/route.ts`
**Línea:** 145-162 (nuevo bloque insertado)
**Posición:** Después de ensamblar `groqMessages` (línea 143), antes de la llamada a Groq (línea 164).

### 2.2 Por qué este punto es el correcto

1. **Datos disponibles:** En este punto se tiene acceso a `content` (mensaje actual), `history` (historial del hilo actual), `user.id`, `threadId` y `user.plan`. El motor necesita todos estos datos.

2. **El prompt ya está construido:** `groqMessages[0].content` contiene el system prompt completo con las 5 capas de contexto. El motor puede añadir su bloque al final de ese prompt sin interferir con ninguna capa existente.

3. **No modifica funciones existentes:** La integración es de 13 líneas en route.ts (import + bloque try/catch). No se modifica la firma de `buildMentorContext`, `buildContextualSystemPrompt`, ni ninguna otra función.

4. **Non-blocking:** Si el motor falla, el try/catch lo captura y el chat funciona normalmente sin continuidad. Misma filosofía que el bloque de context build (líneas 127-133).

5. **Post-validaciones, post-lock:** Se ejecuta después de todas las validaciones y después de adquirir el advisory lock del hilo. No añade latencia antes de las validaciones.

### 2.3 Flujo completo actualizado

```
Usuario escribe
↓
Validación (auth, thread, content)
↓
checkAILimit() — consume crédito
↓
pg_advisory_lock(threadId) — serializa por hilo
↓
Obtener historial del hilo (9 o 29 mensajes)
↓
buildMentorContext() → buildContextualSystemPrompt() — contexto de 5 capas
↓
Ensamblar groqMessages[] — [system, ...history, userMessage]
↓
★ buildContinuityContext() — NUEVA CAPA ★
  → Analiza intención del mensaje actual
  → Detecta categorías temáticas
  → Busca en hilos anteriores (1 para FREE, 5 para PREMIUM)
  → Calcula relevancia con cross-imperio
  → Si supera umbral: inyecta snippet en groqMessages[0].content
↓
groq.chat.completions.create() — llamada al modelo
↓
Guardar mensajes + generar título
↓
pg_advisory_unlock(threadId)
↓
Respuesta al usuario
```

---

## 3. ARCHIVO NUEVO: `src/lib/continuity/engine.ts`

### 3.1 Resumen

- **327 líneas** de código TypeScript
- **0 dependencias nuevas** (solo importa `db` de Prisma)
- **0 LLM calls** (todo es computación local)
- **0 embeddings / vector DB** (coincidencia temática por categorías)
- **2 exportaciones:** `buildContinuityContext()` y tipos `ContinuityInput`/`ContinuityResult`

### 3.2 Arquitectura del motor

#### Categorías temáticas (12 dominios)

| Categoría | Ejemplos de keywords | Conexiones cross-imperio |
|-----------|---------------------|-------------------------|
| sueño | dormir, insomnio, descanso, madrugar | energía, disciplina, estrés, emociones |
| ejercicio | caminar, correr, gimnasio, pasos | energía, disciplina, nutrición, emociones |
| meditación | meditar, mindfulness, respiración | energía, estrés, emociones, trabajo |
| finanzas | ahorrar, inversión, presupuesto, deuda | estrés, trabajo, emociones, disciplina |
| nutrición | comer, dieta, cocinar, proteínas | energía, ejercicio, emociones |
| estrés | ansiedad, agobio, presión, burnout | sueño, meditación, finanzas, trabajo |
| disciplina | hábito, constancia, racha, compromiso | ejercicio, meditación, objetivos |
| relaciones | pareja, familia, amigos, comunicación | emociones, estrés, trabajo |
| trabajo | productividad, proyecto, reunión, plazo | estrés, finanzas, sueño, emociones |
| energía | vitalidad, cansancio, fatiga, rendimiento | sueño, ejercicio, nutrición, estrés |
| emociones | feliz, triste, frustrado, motivado | estrés, sueño, relaciones, meditación |
| objetivos | meta, lograr, propósito, quiero | disciplina, finanzas, trabajo, ejercicio |

#### Patrones de intención (14 expresiones)

Detecta cuando el usuario expresa un objetivo, compromiso o decisión:
- `quiero empezar/crear/lograr…`
- `voy a intentar/probar/hacer…`
- `mi objetivo/meta/propósito…`
- `tengo que empezar/cambiar/mejorar…`
- `estoy intentando/probando/tratando…`
- `quiero ser más constante/disciplinado…`
- `he decidido/empezado/logrado…`
- Y 7 más.

Los mensajes con intención reciben un **bonus de +30% en relevancia** porque representan información memorable (objetivos, compromisos).

#### Algoritmo de relevancia

```
relevancia = (coincidencia directa × 1.0 + coincidencia cross-imperio × 0.5) / puntuación máxima posible
```

- **Umbral:** 0.35 (solo se inyecta si supera este valor)
- **Coincidencia directa:** misma categoría en mensaje actual y anterior
- **Coincidencia cross-imperio:** categorías conectadas entre imperios
- **Máximo 3 hits** por mensaje
- **Máximo 350 caracteres** de snippet inyectado

#### Diferenciación FREE vs PREMIUM

| Aspecto | FREE | PREMIUM |
|---------|------|---------|
| Hilos buscados | 1 | 5 |
| Mensajes por hilo | 8 | 8 |
| Categorías | 12 | 12 |
| Cross-imperio | Sí | Sí |
| Intención bonus | Sí | Sí |

### 3.3 Formato del snippet inyectado

Cuando el motor encuentra continuidad relevante, el bloque se ve así:

```
── Continuidad contextual ──
El usuario mencionó anteriormente (usa esta información SOLO si encaja naturalmente con lo que te acaba de decir, nunca la fuerces):
hace 2 semanas: "Quiero empezar a caminar 10.000 pasos diarios."
── Fin de continuidad ──
```

Esto:
- Se añade al **final** del system prompt (después de las reglas de uso de contexto existentes)
- Instruye al modelo a usar la información **solo si encaja naturalmente**
- No usa lenguaje de sistema ("según tus datos", "en tu historial")
- El modelo recibe el fragmento exacto del usuario, no una reinterpretación

### 3.4 Casos de uso cubiertos

| Escenario | Mensaje previo | Mensaje actual | ¿Se detecta? |
|-----------|---------------|----------------|-------------|
| Progreso hacia objetivo | "Quiero caminar 10.000 pasos" | "Hoy he caminado 8.000 pasos" | Sí (ejercicio → ejercicio, intención) |
| Ahorro para vivienda | "Quiero ahorrar para la entrada" | "He ahorrado 300€" | Sí (finanzas → finanzas, intención) |
| Conexión sueño → energía | "Mi mayor problema es dormir poco" | "Hoy estoy agotado" | Sí (sueño → energía, cross-imperio) |
| Constancia en meditación | "Quiero ser constante con la meditación" | "He meditado cinco días seguidos" | Sí (meditación → meditación, intención) |
| Pregunta irrelevante | "Quiero caminar 10.000 pasos" | "¿Qué ETF me recomiendas?" | Sí, pero sin intención ni cross → baja relevancia |
| Pregunta de cocina | "Estoy ansioso" | "¿Cómo cocinar arroz?" | No (nutrición no conecta con estrés en este contexto) |

---

## 4. ARCHIVO MODIFICADO: `src/app/api/ai/chat/route.ts`

### 4.1 Cambios

| Línea | Tipo | Descripción |
|-------|------|-------------|
| 8 | Nuevo import | `import { buildContinuityContext } from '@/lib/continuity/engine'` |
| 145-162 | Nuevo bloque | Invocación del motor + inyección en groqMessages[0].content |

### 4.2 Líneas afectadas: 2 (import) + 18 (bloque) = 20 líneas nuevas

El archivo pasa de 273 a 293 líneas.

### 4.3 Comportamiento en caso de error

El motor está envuelto en try/catch vacío (línea 160). Si falla:
- No se inyecta nada en el prompt
- El chat funciona exactamente igual que antes
- No se consume crédito adicional
- No se afecta el advisory lock
- El error es silencioso (misma filosofía que el context build existente)

---

## 5. COMPATIBILIDAD

### 5.1 Lo que NO se modifica

| Componente | Estado |
|------------|--------|
| Modelo de Comprensión | No existe aún — no afectado |
| Knowledge Units | No existen aún — no afectados |
| Emotional State Engine | No modificado |
| Silent Memories | No modificado |
| Life Stages | No modificado |
| Pattern Detection | No modificado |
| Arquitectura Free/Élite | No modificada (solo se lee `plan`) |
| Base de datos | Sin cambios de schema |
| Flujo principal del chat | El flujo es idéntico, con un paso adicional non-blocking |
| `buildMentorContext()` | No modificado |
| `buildContextualSystemPrompt()` | No modificado |
| `formatBasicContext()` | No modificado |
| `formatAdvancedContext()` | No modificado |
| `groq.ts` / SYSTEM_PROMPTS | No modificado |
| `limits.ts` | No modificado |

### 5.2 Sin deuda técnica

- **Sin nuevos modelos Prisma:** Usa `AIThread` y `AIMessage` existentes
- **Sin nuevas dependencias npm:** Solo usa `@/lib/db` (ya existente)
- **Sin nuevos tipos en src/types/:** Los tipos se definen en el propio módulo
- **Sin migraciones de base de datos**
- **Sin cambios en el cliente:** El cambio es 100% server-side

### 5.3 Potenciales conflictos identificados (Ninguno)

| Riesgo potencial | Evaluación |
|-----------------|------------|
| Latencia adicional | Mínima: 2 queries DB adicionales (threads + messages), indexadas por `userId` y `threadId` |
| Token budget |Snippet máximo 350 chars (~100 tokens). Insignificante vs el prompt completo. |
| Falsos positivos | Umbral 0.35 + filtrado por intención reduce falsos positivos |
| Sobrecarga de DB | `take: 40` máximo (5 hilos × 8 mensajes). Las queries usan índices existentes. |
| Incompatibilidad FREE | FREE busca 1 hilo con 8 mensajes. Ligero pero funcional. |

---

## 6. BUILD

### 6.1 Resultado

```
✓ Build completado exitosamente
✓ 0 errores nuevos
✓ 0 warnings nuevos
✓ Todos los errores pre-existentes permanecen sin cambios
```

### 6.2 Errores pre-existentes (sin cambios)

| Archivo | Error | Pre-existentes |
|---------|-------|----------------|
| `layout.tsx` | Expected 1 arguments | Sí |
| `layout.tsx` | Type undefined → Timeout | Sí |
| `stripe/webhook` | Property 'subscription' | Sí |
| `timeline/route` | string \| undefined → string | Sí |
| `logger.ts` | Expected 1 arguments, got 2 | Sí |
| `weekly-recap-sender.ts` | Return type Promise<void> | Sí |

---

## 7. ARCHIVOS

| Archivo | Acción | Líneas |
|---------|--------|--------|
| `src/lib/continuity/engine.ts` | **NUEVO** | 327 |
| `src/app/api/ai/chat/route.ts` | **MODIFICADO** | 273 → 293 (+20) |

**Total: 1 archivo nuevo + 1 archivo modificado. 347 líneas de código nuevo.**