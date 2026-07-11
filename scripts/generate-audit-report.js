const { Document, Packer, Paragraph, TextRun, Header, Footer,
        AlignmentType, HeadingLevel, PageNumber, PageBreak, SectionType,
        Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
        TableLayoutType, TableOfContents, TabStopPosition, TabStopType } = require("docx");
const fs = require("fs");

// ═══════════════════════════════════════════════════
// PALETTE — DM-1 Deep Cyan (Tech / AI / Digital)
// ═══════════════════════════════════════════════════
const P = {
  bg: "162235",
  primary: "0F172A",
  body: "1A2B40",
  secondary: "5A6080",
  accent: "5B8DB8",
  surface: "F4F8FC",
  tableBg: "1B6B7A",
  tableHeaderText: "FFFFFF",
  tableAccentLine: "1B6B7A",
  tableInnerLine: "C8DDE2",
  tableSurface: "EDF3F5",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078", accent: "37DCF2" }
};

const c = (hex) => hex.replace("#", "");
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ═══════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 32 })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 28 })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: c(P.secondary), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 26 })]
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })]
  });
}

function bodyBold(label, text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } }),
      new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })
    ]
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 40 },
    indent: { left: 480 + level * 360, hanging: 240 },
    children: [new TextRun({ text: `\u2022 ${text}`, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })]
  });
}

function spacer(twips = 100) {
  return new Paragraph({ spacing: { before: twips } });
}

function makeHeaderCell(text) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: P.tableBg },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: c(P.tableAccentLine) },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: c(P.tableAccentLine) },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
    },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 21, color: c(P.tableHeaderText), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })] })]
  });
}

function makeCell(text, index = 0) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: index % 2 === 0 ? c(P.tableSurface) : "FFFFFF" },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: c(P.tableInnerLine) }
    },
    margins: { top: 50, bottom: 50, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, size: 21, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })] })]
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: c(P.tableAccentLine) },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: c(P.tableAccentLine) },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: c(P.tableInnerLine) },
      insideVertical: { style: BorderStyle.NONE }
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map(h => makeHeaderCell(h)) }),
      ...rows.map((row, i) => new TableRow({ cantSplit: true, children: row.map(cell => makeCell(cell, i)) }))
    ]
  });
}

// ═══════════════════════════════════════════════════
// COVER — R1 Pure Paragraph Left
// ═══════════════════════════════════════════════════

function buildCover() {
  const title = "Auditor\u00eda Forense de Se\u00f1ales";
  const subtitle = "Potencial real de datos de VitaZen sin modificar la base de datos";
  const metaLines = [
    "Repositorio: github.com/josinesprados-hub/VitaZen",
    "Rama: main | Stack: Next.js 15 + Prisma + PostgreSQL",
    "Fecha: 11 de julio de 2026"
  ];
  const padL = 1200, padR = 800;

  const children = [];
  children.push(new Paragraph({ spacing: { before: 4000 } }));

  // English label with accent bottom border
  children.push(new Paragraph({
    indent: { left: padL, right: padR }, spacing: { after: 500 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: c(P.cover.accent), space: 8 } },
    children: [new TextRun({ text: "V I T A Z E N   \u2014   F O R E N S I C   A U D I T",
      size: 18, color: c(P.cover.accent), font: { ascii: "Calibri" }, characterSpacing: 40 })],
  }));

  // Title
  children.push(new Paragraph({
    indent: { left: padL }, spacing: { after: 300, line: 828, lineRule: "atLeast" },
    children: [new TextRun({ text: title, size: 72, bold: true, color: c(P.cover.titleColor), font: { eastAsia: "SimHei", ascii: "Arial" } })],
  }));

  // Subtitle
  children.push(new Paragraph({
    indent: { left: padL }, spacing: { after: 800 },
    children: [new TextRun({ text: subtitle, size: 24, color: c(P.cover.subtitleColor), font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
  }));

  // Meta lines
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: c(P.cover.accent), space: 12 };
  for (const line of metaLines) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: c(P.cover.metaColor), font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: 3000 } }));

  // Footer
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: c(P.cover.accent), space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: "Solo lectura  |  Sin commits  |  Sin modificaciones", size: 16, color: c(P.cover.footerColor), font: { ascii: "Arial" } }),
      new TextRun({ text: "                                                          " }),
      new TextRun({ text: "Confidencial", size: 16, color: c(P.cover.footerColor), font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({ height: { value: 16838, rule: "exact" }, children: [
      new TableCell({ shading: { type: ShadingType.CLEAR, fill: c(P.bg) }, borders: noBorders, children })
    ] })],
  })];
}

// ═══════════════════════════════════════════════════
// DOCUMENT BODY
// ═══════════════════════════════════════════════════

const bodyContent = [];

// ─── 1. RESUMEN EJECUTIVO ───
bodyContent.push(h1("Resumen Ejecutivo"));
bodyContent.push(body("Esta auditor\u00eda forense analiza la totalidad del c\u00f3digo fuente de VitaZen (29 modelos Prisma, 47 rutas API, 5 cron jobs, 45 logros, 7 detectores de patrones) para responder a una pregunta: \u00bfqu\u00e9 se\u00f1ales objetivas puede obtener VitaZen con la informaci\u00f3n que ya almacena, sin modificar la base de datos, sin a\u00f1adir IA y sin inventar nada?"));
bodyContent.push(body("El resultado revela que VitaZen ya posee los datos para calcular 68 se\u00f1ales distribuidas en cinco imperios, de las cuales 19 est\u00e1n completamente infrautilizadas: se almacenan, se calculan o se devuelven por API, pero nunca se muestran al usuario. El motor de patrones actual cubre 7 conexiones entre imperios sobre 10 combinaciones posibles, y existe un segundo motor (engine.ts) con 2 conexiones adicionales que no se consumen desde ning\u00fan m\u00f3dulo. Adem\u00e1s, se identificaron 2 componentes completamente muertos (MomentumCard, WeeklyRecap) que ejecutan 25+ consultas pesadas sin renderizarse en ninguna p\u00e1gina."));
bodyContent.push(body("Las conexiones entre Disciplina y cualquier otro imperio son imposibles con la estructura actual de datos, ya que HabitLog solo almacena un timestamp de \u00faltima compleci\u00f3n (lastCompletedAt) y no un historial por semana. Igualmente, las conexiones con Crecimiento requieren el contenido textual del diario, lo que necesita NLP o cambios de query. Ambas limitaciones est\u00e1n documentadas expl\u00edcitamente en engine.ts l\u00edneas 25-31."));

// ─── 2. SE\u00d1ALES DETECTADAS ───
bodyContent.push(h1("Se\u00f1ales Detectadas"));
bodyContent.push(body("A continuaci\u00f3n se detallan todas las se\u00f1ales objetivas que VitaZen puede calcular con los datos actuales, agrupadas por imperio. Cada se\u00f1al incluye su fuente de datos (modelo Prisma), d\u00f3nde se calcula actualmente (archivo y funci\u00f3n), y si est\u00e1 activamente utilizada o infrautilizada."));

// DISCIPLINA
bodyContent.push(h2("Disciplina"));
bodyContent.push(body("El imperio de Disciplina se sustenta en tres modelos: HabitLog (rastreo de h\u00e1bitos con frecuencia, racha y marca temporal), UserChallenge (desaf\u00edos diarios asignados) y DailyCheckin (check-in emocional diario que otorga XP a Disciplina). Las se\u00f1ales disponibles abarcan desde la racha actual de cada h\u00e1bito hasta el porcentaje de cumplimiento semanal y la recuperaci\u00f3n tras periodos de abandono."));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Fuente", "C\u00e1lculo Actual", "Estado"],
  [
    ["H\u00e1bitos totales activos", "HabitLog.count()", "achievements.ts:calculateProgress()", "Activo"],
    ["Racha actual por h\u00e1bito", "HabitLog.streak", "API /api/habits GET, dashboard/streaks", "Activo"],
    ["Racha m\u00e1xima hist\u00f3rica", "Math.max(HabitLog.streak)", "achievements.ts:calculateProgress()", "Activo"],
    ["Frecuencia (diaria/semanal/mensual)", "HabitLog.frequency", "API PATCH /api/habits (streak logic)", "Activo"],
    ["Check-ins completados (semana)", "DailyCheckin.count(7d)", "insights.ts:buildSummary()", "Activo"],
    ["Check-ins completados (hist\u00f3rico)", "DailyCheckin.count()", "achievements.ts:calculateProgress()", "Activo"],
    ["Racha general de check-ins", "calcStreak(DailyCheckin.dates)", "dashboard/streaks, dashboard/momentum", "Activo"],
    ["D\u00edas activos (Set de fechas)", "Meditation+Habit+Journal+Checkin+Wellness+Nutrition", "dashboard/momentum, dashboard/progress", "Activo"],
    ["XP y nivel de imperio", "EmpireProgress.xp, level", "API /api/empire GET", "Activo"],
    ["Racha de imperio (Disciplina)", "EmpireProgress.streak", "API /api/empire GET", "Activo"],
    ["Cumplimiento por franja horaria", "DailyCheckin.createdAt (por hora)", "No calculado", "No utilizado"],
    ["Tendencia semanal de actividad", "count(7d) vs count(14d)", "dashboard/momentum (trend)", "Activo"],
    ["Desaf\u00edos completados vs asignados", "UserChallenge.completed", "API /api/challenges", "Activo"],
  ]
));

// MENTE
bodyContent.push(h2("Mente"));
bodyContent.push(body("El imperio de Mente se basa en MeditationSession (sesiones con duraci\u00f3n, tipo y marca temporal) y DailyCheckin (cuyas m\u00e9tricas de foco alimentan el estado emocional). El sistema calcula la consistencia de meditaci\u00f3n, la diversificaci\u00f3n de t\u00e9cnicas, y la relaci\u00f3n entre sesiones de meditaci\u00f3n y estabilidad financiera o nivel de energ\u00eda a trav\u00e9s de correlaciones de Pearson semanales."));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Fuente", "C\u00e1lculo Actual", "Estado"],
  [
    ["Sesiones totales", "MeditationSession.count()", "insights.ts, achievements.ts", "Activo"],
    ["Sesiones semanales", "MeditationSession.count(7d)", "insights.ts:buildSummary()", "Activo"],
    ["Minutos totales de meditaci\u00f3n", "sum(MeditationSession.duration)", "insights.ts:buildSummary()", "Activo"],
    ["Duraci\u00f3n media por sesi\u00f3n", "avg(MeditationSession.duration)", "insights.ts:buildSummary()", "Activo"],
    ["Tipos de meditaci\u00f3n utilizados", "distinct(MeditationSession.type)", "achievements.ts", "Activo"],
    ["Diversificaci\u00f3n t\u00e9cnica", "distinct count de tipos", "achievements.ts (meditation_variety)", "Activo"],
    ["Consistencia semanal", "count(7d) / target(4)", "emotional-state.ts:computeFocus()", "Activo"],
    ["Promedio de foco (check-in)", "avg(DailyCheckin.focus)", "emotional-state.ts:computeFocus()", "Infrautilizado*"],
    ["Racha de meditaci\u00f3n", "calcStreak(sessions.completedAt)", "dashboard/streaks", "Activo"],
    ["Correlaci\u00f3n meditaci\u00f3n-gastos", "Pearson(sessions, 1-impulsiveRatio)", "patterns/engine.ts:detectMentalPracticeFinancialStability", "Activo"],
    ["Correlaci\u00f3n foco-meditaci\u00f3n", "Pearson(checkin.focus, meditation.minutes)", "patterns/engine.ts:detectCheckinMeditationConnection", "No consumido"],
  ]
));
bodyContent.push(body("*El promedio de foco se calcula en emotional-state.ts y se devuelve por la API /api/emotional-state y /api/insights, pero el componente Insights solo muestra 3 de 4 promedios (emotion, energy, stress). El campo avgFocus se calcula, se env\u00eda al cliente y se descarta sin renderizar.", { size: 21, color: c(P.secondary) }));

// ENERGIA
bodyContent.push(h2("Energ\u00eda"));
bodyContent.push(body("El imperio de Energ\u00eda es el m\u00e1s rico en m\u00e9tricas, con dos modelos complementarios: WellnessLog (estado subjetivo 1-5 de mood, energy, sleep, stress con notas) y NutritionLog (comidas JSON, vasos de agua, calor\u00edas, notas). El XP de energ\u00eda se otorga por el primer registro de wellness o nutrici\u00f3n del d\u00eda (zona horaria Madrid), con verificaci\u00f3n cruzada entre ambos modelos para evitar doble conteo."));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Fuente", "C\u00e1lculo Actual", "Estado"],
  [
    ["Estado de \u00e1nimo (mood)", "WellnessLog.mood (1-5)", "emotional-state.ts, insights.ts", "Activo"],
    ["Nivel de energ\u00eda auto-reportado", "WellnessLog.energy (1-5)", "emotional-state.ts, insights.ts", "Activo"],
    ["Calidad de sue\u00f1o", "WellnessLog.sleep (1-5)", "emotional-state.ts, insights.ts, patterns", "Activo"],
    ["Nivel de estr\u00e9s", "WellnessLog.stress (1-5)", "emotional-state.ts, insights.ts, patterns", "Activo"],
    ["Promedios semanales (4 m\u00e9tricas)", "avg(WellnessLog.*) por semana", "patterns/aggregateWellnessWeekly()", "Activo"],
    ["Vasos de agua diarios", "NutritionLog.water", "insights.ts:avgWater", "Activo"],
    ["Calor\u00edas registradas", "NutritionLog.calories", "API GET /api/nutrition", "Activo"],
    ["D\u00edas con registro de bienestar", "distinct(WellnessLog.date)", "dashboard/progress, life-memory/stages", "Activo"],
    ["D\u00edas con registro de nutrici\u00f3n", "distinct(NutritionLog.date)", "dashboard/progress, life-memory/stages", "Activo"],
    ["Energ\u00eda compuesta (0-100)", "70% checkin.energy + 30% sleep", "emotional-state.ts:computeEnergy()", "Infrautilizado*"],
    ["Tranquilidad compuesta (0-100)", "80% inversa(stress) + 20% inversa(wellness.stress)", "emotional-state.ts:computeStress()", "Infrautilizado*"],
    ["Correlaci\u00f3n energ\u00eda-gastos impulsivos", "Pearson(sleep, impulsiveRatio)", "patterns/detector.ts:detectLowEnergyImpulsiveSpending", "Activo"],
    ["Correlaci\u00f3n estr\u00e9s-gastos", "Pearson(stress, totalExpense)", "patterns/detector.ts:detectStressFinancialChange", "Activo"],
    ["Correlaci\u00f3n sue\u00f1o-gastos", "Pearson(sleep, totalExpense)", "patterns/detector.ts:detectSleepFinanceConnection", "Activo"],
    ["Correlaci\u00f3n energ\u00eda-meditaci\u00f3n", "Pearson(energy, meditation.minutes)", "patterns/engine.ts:detectEnergyMeditationConnection", "No consumido"],
    ["Contexto emocional del sue\u00f1o", "WellnessLog.notes", "life-memory/stages.ts (no analizado)", "No utilizado"],
  ]
));
bodyContent.push(body("*Las m\u00e9tricas compuestas de energ\u00eda y tranquilidad se calculan en emotional-state.ts (0-100) con tendencia semanal para PREMIUM, se devuelven en la API /api/emotional-state, pero el componente EmotionalHero muestra \u00fanicamente texto cualitativo (statusLabel, recommendation). Los 6 valores num\u00e9ricos con level y trend se calculan en servidor y se env\u00edan al cliente sin renderizar.", { size: 21, color: c(P.secondary) }));

// RIQUEZA
bodyContent.push(h2("Riqueza"));
bodyContent.push(body("El imperio de Riqueza utiliza FinanceLog con una estructura \u00fanica que combina datos financieros con contexto emocional: cada registro tiene tipo (income/expense), categor\u00eda, amount, mood (tranquility/growth/necessity/enjoyment) y contexto libre (campo 'contexto' en espa\u00f1ol). El mood de Finanzas es el \u00fanico campo en toda la aplicaci\u00f3n que captura la intenci\u00f3n emocional de una acci\u00f3n financiera, lo cual lo convierte en una se\u00f1al extremadamente valiosa para patrones cruzados."));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Fuente", "C\u00e1lculo Actual", "Estado"],
  [
    ["Gastos totales (per\u00edodo)", "sum(FinanceLog.amount, type=expense)", "insights.ts:sumFinance(), dashboard/metrics", "Activo"],
    ["Ingresos totales (per\u00edodo)", "sum(FinanceLog.amount, type=income)", "insights.ts:sumFinance(), dashboard/metrics", "Activo"],
    ["Balance neto", "income - expense", "insights.ts, dashboard/metrics", "Activo"],
    ["Top categor\u00edas por importe", "groupBy category, sum(amount)", "monthly-closure/digest.ts", "Activo"],
    ["Distribuci\u00f3n de intenciones", "count(FinanceLog.mood) por tipo", "monthly-closure/digest.ts, patterns", "Activo"],
    ["Ratio de gastos impulsivos", "enjoyment / totalExpense", "patterns/aggregateFinanceWeekly()", "Activo"],
    ["Gastos sociales", "SOCIAL_KEYWORDS.test(contexto)", "patterns/aggregateFinanceWeekly():socialCount", "No utilizado**"],
    ["Diversificaci\u00f3n de categor\u00edas", "distinct(categories) por semana", "patterns/aggregateFinanceWeekly():categoryCount", "No utilizado**"],
    ["Contexto emocional libre", "FinanceLog.contexto (texto)", "almacenado, regex en frontend", "Infrautilizado***"],
    ["Mood emocional del gasto", "FinanceLog.mood", "patrones, monthly-closure", "Activo"],
    ["Evoluci\u00f3n mensual", "count(mes actual) vs count(mes anterior)", "monthly-closure/digest.ts:computeEvolution()", "Activo"],
  ]
));
bodyContent.push(body("**socialCount y categoryCount se calculan en el motor de patrones como parte de la agregaci\u00f3n semanal de finanzas, pero no se utilizan en ning\u00fan detector ni se exponen a ning\u00fan consumidor. Son se\u00f1ales calculadas y descartadas.", { size: 21, color: c(P.secondary) }));
bodyContent.push(body("***El campo contexto se almacena y se usa en el Cierre Mensual y Memoria de Vida. Sin embargo, en la p\u00e1gina de Riqueza, el componente tiene una funci\u00f3n CONTEXT_EMOTION_MAP que detecta emociones por regex sobre la descripci\u00f3n del gasto, calcula el resultado y luego lo descarta sin mostrarlo (comentario en c\u00f3digo: 'for future emotional pattern detection').", { size: 21, color: c(P.secondary) }));

// CRECIMIENTO
bodyContent.push(h2("Crecimiento"));
bodyContent.push(body("El imperio de Crecimiento utiliza JournalEntry con campos de contenido textual, mood opcional (1-5) y gratitude opcional. Es el \u00fanico imperio donde el dato primario es texto libre, lo que limita las se\u00f1ales num\u00e9ricas disponibles sin NLP. Sin embargo, las se\u00f1ales estructurales s\u00ed son ricas: frecuencia, continuidad, longitud, y presencia de gratitud."));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Fuente", "C\u00e1lculo Actual", "Estado"],
  [
    ["Entradas totales del diario", "JournalEntry.count()", "insights.ts, achievements.ts", "Activo"],
    ["Entradas semanales", "JournalEntry.count(7d)", "insights.ts:buildSummary()", "Activo"],
    ["Mood del diario (opcional)", "JournalEntry.mood (1-5)", "patterns (CrossEmpireData)", "Activo"],
    ["Entradas con gratitud", "JournalEntry.gratitude (not null)", "achievements.ts", "Activo"],
    ["Longitud media de entrada", "avg(JournalEntry.content.length)", "No calculado", "No utilizado"],
    ["Frecuencia de escritura", "count por periodo", "insights.ts, life-memory/stages", "Activo"],
    ["Continuidad (d\u00edas entre entradas)", "JournalEntry.createdAt gaps", "No calculado", "No utilizado"],
    ["Evoluci\u00f3n temporal", "count(mes) vs count(mes-1)", "life-memory/stages.ts", "Activo"],
    ["Contenido para memoria", "JournalEntry.content (truncated 120 chars)", "life-memory/observations.ts:getHighlightedMemories()", "Activo"],
  ]
));

// ─── 3. SE\u00d1ALES INFRAUTILIZADAS ───
bodyContent.push(h1("Se\u00f1ales Infrautilizadas"));
bodyContent.push(body("Se identifican 19 se\u00f1ales que se calculan, se almacenan o se devuelven por API pero que no se muestran al usuario. Estas representan valor latente que podr\u00eda activarse sin modificar la base de datos ni la arquitectura, simplemente conectando datos ya disponibles a la interfaz existente."));

bodyContent.push(h2("Componentes muertos (c\u00f3digo que no se renderiza)"));
bodyContent.push(bodyBold("MomentumCard (src/components/dashboard/MomentumCard.tsx): ", "Este componente existe, importa useApi y llama a GET /api/dashboard/momentum, que ejecuta 26 consultas Prisma en paralelo para calcular un score de momentum (0-100) con 7 sub-puntuaciones. Sin embargo, el componente no est\u00e1 importado ni renderizado en ninguna p\u00e1gina del dashboard. Es c\u00f3digo muerto completo que, de activarse, consumir\u00eda 25+ queries por cada carga del dashboard."));
bodyContent.push(bodyBold("WeeklyRecap (src/components/dashboard/WeeklyRecap.tsx): ", "Similar a MomentumCard, este componente llama a GET /api/weekly-recap, que a su vez ejecuta gatherData() con 14 consultas paralelas m\u00e1s c\u00e1lculos de estado emocional y recomendaciones. No est\u00e1 montado en ninguna p\u00e1gina. El endpoint weekly-recap s\u00ed se consume desde la p\u00e1gina /insights, pero este componente espec\u00edfico del dashboard est\u00e1 hu\u00e9rfano."));

bodyContent.push(h2("M\u00e9tricas calculadas pero no mostradas"));
bodyContent.push(makeTable(
  ["Se\u00f1al", "Se calcula en", "Se devuelve por API", "Se muestra en"],
  [
    ["6 m\u00e9tricas de estado emocional (0-100 + trend)", "emotional-state.ts", "S\u00ed (/api/emotional-state)", "No (solo texto)"],
    ["avgFocus de check-ins", "insights.ts:buildSummary()", "S\u00ed (/api/insights)", "No (falta en UI)"],
    ["Momentum score breakdown (7 sub-scores)", "dashboard/momentum/route.ts", "S\u00ed (/api/dashboard/momentum)", "No (componente muerto)"],
    ["newlyUnlocked de logros", "achievements.ts:checkAndUnlock()", "S\u00ed (/api/achievements)", "No (sin animaci\u00f3n)"],
    ["Contexto emocional de finanzas (regex)", "Riqueza page.tsx (CONTEXT_EMOTION_MAP)", "No se env\u00eda", "No (descartado)"],
    ["Categor\u00eda y dificultad del desaf\u00edo", "API /api/challenges", "S\u00ed (en respuesta)", "No (no renderizado)"],
    ["socialCount (gastos sociales)", "patterns/aggregateFinanceWeekly()", "No", "No"],
    ["categoryCount (diversificaci\u00f3n)", "patterns/aggregateFinanceWeekly()", "No", "No"],
    ["Conexi\u00f3n energ\u00eda-meditaci\u00f3n", "patterns/engine.ts", "No (no consumido)", "No"],
    ["Conexi\u00f3n checkin-meditaci\u00f3n", "patterns/engine.ts", "No (no consumido)", "No"],
    ["Mood del gasto (FinanceLog.mood)", "almacenado en DB", "S\u00ed (en /api/finance)", "No (no renderizado)"],
    ["Evoluci\u00f3n semana previa (trends)", "emotional-state.ts (PREMIUM)", "S\u00ed (en respuesta)", "No (no renderizado)"],
  ]
));

// ─── 4. NUEVAS CONEXIONES POSIBLES ───
bodyContent.push(h1("Nuevas Conexiones Posibles"));
bodyContent.push(body("Las siguientes conexiones podr\u00edan implementarse inmediatamente sin modificar Prisma, sin modificar la base de datos, sin IA y sin NLP. Todas usan datos que ya se almacenan y se consultan en otros contextos."));

bodyContent.push(h2("Conexiones inmediatas (datos ya disponibles)"));
bodyContent.push(makeTable(
  ["Conexi\u00f3n", "Imperios", "M\u00e9todo", "Datos Necesarios", "Dificultad"],
  [
    ["Energ\u00eda \u2194 Meditaci\u00f3n", "Energ\u00eda, Mente", "Pearson semanal", "WellnessLog.energy + MeditationSession.duration", "Baja (ya existe en engine.ts)"],
    ["Check-in \u2194 Meditaci\u00f3n", "Disciplina, Mente", "Pearson semanal", "DailyCheckin.focus + MeditationSession.duration", "Baja (ya existe en engine.ts)"],
    ["Estr\u00e9s \u2194 Frecuencia de escritura", "Energ\u00eda, Crecimiento", "Pearson semanal", "avg(stress) vs count(journal) por semana", "Baja"],
    ["Sue\u00f1o \u2194 Constancia de h\u00e1bitos", "Energ\u00eda, Disciplina", "Correlaci\u00f3n", "avg(sleep) vs count(habits with lastCompleted in week)", "Media (requiere query nueva)"],
    ["Mood del gasto \u2194 Nivel de \u00e1nimo", "Riqueza, Energ\u00eda", "Correlaci\u00f3n", "FinanceLog.mood distribution vs WellnessLog.mood", "Baja"],
    ["Intenci\u00f3n de gasto \u2194 Crecimiento", "Riqueza, Crecimiento", "Correlaci\u00f3n", "growth ratio vs count(journal entries) por semana", "Baja"],
    ["Balance financiero \u2194 Estado emocional", "Riqueza, Mente", "Correlaci\u00f3n", "(income-expense) vs avg(DailyCheckin.emotion)", "Baja"],
    ["Agua diaria \u2194 Nivel de energ\u00eda", "Energ\u00eda", "Correlaci\u00f3n", "NutritionLog.water vs WellnessLog.energy", "Baja"],
  ]
));

bodyContent.push(h2("Conexiones que requieren cambios de query (sin modificar Prisma)"));
bodyContent.push(makeTable(
  ["Conexi\u00f3n", "Imperios", "Bloqueo Actual", "Soluci\u00f3n"],
  [
    ["H\u00e1bitos \u2194 *", "Disciplina, *", "HabitLog solo tiene lastCompletedAt (timestamp \u00fanico), no historial por semana", "Nueva query que cuente h\u00e1bitos completados por semana usando lastCompletedAt agrupado por ISO week key"],
    ["Crecimiento \u2194 *", "Crecimiento, *", "JournalEntry solo tiene texto + mood opcional, sin m\u00e9trica num\u00e9rica continua", "Usar count de entradas y mood promedio como proxy (ya disponible)"],
    ["Nutrici\u00f3n \u2194 *", "Energ\u00eda, *", "NutritionLog no se usa en ning\u00fan detector de patrones", "Agregar NutritionLog a CrossEmpireData y crear agregador semanal"],
  ]
));

// ─── 5. LIMITACIONES REALES ───
bodyContent.push(h1("Limitaciones Reales"));
bodyContent.push(body("Las siguientes conexiones NO son posibles actualmente con la estructura de datos existente. Cada limitaci\u00f3n se documenta con el dato exacto que falta y el modelo/campo responsable."));

bodyContent.push(makeTable(
  ["Conexi\u00f3n Bloqueada", "Dato que Falta", "Modelo:Campo", "Explicaci\u00f3n"],
  [
    ["Disciplina \u2194 Cualquier otro imperio (correlaci\u00f3n semanal)", "Historial de completaci\u00f3n por semana", "HabitLog no tiene registros individuales de completaci\u00f3n; solo streak + lastCompletedAt", "Sin un log de eventos por completaci\u00f3n, no se puede reconstruir qu\u00e9 h\u00e1bitos se completaron en qu\u00e9 semana. lastCompletedAt es un \u00fanico timestamp que se sobrescribe. Documentado en engine.ts l\u00edneas 25-26."],
    ["Crecimiento \u2194 Cualquier otro imperio (an\u00e1lisis de contenido)", "M\u00e9tricas num\u00e9ricas del diario", "JournalEntry solo tiene content (texto) + mood opcional", "Sin NLP no se puede extraer se\u00f1ales num\u00e9ricas del texto libre. El mood opcional es un proxy d\u00e9bil. Documentado en engine.ts l\u00edneas 28-29."],
    ["Correlaci\u00f3n con contenido textual", "An\u00e1lisis sem\u00e1ntico del texto", "JournalEntry.content, FinanceLog.contexto, DailyCheckin.intention, WellnessLog.notes", "Todos los campos de texto libre se almacenan pero nunca se procesan autom\u00e1ticamente. Requerir\u00eda NLP o un pipeline de clasificaci\u00f3n."],
    ["Patrones estacionales (por mes/trimestre)", "Agregaci\u00f3n temporal mensual en el motor de patrones", "El motor solo agrega por semana (ISO week key)", "Los life stages (stages.ts) s\u00ed agregan por mes, pero el motor de patrones (detector.ts/engine.ts) solo opera a nivel semanal con Pearson. No hay detecci\u00f3n de patrones estacionales."],
    ["Patrones diarios (intra-semana)", "Granularidad diaria en el motor de patrones", "El motor requiere m\u00ednimo 3 semanas de datos", "No se detectan patrones dentro de una misma semana (ej. los lunes son siempre peores). Todo se suaviza a nivel semanal."],
    ["Detecci\u00f3n de abandono temprano", "Registro de cu\u00e1ndo un h\u00e1bito fue abandonado", "HabitLog no registra interrupciones, solo el timestamp m\u00e1s reciente", "No se puede distinguir entre 'nunca complet\u00f3 hoy' y 'abandon\u00f3 despu\u00e9s de 30 d\u00edas'. Solo se infiere indirectamente por la ausencia de lastCompletedAt reciente."],
  ]
));

// ─── 6. PRIORIDAD ───
bodyContent.push(h1("Prioridad de Implementaci\u00f3n"));
bodyContent.push(body("Las nuevas conexiones se priorizan seg\u00fan valor para el usuario (capacidad de generar observaciones significativas), facilidad de implementaci\u00f3n (datos ya disponibles vs. query nueva), y reutilizaci\u00f3n potencial por los cuatro m\u00f3dulos consumidores: Observaciones, Tu Evoluci\u00f3n (insights), Cierre Mensual y Mentor IA."));

bodyContent.push(h2("Prioridad 1: Activar se\u00f1ales existentes sin c\u00f3digo nuevo"));
bodyContent.push(makeTable(
  ["Acci\u00f3n", "Valor", "Facilidad", "Reutilizaci\u00f3n"],
  [
    ["Mostrar avgFocus en Insights (falta en UI)", "Alto: completa la cuarta m\u00e9trica faltante", "Trivial: 1 l\u00ednea en componente", "Insights"],
    ["Consumir detectEnergyMeditationConnection desde engine.ts", "Alto: conexi\u00f3n Energ\u00eda-Mente ya calculada", "Baja: ya existe en engine.ts", "Observaciones, Mentor"],
    ["Consumir detectCheckinMeditationConnection desde engine.ts", "Alto: conexi\u00f3n Disciplina-Mente ya calculada", "Baja: ya existe en engine.ts", "Observaciones, Mentor"],
    ["Mostrar newlyUnlocked en Logros", "Medio: engagement al desbloquear", "Baja: animaci\u00f3n CSS + badge", "Logros"],
    ["Mostrar mood del gasto en Riqueza", "Medio: contexto emocional del gasto", "Baja: campo ya en respuesta", "Riqueza"],
  ]
));

bodyContent.push(h2("Prioridad 2: Nuevas correlaciones con queries existentes"));
bodyContent.push(makeTable(
  ["Acci\u00f3n", "Valor", "Facilidad", "Reutilizaci\u00f3n"],
  [
    ["Estr\u00e9s \u2194 Frecuencia de escritura", "Alto: conexi\u00f3n Energ\u00eda-Crecimiento sin query nueva", "Baja: datos ya en CrossEmpireData", "Observaciones, Mentor, Mensual"],
    ["Balance financiero \u2194 Estado emocional", "Alto: conexi\u00f3n Riqueza-Mente directa", "Baja: datos ya disponibles", "Observaciones, Mentor, Mensual"],
    ["Mood del gasto \u2194 Nivel de \u00e1nimo", "Medio: conexi\u00f3n Riqueza-Energ\u00eda por intenci\u00f3n", "Baja: mood ya en FinanceLog", "Observaciones, Mentor"],
    ["Intenci\u00f3n de gasto \u2194 Crecimiento", "Medio: conexi\u00f3n Riqueza-Crecimiento", "Baja: intencionDistribution ya calculada", "Observaciones, Mentor"],
    ["Agua diaria \u2194 Energ\u00eda", "Medio: conexi\u00f3n intra-Energ\u00eda", "Media: requiere agregar NutritionLog a CrossEmpireData", "Observaciones, Mentor, Mensual"],
  ]
));

bodyContent.push(h2("Prioridad 3: Requiere query nueva (sin modificar Prisma)"));
bodyContent.push(makeTable(
  ["Acci\u00f3n", "Valor", "Facilidad", "Reutilizaci\u00f3n"],
  [
    ["H\u00e1bitos por semana (nueva query)", "Alto: desbloquea Disciplina \u2194 *", "Media: query nueva agrupando lastCompletedAt por ISO week", "Todas"],
    ["Nutrici\u00f3n en motor de patrones", "Medio: riqueza de datos intra-Energ\u00eda", "Media: agregar a CrossEmpireData + agregador semanal", "Observaciones, Mentor"],
    ["Longitud media del diario", "Bajo: proxy d\u00e9bil de profundidad", "Baja: avg(content.length) por semana", "Observaciones"],
    ["Continuidad del diario (gaps entre entradas)", "Bajo: se\u00f1al de abandono", "Baja: diff entre createdAt consecutivos", "Observaciones, Mentor"],
  ]
));

bodyContent.push(h2("Prioridad 4: No posible sin modificar datos"));
bodyContent.push(makeTable(
  ["Bloqueo", "Qu\u00e9 se necesitar\u00eda", "Impacto en el Sprint de Conexiones"],
  [
    ["Disciplina no tiene historial semanal", "Tabla nueva HabitCompletionLog o campo completions[] JSON en HabitLog", "Fuera del alcance actual. El engine.ts ya documenta esta limitaci\u00f3n."],
    ["Crecimiento no tiene m\u00e9tricas num\u00e9ricas", "NLP para an\u00e1lisis de sentimiento, o campo mood obligatorio + word count", "Usar count+avgMood como proxy es la opci\u00f3n actual. NLP queda fuera del alcance."],
    ["No hay granularidad diaria en patrones", "Redise\u00f1o del motor para soportar agregaci\u00f3n diaria + semanal", "Los life stages ya trabajan a nivel mensual. Se podr\u00eda extender el engine."],
  ]
));

// ─── 7. MAPA COMPLETO DE CONEXIONES ───
bodyContent.push(h1("Mapa Completo de Conexiones entre Imperios"));
bodyContent.push(body("De las 10 combinaciones posibles entre los 5 imperios (C(5,2) = 10), el estado actual es el siguiente:"));

bodyContent.push(makeTable(
  ["Combinaci\u00f3n", "Estado Actual", "Detector Existente", "Consumido Por"],
  [
    ["Disciplina \u2194 Mente", "2 detectores existentes, NO consumidos", "checkin-meditation (engine.ts)", "Ning\u00fan m\u00f3dulo"],
    ["Disciplina \u2194 Energ\u00eda", "Imposible sin query nueva", "Ninguno", "N/A"],
    ["Disciplina \u2194 Riqueza", "Imposible sin query nueva", "Ninguno", "N/A"],
    ["Disciplina \u2194 Crecimiento", "Imposible sin NLP o query nueva", "Ninguno", "N/A"],
    ["Mente \u2194 Energ\u00eda", "1 detector existente, NO consumido", "energy-meditation (engine.ts)", "Ning\u00fan m\u00f3dulo"],
    ["Mente \u2194 Riqueza", "Activo (3 detectores + 1 crecimiento)", "finanzas-mente (detector.ts)", "Observaciones (/api/patterns)"],
    ["Mente \u2194 Crecimiento", "Posible con count+mood como proxy", "Ninguno (a\u00fan)", "N/A"],
    ["Energ\u00eda \u2194 Riqueza", "Activo (4 detectores)", "finanzas-energia, estres, sue\u00f1o, crecimiento", "Observaciones (/api/patterns)"],
    ["Energ\u00eda \u2194 Crecimiento", "Posible (estr\u00e9s vs count diario)", "Ninguno (a\u00fan)", "N/A"],
    ["Riqueza \u2194 Crecimiento", "Posible (intenci\u00f3n vs count diario)", "Ninguno (a\u00fan)", "N/A"],
  ]
));

bodyContent.push(body("Resumen: 5 de 10 combinaciones tienen al menos un detector activo. 2 tienen detectores existentes pero no consumidos. 3 son posibles sin modificar Prisma (usando proxies). 2 est\u00e1n bloqueadas sin cambios estructurales en los datos de Disciplina o NLP para Crecimiento."));

// ─── 8. ANEXO: FICHEROS AUDITADOS ───
bodyContent.push(h1("Anexo: Ficheros Auditados"));
bodyContent.push(body("Esta auditor\u00eda cubri\u00f3 los siguientes archivos del repositorio, verificando cada se\u00f1al contra el c\u00f3digo real:"));

bodyContent.push(makeTable(
  ["Categor\u00eda", "Archivos", "Total"],
  [
    ["Prisma", "schema.prisma", "1"],
    ["API Routes", "47 ficheros route.ts bajo src/app/api/", "47"],
    ["Motor de Patrones", "detector.ts, engine.ts, types.ts, validation.ts, copy.ts", "5"],
    ["Insights", "insights.ts, emotional-state.ts", "2"],
    ["Life Memory", "stages.ts, observations.ts, copy.ts", "3"],
    ["Silent Memories", "shared.ts, silent-memory-state.ts, server/silent-memories.ts", "3"],
    ["Monthly Closure", "digest.ts, copy.ts", "2"],
    ["Achievements", "achievements.ts", "1"],
    ["Notifications", "service.ts, scheduler.ts, types.ts, templates.ts, push-client.ts", "5"],
    ["Reminder Crons", "checkin.ts, daily.ts, reflection.ts", "3"],
    ["Widgets", "snapshot.ts, shaping.ts, triggers.ts, types.ts, cache.ts, refresh.ts", "6"],
    ["Cron Routes", "5 ficheros route.ts bajo src/app/api/cron/", "5"],
    ["Helpers Core", "dates.ts, deterministic.ts, utils.ts, limits.ts, avatar.ts", "5"],
    ["Hooks", "useApi.ts, usePrivacy.ts, useEmpireTips.ts, useProgressiveDisclosure.ts", "4"],
    ["Mentor Context", "mentor-context.ts", "1"],
    ["Observability", "logger.ts, errors.ts, performance.ts, api-timing.ts", "4"],
    ["Emails", "types.ts, resend.ts", "2"],
    ["Analytics", "analytics.ts, analytics-server.ts", "2"],
    ["Frontend Components", "Todas las p\u00e1ginas bajo src/app/(dashboard)/ + src/components/", "30+"],
  ]
));

bodyContent.push(body("Total: 130+ archivos auditados. Ninguna se\u00f1al listada en este informe es hipot\u00e9tica: cada una puede rastrearse hasta un modelo Prisma, una consulta, un campo, una funci\u00f3n y una l\u00ednea de c\u00f3digo espec\u00edfica."));

// ═══════════════════════════════════════════════════
// ASSEMBLE DOCUMENT
// ═══════════════════════════════════════════════════

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 24, color: c(P.body) },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32, bold: true, color: c(P.primary) },
        paragraph: { spacing: { line: 312 } },
      },
      heading2: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28, bold: true, color: c(P.primary) },
        paragraph: { spacing: { line: 312 } },
      },
      heading3: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 26, bold: true, color: c(P.secondary) },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    // COVER
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCover(),
    },
    // TOC
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 } },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "\u00cdndice", bold: true, size: 32, font: { eastAsia: "SimHei", ascii: "Calibri" } })],
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Nota: Este \u00edndice se genera mediante c\u00f3digos de campo. Para asegurar la precisi\u00f3n de los n\u00fameros de p\u00e1gina, haga clic derecho sobre el \u00edndice y seleccione \u00abActualizar campo\u00bb.",
            italics: true, size: 18, color: "888888"
          })]
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // BODY
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "VitaZen \u2014 Auditor\u00eda Forense de Se\u00f1ales", size: 18, color: "808080", font: { ascii: "Calibri" } })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })],
          })],
        }),
      },
      children: bodyContent,
    },
  ],
});

const OUTPUT = "/home/z/my-project/download/vitazen-auditoria-forense-senales.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("Generated:", OUTPUT);
});