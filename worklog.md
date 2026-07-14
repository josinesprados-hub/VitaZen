---
Task ID: 1
Agent: Main Agent
Task: FASE 2.6 — Reasoning Engine — Auditoría completa + Implementación + Informe

Work Log:
- Full audit of Mentor IA architecture: read 11 core files (route.ts, mentor-context.ts, groq.ts, emotional-state.ts, patterns/detector.ts, life-memory/stages.ts, silent-memories/shared.ts, monthly-closure/digest.ts, insights.ts, decision/engine.ts, understanding/engine.ts)
- Discovered: CCE (Contextual Continuity Engine) does NOT exist in production. VitaZen/ subdirectory has old route.ts importing it, but that's a stale/old branch.
- Discovered: Goals & Commitments Engine exists partially in src/lib/goals/engine.ts but references non-existent Prisma model MentorGoal. 10+ TS errors. NOT integrated in production.
- Discovered: Modelo de Comprensión does not exist in any form.
- Confirmed Decision Engine (Phase 2.4) is fully integrated: import in route.ts line 12, called at line 158, non-blocking.
- Confirmed Emotional Understanding Engine (Phase 2.3) is fully integrated: import at line 11, READ path at line 142, WRITE path at line 227.
- Created src/lib/reasoning/types.ts (~120 lines): UserNeed (12 types), Intention (20 types), ToneStyle (8 types), ResponseObjective (14 types), AdaptationSignals, RepetitionCheck, ReasoningInput, ReasoningInstruction.
- Created src/lib/reasoning/engine.ts (~808 lines): reason() as sole export. 6 detection components: detectNeeds, detectIntentions, selectTone, selectObjective, detectAdaptations, checkRepetition, buildInstructionSnippet.
- Integrated Reasoning Engine into route.ts: added import (line 13), added RE-1 block after Decision Engine (lines 166-185), non-blocking try/catch.
- FREE/ÉLITE differentiation: FREE gets max 2 instruction lines, no secondary tone, no dynamic adaptations. ÉLITE gets up to 6 lines, full tone + secondary, all adaptations.
- TypeScript type check: 0 new errors. All pre-existing errors are untouched (layout.tsx, stripe/webhook, timeline/route, decision/engine.ts financial, logger.ts, weekly-recap-sender.ts, goals/engine.ts).
- Generated comprehensive forensic report at download/INFORME-REASONING-ENGINE.md.

Stage Summary:
- Created Reasoning Engine (types + engine) with 0 new build errors
- Integrated into chat flow after Decision Engine, before Groq call
- Comprehensive audit documented, including discrepancy resolution for CCE/Goals/Modelo de Comprensión
- Technical report delivered covering architecture, flow, integration, justification, risks