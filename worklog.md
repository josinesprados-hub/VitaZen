---
Task ID: 1
Agent: Main
Task: Curación emocional de VitaZen — Fase de pulido de voz

Work Log:
- Leído documento de principios `/docs/vitazen-finanzas-principios.md`
- Explorado codebase completo: localizadas todas las baterías de frases, tips, microcopy, observaciones (~400+ frases en 28+ archivos)
- Curado reflections.ts: 308 → 55 reflexiones seleccionadas con criterio humano (eliminadas frases demasiado IA, coach, wellbeing, "profundas artificialmente")
- Curado emotional-state.ts: descripciones reducidas a observación calmada, recomendaciones y summaries simplificados, eliminado coaching
- Curado insights.ts: títulos sin adjetivos evaluativos, descripciones sin frases motivacionales, eliminadas recomendaciones de tipo coach
- Curado notifications/templates.ts: reducido de 20+ a 12 plantillas, eliminado "te echamos de menos", "reflexiona un instante", "cierra el día" y otros coaching/wellbeing, rotación secuencial en vez de aleatoria
- Curado widgets/shaping.ts: nudges reducidos de 5 a 3, fallback tips simplificados, momentum descriptions sin coaching
- Curado dashboard components: EmotionalHero ("Tu actividad real" en vez de "Basado en tu actividad real"), WeeklyRecap ("Observación" en vez de "Recomendación del mentor", "Lo que destaca" en vez de "Lo que destaca esta semana"), OnboardingRecommendations ("Para ti" en vez de "Recomendaciones para ti"), eliminado coaching de tips contextuales
- Curado EmpireTipsSection: "Notas" en vez de "Notas para tu crecimiento", "Más capas / Con Élite" en vez de "Profundiza con Élite / Contenido exclusivo"
- Curado PremiumBlur: "Más capas aquí" en vez de "Hay más capas aquí"
- Curado life-memory/stages.ts: labels simplificados ("Calma" en vez de "Un periodo de calma"), observaciones más cortas, transiciones sin narrativa
- Curado monthly-closure/copy.ts: ritmos simplificados, evolución labels más cortos, entry prompt más calmado
- Curado weekly-recap-sender.ts: recomendaciones sin coaching
- Implementado sistema de rotación contemplativo en PremiumReflection: eliminado auto-rotation de 3min, rotación basada en visitas, evitación de repetición cercana (AVOID_RECENT_COUNT=5)
- Implementado sistema de rotación contemplativo en useEmpireTips: ciclo de 4 días (3-5 días según spec), evitación de repetición cercana tras reshuffle, tracking de recent tips
- Implementado rotación secuencial en notifications/templates.ts: basada en día actual en vez de Math.random()
- Implementado evitación de duplicación entre reflection y quote widgets

Stage Summary:
- ~250+ frases eliminadas o refinadas de la batería
- Sistema de rotación cambiado de algorítmico/aleatorio a contemplativo basado en visitas
- Toda la app ahora usa observación calmada, no coaching/wellbeing
- El silencio se protege: strings vacíos donde no hay nada valioso que decir
- Sin cambios en Stripe, auth, lógica de negocio, arquitectura, navegación, Android/TWA
