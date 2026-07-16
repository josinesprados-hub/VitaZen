# INFORME TÉCNICO — GOALS & COMMITMENTS ENGINE
## Fase 2.2 — VitaZen Mentor IA

---

## 1. AUDITORÍA PREVIA

### 1.1 Archivos auditados

| Archivo | Rol |
|---------|-----|
| `prisma/schema.prisma` | Modelo User (líneas 13-57), relaciones existentes |
| `src/app/api/ai/chat/route.ts` | Flujo completo del chat (321 líneas tras CCE) |
| `src/lib/continuity/engine.ts` | CCE — no modificado, solo analizado para complementar |
| `src/lib/mentor-context.ts` | 5 capas de contexto — no modificado |
| `src/lib/groq.ts` | System prompts — no modificado |

### 1.2 Hallazgo clave

El mentor actual tiene dos capas de memoria:
- **Layer 5 (mentor-context.ts):** Solo títulos de hilos anteriores — sabe *de qué* habló el usuario, no *qué dijo*.
- **Contextual Continuity Engine:** Busca en mensajes pasados de otros hilos — sabe qué dijo, pero no tiene noción de **estado** (¿es un objetivo? ¿está activo? ¿hay progreso?).

El Goals & Commitments Engine llena exactamente esa brecha: añade **estado persistente** a la información que el usuario comparte.

---

## 2. PUNTO DE INTEGRACIÓN

### 2.1 Ubicación exacta — Inyección (pre-Groq)

**Archivo:** `src/app/api/ai/chat/route.ts`
**Líneas:** 165-180 (nuevo bloque)
**Posición:** Después del CCE (línea 163), antes de la llamada a Groq (línea 182).

### 2.2 Ubicación exacta — Extracción (post-save)

**Archivo:** `src/app/api/ai/chat/route.ts`
**Líneas:** 228-236 (fire-and-forget)
**Posición:** Después de guardar mensajes (línea 219), después de marcar `limitConsumed = false` (línea 224).

### 2.3 Por qué estos puntos

**Inyección pre-Groq:**
- Mismos datos disponibles que el CCE (`userId`, `content`, `plan`)
- El prompt ya está construido — se añade al final como bloque adicional
- No interfiere con las 5 capas existentes ni con el CCE
- Si falla, el chat funciona normalmente (try/catch vacío)

**Extracción post-save:**
- Fire-and-forget con `.catch(() => {})` — no bloquea la respuesta al usuario
- Se ejecuta después de `limitConsumed = false` — un fallo no dispara rollback de crédito
- El mensaje ya está persistido — el goal puede referenciar el threadId sin riesgo de inconsistencia

### 2.4 Flujo completo actualizado

```
Usuario escribe
↓
Validaciones + checkAILimit + advisory_lock
↓
Obtener historial del hilo
↓
buildMentorContext → buildContextualSystemPrompt (5 capas existentes)
↓
Ensamblar groqMessages[]
↓
★ CCE: buscar en hilos anteriores (no modificado) ★
↓
★ GCE inyección: consultar objetivos activos relevantes ★
↓
groq.chat.completions.create()
↓
Guardar mensajes (user + assistant)
↓
limitConsumed = false
↓
★ GCE extracción: analizar mensaje, extraer/persistir objetivos ★ (fire-and-forget)
↓
Generar título + actualizar thread
↓
Respuesta al usuario
```

---

## 3. MODELO DE DATOS: `MentorGoal`

### 3.1 Schema Prisma

```prisma
model MentorGoal {
  id              String    @id @default(cuid())
  userId          String
  title           String    // "Caminar 10.000 pasos diarios"
  normalizedTitle String    // "caminar 10000 pasos diarios" (deduplicación)
  type            String    // "goal" | "commitment"
  status          String    @default("ACTIVE") // ACTIVE | PAUSED | COMPLETED | ABANDONED | ARCHIVED
  empires         String    @default("[]") // JSON: ["disciplina","energia"]
  sourceThreadId  String
  firstSeenAt     DateTime  @default(now())
  lastSeenAt      DateTime  @default(now())
  lastProgressAt  DateTime? // Última vez que el usuario reportó progreso
  progressNote    String?   // Nota textual del último progreso (≤200 chars)
  mentionCount    Int       @default(1) // Veces que el usuario lo ha mencionado
}
```

### 3.2 Índices

| Índice | Propósito |
|--------|-----------|
| `[userId, status]` | Consulta principal: objetivos activos de un usuario |
| `[userId, type, status]` | Filtrado por tipo si se necesita |
| `[userId, normalizedTitle]` | Deduplicación rápida |

### 3.3 Estados

| Estado | Cuándo se asigna | Trigger |
|--------|-----------------|---------|
| ACTIVE | Creación | El usuario expresa un objetivo/compromiso |
| PAUSED | Detección automática | "lo pauso", "tomo un descanso", "lo dejo por ahora" |
| COMPLETED | Detección automática | "lo logré", "ya lo conseguí", "objetivo cumplido" |
| ABANDONED | Detección automática | "ya no quiero", "lo dejé", "no puedo" |
| ARCHIVED | (Futuro) | Tras 90 días en COMPLETED/ABANDONED |

### 3.4 Migración pendiente

El modelo está en `schema.prisma` y el cliente Prisma está regenerado. La migración SQL para aplicar en despliegue:

```sql
CREATE TABLE "MentorGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "empires" TEXT NOT NULL DEFAULT '[]',
  "sourceThreadId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastProgressAt" TIMESTAMP(3),
  "progressNote" TEXT,
  "mentionCount" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "MentorGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MentorGoal_userId_status_idx" ON "MentorGoal"("userId", "status");
CREATE INDEX "MentorGoal_userId_type_status_idx" ON "MentorGoal"("userId", "type", "status");
CREATE INDEX "MentorGoal_userId_normalizedTitle_idx" ON "MentorGoal"("userId", "normalizedTitle");

ALTER TABLE "MentorGoal" ADD CONSTRAINT "MentorGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 4. MOTOR: `src/lib/goals/engine.ts`

### 4.1 Arquitectura (310 líneas)

```
extractAndPersistGoals()  ← post-save (fire-and-forget)
  ├── extractFromText()         → 15 patrones de objetivo + 10 de compromiso
  ├── isExcluded()              → 10 filtros de exclusión
  ├── normalizeText()           → deduplicación
  ├── detectEmpires()           → mapeo a imperios (4 imperios)
  ├── updateGoalStates()        → detección de progreso/abandono/pausa/completado
  └── db.mentorGoal.create/update

getGoalSnippet()  ← pre-Groq (inyección en prompt)
  ├── db.mentorGoal.findMany()  → consulta objetivos ACTIVE
  ├── calculateGoalRelevance()  → 12 categorías temáticas
  ├── formatSnippet()           → bloque formateado para el prompt
  └── return string
```

### 4.2 Patrones de extracción

**Objetivos (15 patrones):**
- `quiero + [verbo]` — "quiero empezar a caminar"
- `mi objetivo es + [frase]` — "mi objetivo es dormir mejor"
- `mi meta es + [frase]` — "mi meta es ahorrar 300€ al mes"
- `me gustaría + [frase]` — "me gustaría ser más constante"
- `necesito + [verbo]` — "necesito organizar mis finanzas"
- `tengo que + [verbo]` — "tengo que mejorar mi disciplina"
- `estoy intentando + [frase]` — "estoy intentando meditar todos los días"
- `voy a intentar + [frase]` — "voy a intentar dejar de fumar"
- `he decidido + [frase]` — "he decidido cambiar mi alimentación"
- `me he propuesto + [frase]` — "me he propuesto leer más"
- `quiero ser + [adjetivo]` — "quiero ser más constante"
- `quiero + [frase 10-80 chars]` — captura general
- Y 3 más

**Compromisos (10 patrones):**
- `hoy voy a + [frase]` — "hoy voy a salir a caminar"
- `esta semana voy a + [frase]` — "esta semana voy a llamar al banco"
- `mañana voy a + [frase]` — "mañana voy a acostarme antes"
- `voy a empezar + [sustantivo]` — "voy a empezar el gimnasio"
- `empiezo + [frase]` — "empiezo con la meditación"
- `voy a ahorrar + [frase]` — "voy a ahorrar 300€ este mes"
- `a partir de + [tiempo]` — "a partir de hoy voy a..."
- Y 3 más

### 4.3 Detección de estado

| Señal | Patrones (cantidad) | Ejemplo |
|-------|---------------------|---------|
| Progreso | 9 | "he conseguido", "llevo 5 días", "voy bien" |
| Abandono | 7 | "ya no quiero", "lo dejé", "no puedo" |
| Pausa | 5 | "lo pauso", "tomo un descanso" |
| Completado | 5 | "lo logré", "objetivo cumplido" |

La detección de estado solo actúa sobre objetivos con relevancia ≥ 0.15 respecto al mensaje actual, evitando cambiar estados de objetivos no relacionados.

### 4.4 Formato del snippet inyectado

```
── Objetivos activos ──
Esta persona está trabajando en estos objetivos (usa esta información SOLO cuando encaje naturalmente con la conversación, nunca la fuerces ni menciones más de uno por respuesta):
- Caminar 10.000 pasos diarios (objetivo, hace 2 semanas)
- Ahorrar para la entrada de vivienda (objetivo, hace 1 mes, último progreso: "He ahorrado 300 euros")
── Fin ──
```

### 4.5 Diferenciación FREE vs ÉLITE

| Aspecto | FREE | ÉLITE |
|---------|------|-------|
| Máx. objetivos activos | 3 | Sin límite |
| Objetivos inyectados en prompt | 2 | 5 |
| Tipos detectados | goal + commitment | goal + commitment |
| Detección de estado | Sí | Sí |
| Notas de progreso | Sí (≤14 días) | Sí (≤14 días) |
| Cross-imperio | Sí | Sí |
| Latencia añadida | ~5ms (1 query) | ~5ms (1 query) |

---

## 5. COMPATIBILIDAD

### 5.1 Lo que NO se modifica

| Componente | Estado |
|------------|--------|
| Modelo de Comprensión | No existe aún — no afectado |
| Contextual Continuity Engine | **No modificado** (1 línea importada, archivo intacto) |
| Silent Memories | No modificado |
| Life Stages | No modificado |
| Pattern Detection | No modificado |
| Emotional State Engine | No modificado |
| `buildMentorContext()` | No modificado |
| `buildContextualSystemPrompt()` | No modificado |
| `formatBasicContext()` / `formatAdvancedContext()` | No modificado |
| `groq.ts` / SYSTEM_PROMPTS | No modificado |
| `limits.ts` | No modificado |
| Límite diario de mensajes | **No modificado** — mismo comportamiento |

### 5.2 Relación con el CCE

| Aspecto | CCE | GCE |
|---------|-----|-----|
| Fuente de datos | Mensajes de hilos anteriores | Tabla `MentorGoal` persistente |
| Tiempo de retención | Limitado por hilos visibles | Persistente mientras el objetivo esté ACTIVE |
| Información de estado | No tiene | Sí (status, progressNote, mentionCount) |
| Inyección en prompt | Bloque "Continuidad contextual" | Bloque "Objetivos activos" |
| Ambos coexisten | Sí — bloques independientes | Sí — bloques independientes |

### 5.3 Sin deuda técnica

- Sin nuevas dependencias npm
- Sin archivos de tipos adicionales
- Tipos definidos en el propio módulo
- El único cambio en DB es añadir `mentorGoals MentorGoal[]` al modelo User

---

## 6. BUILD

```
✓ Build completado exitosamente
✓ 0 errores nuevos
✓ 0 warnings nuevos
✓ Todos los errores pre-existentes permanecen sin cambios
```

---

## 7. ARCHIVOS

| Archivo | Acción | Líneas |
|---------|--------|--------|
| `prisma/schema.prisma` | **MODIFICADO** — modelo MentorGoal + relación User | +30 |
| `src/lib/goals/engine.ts` | **NUEVO** — motor completo | 310 |
| `src/app/api/ai/chat/route.ts` | **MODIFICADO** — import + 2 bloques | 293 → 321 (+28) |

**Total: 1 archivo nuevo + 2 archivos modificados. 368 líneas de código nuevo.**