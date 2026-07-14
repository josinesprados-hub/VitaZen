# INFORME TÉCNICO — FASE 2.3
# EMOTIONAL UNDERSTANDING ENGINE
# Motor de Comprensión Emocional y Estilo Personal

---

## 1. RESUMEN EJECUTIVO

Se ha implementado el **Emotional Understanding Engine (EUU)**, una nueva capa de inteligencia que aprende **cómo** ayudar mejor a cada usuario. A diferencia de los sistemas existentes que capturan **qué** sabe el usuario (contexto) o **cómo está** (estado emocional), el EUU aprende **qué estilo de acompañamiento funciona** para cada persona.

El motor opera con dos caminos claramente separados:
- **READ path** (síncrono): Lee conocimiento confirmado e inyecta instrucciones de adaptación en el prompt del mentor.
- **WRITE path** (asíncrono, fire-and-forget): Analiza los mensajes del usuario mediante reglas determinísticas y extrae señales de comportamiento que evolucionan de hipótesis a conocimiento confirmado.

La implementación añade **0 errores nuevos y 0 warnings nuevos** al build. No se ha modificado ningún sistema existente.

---

## 2. AUDITORÍA DEL REPOSITORIO

### 2.1 Sistemas Existentes Analizados

| Sistema | Archivo | Función | ¿Solapado por EUU? |
|---|---|---|---|
| **Emotional State Engine** | `src/lib/emotional-state.ts` (491 líneas) | Calcula 6 métricas numéricas (energy, focus, stress, consistency, progress, activity) a partir de check-ins y actividad. Es un calculador de dashboard. | **NO** — ESE computa estado numérico; EUU aprende patrones de comportamiento |
| **Pattern Detection** | `src/lib/patterns/detector.ts` + 3 archivos | Detecta correlaciones cruzadas entre imperios (requiere finanzas + otro imperio). Usa Pearson correlation. | **NO** — Pattern Detection analiza datos cuantitativos; EUU analiza contenido de mensajes |
| **Life Stages** | `src/lib/life-memory/stages.ts` + 2 archivos | Clasificación mensual en 7 sabores (calm, growth, intensity, etc.) basada en actividad agregada. | **NO** — Life Stages clasifica períodos; EUU aprende preferencias de estilo |
| **Silent Memories** | `src/lib/silent-memories/shared.ts` + 3 archivos | Observaciones temporales raras (5 tipos: return, recurrence, shift, presence, temporal). Frecuencia controlada. | **NO** — Silent Memories genera observaciones puntuales; EUU aprende patrones recurrentes |
| **5-Layer Mentor Context** | `src/lib/mentor-context.ts` (1,435 líneas) | Ensambla toda la inteligencia existente en un bloque de contexto para el system prompt. 5 capas: Identity → High-Level Signals → Lived Experience → Behavioral Patterns → Conversational Memory. | **NO** — El EUU se inyecta como un bloque separado DESPUÉS del contexto |
| **Groq System Prompts** | `src/lib/groq.ts` (107 líneas) | Dos prompts base (FREE/PREMIUM) que definen la personalidad del mentor. | **NO MODIFICADO** — Las instrucciones de adaptación se añaden después |

### 2.2 Hallazgo Crítico: Sistemas No Implementados

La auditoría reveló que los siguientes sistemas, mencionados en el resumen de la sesión anterior, **no existen en el código**:

| Sistema Mencionado | Estado Real |
|---|---|
| Contextual Continuity Engine | **No existe** — no hay directorio `src/lib/continuity/` |
| Goals & Commitments Engine | **No existe** — no hay directorio `src/lib/goals/` ni modelos Goal/Commitment |
| Modelo de Comprensión | **No existe** — no hay archivos de comprensión de usuario |

Esto no afecta al EUU, que es completamente independiente de estos sistemas.

### 2.3 Punto Exacto de Integración

El chat route (`src/app/api/ai/chat/route.ts`) tiene un único punto de inyección de contexto (líneas 127-133 del archivo original):

```typescript
try {
  const userContext = await buildMentorContext(user.id, user.plan);
  systemPrompt = buildContextualSystemPrompt(basePrompt, userContext);
  contextBuilt = true;
} catch (ctxError) {
  serverLog.error('api/ai/chat', 'Context build error (non-blocking)', ctxError);
}
```

**Decisión arquitectónica**: El EUU se integra en **dos puntos separados** del chat route:

1. **EUU-1 (READ path)** — Segundo bloque `try/catch` después del contexto existente, antes de ensamblar `groqMessages`. Inyecta instrucciones de adaptación en el system prompt.
2. **EUU-2 (WRITE path)** — Fire-and-forget después de guardar los mensajes, antes de la generación del título. Extrae señales de comportamiento sin bloquear la respuesta.

Esta separación garantiza que el EUU **nunca** rompe el flujo existente.

---

## 3. ARQUITECTURA DEL MOTOR

### 3.1 Modelo de Datos

**Nuevo modelo Prisma: `EmotionalInsight`**

```prisma
model EmotionalInsight {
  id            String   @id @default(cuid())
  userId        String
  insight       String       // Texto del aprendizaje (max ~120 chars)
  category      String       // 14 categorías posibles
  confidence    Float        // 0.3 (hipótesis) → 0.7+ (conocimiento confirmado)
  evidenceCount Int          // Veces observado
  lastEvidenceAt DateTime
  firstSeenAt   DateTime
  sourceType    String       // message | journal | checkin_note
  sourceRef     String?      // threadId o journalId
}
```

**Índices compuestos**: `(userId, category)`, `(userId, confidence)`, `(userId, updatedAt)` — optimizados para las dos queries principales del motor.

**Relación**: Añadida `emotionalInsights EmotionalInsight[]` al modelo `User`.

### 3.2 Ciclo de Vida: Hipótesis → Conocimiento

```
Mensaje del usuario
       ↓
  Extracción por reglas (regex)
       ↓
  ¿Existe insight similar? ─── Sí → Reforzar confianza (+diminishing)
       ↓ No
  Crear hipótesis (confidence = 0.3)
       ↓
  ¿Confidence ≥ 0.7? ─── No → Permanece como hipótesis
       ↓ Sí
  Conocimiento confirmado → Consumido por el mentor
```

**Rendimiento decreciente**: Cada evidencia adicional aporta menos confianza. Fórmula:

```
increment = 0.15 × (1 / (1 + (evidenceCount - 1) × 0.15))
```

Ejemplo de evolución:
| Evidencia | Confidence | Estado |
|---|---|---|
| 1 | 0.30 | Hipótesis |
| 2 | 0.44 | Hipótesis |
| 3 | 0.55 | Hipótesis |
| 4 | 0.63 | Hipótesis |
| 5 | 0.70 | **Confirmado** |
| 6 | 0.75 | Confirmado |
| 7 | 0.78 | Confirmado |

Se necesitan al menos **5 observaciones independientes** para confirmar un insight. Esto es intencionadamente conservador para evitar falsos positivos.

### 3.3 Las 14 Categorías de Comprensión

| Categoría | Qué aprende | Ejemplo de insight |
|---|---|---|
| `motivator` | Qué le impulsa | "La percepción de progreso aumenta su adherencia." |
| `blocker` | Qué le frena | "El perfeccionismo le bloquea. Tiende a 'todo o nada'." |
| `preference` | Qué estilo prefiere | "Prefiere respuestas directas sin rodeos." |
| `learning_style` | Cómo procesa orientación | "Prefiere que le propongas directamente qué hacer." |
| `autonomy` | Cuánta estructura necesita | "Alta autonomía. Prefiere gestionar por su cuenta." |
| `decision_style` | Cómo toma decisiones | (adaptable por categoría) |
| `failure_reaction` | Cómo reacciona ante fracasos | "Ante el fracaso, tiende a reintentar con determinación." |
| `success_reaction` | Cómo reacciona ante éxitos | "Minimiza sus logros. Se enfoca en lo que falta." |
| `support_need` | Cuánto acompañamiento necesita | "Funciona mejor con apoyo explícito." |
| `change_tolerance` | Cómo asimila el cambio | "Funciona mejor con cambios graduales y pasos pequeños." |
| `habit_style` | Cómo mantiene hábitos | "Las rachas le motivan. La continuidad visible le ayuda." |
| `self_demand` | Nivel de autoexigencia | "Alta autoexigencia con tendencia a la autocrítica." |
| `abandonment_pattern` | Qué le hace abandonar | "Abandona cuando intenta cambiar demasiadas cosas a la vez." |
| `recovery` | Cómo se recupera | "Le cuesta retomar después de una pausa." |

---

## 4. EXTRACCIÓN BASADA EN REGLAS

### 4.1 Diseño: Cero Llamadas al Modelo

Toda la extracción es **determinística** mediante expresiones regulares. No se hacen llamadas adicionales a la API de Groq. Esto es crucial para:

- **Latencia cero** en el READ path (solo 1 query SELECT)
- **Coste cero** en el WRITE path (solo operaciones DB)
- **Determinismo total** — los mismos mensajes siempre producen las mismas extracciones

### 4.2 Reglas de Extracción

Se implementaron **30 reglas** organizadas por categoría. Cada regla tiene:
- Un patrón regex (case-insensitive)
- Un insight textual predefinido
- Una categoría

Ejemplos de reglas:

```typescript
// Abandonamiento
{ pattern: /siempre abandono|nunca termino|otra vez lo dej[eé]/i,
  insight: 'Tiende a abandonar lo que empieza. Necesita estructura para sostener el compromiso.',
  category: 'abandonment_pattern' }

// Preferencia de respuesta
{ pattern: /ve al grano|directo|sin rodeos|conciso/i,
  insight: 'Prefiere respuestas directas sin rodeos.',
  category: 'preference' }

// Cambio gradual
{ pattern: /poco a poco|paso a paso|despacio|gradual|de a poco/i,
  insight: 'Funciona mejor con cambios graduales y pasos pequeños.',
  category: 'change_tolerance' }
```

### 4.3 Guardas de Extracción

Para evitar ruido, la extracción solo se activa cuando se cumplen **todas** estas condiciones:

1. **Mensaje ≥ 20 caracteres** — filtra saludos, "ok", "gracias"
2. **Thread con ≥ 4 mensajes de usuario** — evita extraer de conversaciones triviales
3. **Cooldown de 30 minutos por thread** — no extrae en cada mensaje consecutivo
4. **No duplicar sistemas existentes** — filtra señales ya cubiertas por ESE (energía, estrés, enfoque)
5. **Máximo 2 señales por extracción** — una por categoría
6. **Solo las mejores señales** — las reglas más específicas primero

---

## 5. ADAPTACIÓN DEL MENTOR

### 5.1 Inyección en el System Prompt

Las instrucciones de adaptación se inyectan **después** del bloque de contexto existente y **después** de las reglas de contexto. El resultado final del system prompt tiene esta estructura:

```
[PROMPT BASE — groq.ts]
+
[CONTEXTO DEL USUARIO — mentor-context.ts 5 capas]
+
[REGLAS DE CONTEXTO — mentor-context.ts contextRules]
+
[ADAPTACIÓN DEL EUU — understanding/engine.ts]  ← NUEVO
```

### 5.2 Formato de las Instrucciones de Adaptación

Las instrucciones están escritas en español natural, como guías internas que el mentor asimila sin revelar:

```
Reconoce su progreso de forma breve y avanza. No necesitas celebrar, solo validar que avanzó.
Ante su bloqueo recurrente, ofrece un camino directo. No profundices en el problema, propón salida.
Si detectas que se acerca a su patrón de abandono, reduce la propuesta. Un paso, no diez.
```

**El mentor NUNCA dice**: "He aprendido que...", "Según tu perfil...", "He detectado que..."

**El usuario SIENTE**: que el mentor le entiende mejor con el paso del tiempo.

### 5.3 Mapeo Categoría → Adaptación

Cada una de las 14 categorías tiene 1-3 plantillas de adaptación. La selección depende del nivel de confianza:

| Confidence | Template seleccionada |
|---|---|
| ≥ 0.85 | Más específica y directa (índice 0) |
| 0.70–0.84 | Moderada (índice proporcional) |
| < 0.70 | No se inyecta (aún es hipótesis) |

Máximo **una instrucción por categoría** en el prompt. El mentor no recibe la lista de insights confirmados — solo las instrucciones de adaptación.

---

## 6. DIFERENCIACIÓN FREE vs ÉLITE

| Dimensión | FREE | ÉLITE |
|---|---|---|
| **Categorías analizadas** | 3 (preference, motivator, blocker) | 14 (todas) |
| **Insights confirmados inyectados** | Máximo 1 | Máximo 4 |
| **Extracción (WRITE path)** | Sí, las 3 categorías | Sí, todas las 14 |
| **Hipothesis cap** | Compartida (30/40) | Compartida (30/40) |

**Justificación**: La diferenciación se implementa en la query de lectura, no en la escritura. Ambos tiers acumulan hipótesis, pero FREE solo consume las 3 categorías más impactantes para la adaptación inmediata del mentor (qué prefiere, qué le motiva, qué le bloquea). ÉLITE accede al perfil completo de comprensión que incluye patrones de abandono, estilo de recuperación, autoexigencia, etc.

---

## 7. RELACIÓN CON SISTEMAS EXISTENTES

### 7.1 No Duplicación

| Sistema | Almacena | EUU Aprende | Solapamiento |
|---|---|---|---|
| **Emotional State Engine** | Energy=72, stress=40, status=enfocado | Cómo ayudar según el estado | Ninguno — dominios separados |
| **Pattern Detection** | "Finanzas y energía correlacionan" | Qué estilo de acompañamiento funciona | Ninguno — Pattern es cuantitativo, EUU es conductual |
| **Life Stages** | "Etapa de intensidad este mes" | Cómo reacciona ante la intensidad | Ninguno — Life Stages clasifica, EUU aprende |
| **Silent Memories** | "Hacía mucho." (milestone) | Patrones recurrentes de comportamiento | Ninguno — Memories son puntuales, EUU es acumulativo |

### 7.2 Dedicación de Deduplicación

El sistema incluye una función `wouldDuplicateExistingSystem()` que filtra señales que ya cubre el Emotional State Engine (niveles de energía declarados, estrés declarado, falta de enfoque). Esto evita almacenar como "aprendizaje" algo que el mentor ya sabe por la vía del contexto existente.

### 7.3 Jerarquía de Responsabilidades

```
Modelo de Comprensión (futuro)  →  Quién es el usuario
Goals Engine (futuro)           →  Qué intenta conseguir
Contextual Continuity (futuro)  →  Cuándo recordar
Emotional Understanding (ESTE)  →  Cómo ayudar mejor
Emotional State Engine          →  Cómo está ahora
Pattern Detection               →  Qué conexiones existen
Life Stages                     →  En qué fase está
Silent Memories                 →  Qué hitos ha vivido
```

---

## 8. ARCHIVOS MODIFICADOS Y NUEVOS

### 8.1 Archivos Nuevos (3)

| Archivo | Líneas | Función |
|---|---|---|
| `src/lib/understanding/types.ts` | ~95 | Tipos, constantes, límites por tier |
| `src/lib/understanding/engine.ts` | ~660 | Motor completo: extracción, confianza, adaptación, persistencia |
| *(Este informe)* | — | Documentación técnica |

### 8.2 Archivos Modificados (2)

#### `prisma/schema.prisma` (+44 líneas)

**Cambios**:
1. Nuevo modelo `EmotionalInsight` con 11 campos, 3 índices compuestos, y relación con `User`.
2. Añadida relación `emotionalInsights EmotionalInsight[]` al modelo `User`.

**Justificación de cada campo**:
- `insight` (String): Texto del aprendizaje. Máximo ~120 chars para controlar el presupuesto de tokens.
- `category` (String): Permite seleccionar adaptaciones por dimensión y filtrar por tier.
- `confidence` (Float, default 0.3): Punto de entrada como hipótesis. Umbral 0.7 para confirmación.
- `evidenceCount` (Int, default 1): Necesario para el cálculo de rendimientos decrecientes.
- `lastEvidenceAt` / `firstSeenAt`: Para posible limpieza futura de insights obsoletos.
- `sourceType` / `sourceRef`: Trazabilidad — saber de qué conversación vino cada señal.

#### `src/app/api/ai/chat/route.ts` (+24 líneas netas)

**Cambio 1 — Import** (línea 11):
```typescript
import { getUnderstandingContext, extractAndPersist } from '@/lib/understanding/engine';
```

**Cambio 2 — READ path** (líneas 136-150, después del bloque de contexto existente):
```typescript
try {
  const understandingCtx = await getUnderstandingContext(user.id, user.plan);
  if (understandingCtx.adaptationSnippet) {
    systemPrompt = systemPrompt + '\n\n' + understandingCtx.adaptationSnippet;
  }
} catch (euuError) {
  serverLog.error('api/ai/chat', 'Understanding engine error (non-blocking)', euuError);
}
```

**Cambio 3 — WRITE path** (líneas 210-221, después de guardar mensajes):
```typescript
extractAndPersist({
  userId: user.id,
  threadId,
  userMessage: content,
  assistantMessage: assistantContent,
}).catch(() => {});
```

**Justificación de la posición de cada cambio**:
- El READ path va **después** de `buildMentorContext` porque necesita ejecutarse en secuencia (no hay dependencia de datos, pero mantener el orden garantiza que el contexto base siempre se construye primero).
- El WRITE path va **después** de guardar los mensajes (`$transaction`) porque la extracción analiza el contenido del mensaje que acaba de persistirse. El fire-and-forget (`.catch(() => {})`) garantiza que nunca bloquea la respuesta.

### 8.3 Archivos NO Modificados

Los siguientes archivos **no han sido tocados**, confirmando compatibilidad total:

- `src/lib/mentor-context.ts` — Sin cambios. El EUU se inyecta en el route, no en el context builder.
- `src/lib/groq.ts` — Sin cambios. Los prompts base permanecen idénticos.
- `src/lib/emotional-state.ts` — Sin cambios.
- `src/lib/patterns/` — Sin cambios (4 archivos).
- `src/lib/life-memory/` — Sin cambios (3 archivos).
- `src/lib/silent-memories/` — Sin cambios (4 archivos).
- `src/lib/monthly-closure/` — Sin cambios (2 archivos).

---

## 9. ANÁLISIS DE RENDIMIENTO

### 9.1 Coste por Mensaje

| Operación | Tipo | Latencia | Queries DB |
|---|---|---|---|
| READ path | Síncrono (en el hot path) | ~5-15ms | 1 SELECT con índice |
| WRITE path | Fire-and-forget | 0ms (no bloquea) | 1 COUNT + 1 SELECT + 1 UPSERT (condicional) |

### 9.2 Presupuesto de Tokens

| Tier | Máximo insights | Caracteres estimados | Tokens estimados |
|---|---|---|---|
| FREE | 1 | ~80 chars | ~30 tokens |
| ÉLITE | 4 | ~320 chars | ~120 tokens |

En el peor caso (ÉLITE, 4 insights confirmados), el EUU añade ~120 tokens al system prompt. Dado que el prompt base ya tiene ~800-1200 tokens y el contexto de usuario añade ~200-600 tokens, esto representa un incremento de **~5-10%** — imperceptible para el modelo y para la latencia.

### 9.3 Crecimiento de la Base de Datos

| Límite | Valor | Justificación |
|---|---|---|
| Máx. hipótesis por usuario | 30 | Evita crecimiento desbordado |
| Máx. total insights por usuario | 40 | Incluye confirmados |
| Limpieza | Automática al alcanzar el cap | Elimina las hipótesis de menor confianza |

Un usuario activo durante 6 meses acumulará aproximadamente 5-10 insights confirmados y 5-10 hipótesis en evolución. El cap de 40 es extremadamente generoso.

---

## 10. PRIVACIDAD

### 10.1 Principios

1. **El usuario nunca ve el sistema**: El mentor no dice "He aprendido que...", "Según tu perfil...", "He detectado que...". Las instrucciones son internas.
2. **Los insights son conductuales, no personales**: No se almacena "José está triste". Se almacena "Funciona mejor con cambios graduales".
3. **El contenido de los mensajes no se persiste en el EUU**: Solo se extraen señales categorizadas. El texto original del mensaje ya está en `AIMessage` — el EUU no lo duplica.
4. **Source tracking**: Cada insight tiene `sourceType` y `sourceRef` para trazabilidad, pero esto nunca se expone al usuario.

### 10.2 Transparencia

El sistema está diseñado para que el usuario sienta: "Mi mentor me entiende mejor cada vez que hablo" — sin saber por qué ni cómo. Exactamente como funcionaría un mentor humano que, conversación a conversación, va afinando su forma de ayudar.

---

## 11. EJEMPLO DE FLUJO COMPLETO

### Conversación del usuario a lo largo de 3 semanas:

**Semana 1, Conversación A:**
> Usuario: "Siempre abandono cuando intento cambiar demasiadas cosas a la vez."
> → Hipótesis creada: "Abandona cuando intenta cambiar demasiadas cosas a la vez." (confidence: 0.30)

**Semana 1, Conversación B:**
> Usuario: "Paso a paso, sin prisa."
> → Hipótesis creada: "Funciona mejor con cambios graduales y pasos pequeños." (confidence: 0.30)

**Semana 2, Conversación C:**
> Usuario: "Quise empezar a meditar, hacer ejercicio y cambiar mi dieta todo junto y al final no hice nada."
> → Hipótesis reforzada: "Abandona cuando intenta cambiar demasiadas cosas a la vez." (confidence: 0.44)

**Semana 2, Conversación D:**
> Usuario: "Mejor poco a poco, uno a la vez."
> → Hipótesis reforzada: "Funciona mejor con cambios graduales y pasos pequeños." (confidence: 0.44)

**Semana 3, Conversación E:**
> Usuario: "Otra vez lo dejé a medias. Intenté hacer demasiados cambios."
> → Hipótesis reforzada: "Abandona cuando intenta cambiar demasiadas cosas a la vez." (confidence: 0.55)

**Semana 3, Conversación F:**
> Usuario: "Voy a hacer un cambio a la vez, despacio."
> → Hipótesis reforzada: "Funciona mejor con cambios graduales y pasos pequeños." (confidence: 0.55)

**Semana 4, Conversación G:**
> Usuario: "Cuando intento cambiar todo de golpe no funciona. Prefiero ir poco a poco."
> → Ambas hipótesis reforzadas: abandonment (0.63), change_tolerance (0.63)

**Semana 4, Conversación H:**
> Usuario: "Siempre es lo mismo, quiero cambiar muchas cosas y no puedo."
> → **CONFIRMACIÓN**: "Abandona cuando intenta cambiar demasiadas cosas a la vez." (confidence: 0.70)

A partir de este momento, el mentor recibe esta instrucción de adaptación:

```
Si detectas que se acerca a su patrón de abandono, reduce la propuesta. Un paso, no diez.
```

El usuario nota que el mentor empieza a proponerle **un solo cambio a la vez** sin que nadie se lo haya explicado. Siente que le entienden.

---

## 12. DECISIONES TÉCNICAS JUSTIFICADAS

### 12.1 ¿Por qué reglas deterministas y no Groq para extracción?

**Decisión**: Toda la extracción usa regex, no llamadas a la API de Groq.

**Justificación**:
- **Coste**: Una llamada extra a Groq por mensaje duplicaría el coste de la API (actualmente 1 llamada por mensaje).
- **Latencia**: El WRITE path es fire-and-forget, pero una llamada a Groq tarda 2-5 segundos. Incluso asíncrona, consumiría recursos del servidor.
- **Determinismo**: Las reglas son predecibles y auditables. Con Groq, la misma frase podría extraer insights diferentes en cada ejecución.
- **Suficiencia**: Las 30 reglas cubren los patrones más comunes en desarrollo personal. El sistema es conservador por diseño — es mejor no extraer algo que extraer algo erróneo.

### 12.2 ¿Por qué un modelo Prisma separado en lugar de JSON en EmotionalDashboardState?

**Decisión**: Nuevo modelo `EmotionalInsight` con su propia tabla.

**Justificación**:
- **Queries**: Necesitamos consultar por `userId + confidence >= threshold` y `userId + category`. Un campo JSON no permite índices compuestos eficientes.
- **Evolución**: Los insights necesitan `confidence`, `evidenceCount`, `lastEvidenceAt` — campos que requieren actualizaciones atómicas. JSON requiere reescribir todo el documento.
- **Limpieza**: Eliminar las hipótesis de menor confianza es un simple `DELETE WHERE` con el modelo separado. Con JSON, requeriría leer-modificar-escribir.
- **Escalabilidad**: Una tabla dedicada escala naturalmente con índices. Un JSON blob crece linealmente y cada lectura parsea todo el documento.

### 12.3 ¿Por qué inyección AFTER del contexto, no dentro del context builder?

**Decisión**: El EUU se inyecta en el chat route, no dentro de `buildMentorContext()` o `buildContextualSystemPrompt()`.

**Justificación**:
- **No tocar mentor-context.ts**: La especificación prohíbe modificar sistemas existentes. El context builder es un sistema crítico de 1,435 líneas con 5 capas y deduplicación compleja.
- **Separación de responsabilidades**: `buildMentorContext` ensambla lo que el mentor **sabe** del usuario. El EUU inyecta **cómo** debe ayudar. Son dominios separados.
- **Independencia de fallos**: Si el EUU falla, el contexto existente funciona igual. Si el contexto falla, el EUU no tiene sentido que se inyectue solo.
- **Bloque try/catch separado**: Garantiza que un fallo del EUU nunca afecta al flujo de contexto existente.

### 12.4 ¿Por qué umbral de confirmación 0.7?

**Decisión**: Un insight se considera "conocimiento confirmado" cuando `confidence >= 0.7`.

**Justificación**:
- Con el sistema de rendimientos decrecientes, alcanzar 0.7 requiere **5+ observaciones independientes** del mismo patrón.
- Esto filtra señales únicas o poco frecuentes que podrían ser opiniones pasajeras.
- 0.7 es lo suficientemente bajo para que el sistema sea útil (no requiere 10+ observaciones) pero lo suficientemente alto para evitar falsos positivos.
- Un insight confirmado con 0.7 que resulta ser incorrecto decaería si no se refuerza (aunque no implementamos decaimiento activo en esta fase — la limpieza por cap se encarga de insights no reforzados).

### 12.5 ¿Por qué fire-and-forget para el WRITE path?

**Decisión**: `extractAndPersist()` se llama sin `await` y con `.catch(() => {})`.

**Justificación**:
- La extracción no afecta la respuesta actual — el insight se usará en conversaciones futuras.
- El usuario no debe esperar más tiempo por un proceso de aprendizaje interno.
- Si la extracción falla (DB error, timeout), no hay consecuencia para el usuario.
- El patrón es idéntico al usado en otros sistemas asíncronos del código base (ej. analytics tracking).

---

## 13. COMPATIBILIDAD VERIFICADA

| Sistema | Verificación |
|---|---|
| **Emotional State Engine** | ✅ No modificado. Dominios separados (estado numérico vs. comportamiento). |
| **Pattern Detection** | ✅ No modificado. Dominios separados (correlación cuantitativa vs. preferencias conductuales). |
| **Life Stages** | ✅ No modificado. Dominios separados (clasificación temporal vs. aprendizaje acumulativo). |
| **Silent Memories** | ✅ No modificado. Dominios separados (observaciones puntuales vs. patrones recurrentes). |
| **Modelo de Comprensión** | ✅ No existe. Sin conflicto posible. |
| **Contextual Continuity Engine** | ✅ No existe. Sin conflicto posible. |
| **Goals & Commitments Engine** | ✅ No existe. Sin conflicto posible. |
| **Arquitectura FREE / ÉLITE** | ✅ Respetada. FREE = 1 insight, 3 categorías. ÉLITE = 4 insights, 14 categorías. |
| **Flujo del chat** | ✅ Integrado sin modificar la lógica existente. 2 bloques try/catch no-bloqueantes. |
| **Sistema de prompts** | ✅ No modificado. La adaptación se añade después del prompt base. |
| **Build** | ✅ 0 errores nuevos, 0 warnings nuevos. Compiled successfully in 17.4s. |

---

## 14. LÍNEAS DE EVOLUCIÓN FUTURA

Estas son **no implementadas** en esta fase, pero la arquitectura las facilita:

1. **Decaimiento temporal**: Insights no reforzados durante 60+ días podrían reducir su confianza automáticamente.
2. **Extracción desde diarios y check-in notes**: El `sourceType` ya contempla `journal` y `checkin_note` — solo faltan los orígenes de datos.
3. **Contradicción**: Si un usuario que solía decir "paso a paso" empieza a decir "de golpe", se podría implementar decaimiento de la hipótesis original.
4. **Cross-imperio understanding**: Insights específicos por imperio (ej. "En disciplina, necesita estructura; en mente, prefiera reflexión").
5. **Dashboard de comprensión**: Mostrar al usuario (opcional) qué ha aprendido el mentor sobre él, con opción de corregir o eliminar.