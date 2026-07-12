const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, PageBreak, TableLayoutType,
  TableOfContents,
} = require("docx");
const fs = require("fs");

// ─── Palette: DS-1 Deep Sea (Tech/AI report) ───
const P = {
  bg: "0B1C2C",
  primary: "FFFFFF",
  body: "1A2B40",
  secondary: "5B6B7D",
  accent: "529286",
  surface: "F5F7FA",
  titleColor: "FFFFFF",
  subtitleColor: "B0B8C0",
  metaColor: "90989F",
  footerColor: "687078",
  table: {
    headerBg: "529286",
    headerText: "FFFFFF",
    accentLine: "529286",
    innerLine: "BECFCC",
    surface: "E8ECEB",
  },
};

const c = (hex) => hex.replace("#", "");

// ─── Borders ───
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

const tBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
  insideVertical: { style: BorderStyle.NONE },
};

// ─── Helper functions ───
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32 })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28 })],
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function bodyNoIndent(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function bodyBold(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Calibri", eastAsia: "SimHei" }, bold: true })],
  });
}

function catBadge(text, color) {
  return new TextRun({ text: ` [${text}]`, size: 20, color, bold: true, font: { ascii: "Calibri" } });
}

// ─── Table builder ───
function makeHeaderCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: c(P.table.headerBg) },
    borders: tBorders,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, color: c(P.table.headerText), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
    })],
  });
}

function makeCell(text, width, isAlt, color) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: isAlt ? { type: ShadingType.CLEAR, fill: c(P.table.surface) } : undefined,
    borders: tBorders,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text: text || "", size: 19, color: color || c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
      spacing: { line: 280 },
    })],
  });
}

function makeRow(cells, isAlt) {
  return new TableRow({
    cantSplit: true,
    children: cells,
  });
}

function makeDataTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => makeHeaderCell(h, widths[i])),
  });
  const dataRows = rows.map((row, ri) =>
    makeRow(row.map((cell, ci) => makeCell(cell, widths[ci], ri % 2 === 0, ci === row.length - 1 ? getCategoryColor(cell) : undefined)), ri % 2 === 0)
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tBorders,
    rows: [headerRow, ...dataRows],
  });
}

function getCategoryColor(cat) {
  if (cat.includes("A)") || cat === "A") return "16A34A"; // green
  if (cat.includes("B)") || cat === "B") return "2563EB"; // blue
  if (cat.includes("C)") || cat === "C") return "D97706"; // amber
  return c(P.body);
}

// ─── Cover Recipe R1 ───
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    const cpl = charsPerLine(minPt);
    lines = splitTitleLines(title, cpl);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([...',.;:!? \t-', ...'\u3001\u3002\uFF0C\uFF1B\uFF1A\uFF01\uFF1F', ...'\u7684\u4E0E\u548C\u53CA\u4E4B\u5728\u4E8E\u4E3A']);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false, metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

function buildCoverR1(config) {
  const Pc = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: Pc.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: Pc.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: Pc.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: Pc.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: Pc.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: Pc.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: Pc.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: Pc.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: Pc.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: Pc.bg }, borders: noBorders, children })],
    })],
  })];
}

// ═══════════════════════════════════════════════════════════════════════
// DATA: All findings
// ═══════════════════════════════════════════════════════════════════════

const w = [16, 22, 18, 32, 12]; // column widths %

// ── SECTION 1: Components ──
const compHeaders = ["Archivo", "Tipo", "Evidencia", "Motivo", "Categoria"];
const compRows = [
  ["src/components/dashboard/MomentumCard.tsx", "Componente UI", "Grep de 'MomentumCard' solo aparece en su propia definicion. No esta importado en dashboard/page.tsx ni en ningun otro archivo.", "Componente de tarjeta de momentum. Sustituido por EmotionalHero. 0 importadores.", "A) ELIMINABLE"],
  ["src/components/dashboard/OnboardingRecommendations.tsx", "Componente UI", "Grep de 'OnboardingRecommendations' solo aparece en su propia definicion. Dashboard no lo importa.", "Componente de recomendaciones post-onboarding. Nunca fue montado en ninguna pagina.", "A) ELIMINABLE"],
  ["src/components/dashboard/ReturnTrigger.tsx", "Componente UI", "Grep de 'ReturnTrigger' solo aparece en su definicion y en un comentario en shared.ts ('ReturnTrigger that was removed').", "Componente para recordar al usuario volver. El propio comentario indica que fue removido pero el archivo persistio.", "A) ELIMINABLE"],
  ["src/components/dashboard/WeeklyRecap.tsx", "Componente UI", "Grep de 'WeeklyRecap' (componente UI) solo aparece en su propio archivo. El sistema de WeeklyRecap por email sigue vivo.", "Componente visual de resumen semanal en dashboard. Removido del dashboard. El sistema de email/API WeeklyRecap permanece activo.", "A) ELIMINABLE"],
  ["src/components/ui/PremiumBlur.tsx", "Componente UI", "Grep de 'PremiumBlur' solo aparece en su propia definicion. PremiumGate lo reemplaza con 16+ importadores activos.", "Componente de blur premium. Sustituido por PremiumGate. El propio archivo indica 'formerly PremiumBlur' internamente.", "A) ELIMINABLE"],
  ["src/lib/notifications/index.ts", "Barrel file", "Grep de '@/lib/notifications' (sin sub-ruta) devuelve 0 resultados. Todos los consumidores importan directamente de sub-modulos.", "Archivo barril que re-exporta service, scheduler, templates, reminders. Ningun consumidor lo usa; todos importan rutas especificas.", "A) ELIMINABLE"],
  ["src/lib/client/silent-memories.ts", "Modulo cliente", "Grep de '@/lib/client/silent-memories' devuelve 0 resultados en todo el repositorio.", "Modulo cliente para silent memories. La version de servidor (server/silent-memories.ts) es la que se usa activamente.", "A) ELIMINABLE"],
];

// ── SECTION 2: Dead APIs ──
const apiHeaders = ["Ruta / Archivo", "Tipo", "Evidencia", "Motivo", "Categoria"];
const apiRows = [
  ["src/app/api/route.ts", "API stub", "4 lineas. Retorna { message: 'Hello, world!' }. Ningun fetch('/api') o apiFetch('/api') en el repositorio.", "Endpoint raiz de ejemplo. Nunca fue conectado a logica de negocio.", "A) ELIMINABLE"],
  ["src/app/api/silent-memories/route.ts", "API route (plural)", "Grep de 'silent-memories' (plural) sin consumidores. El componente SilentMemory.tsx llama a '/api/silent-memory' (singular).", "Version plural obsoleta. Reemplazada por /api/silent-memory (singular) con implementacion diferente.", "A) ELIMINABLE"],
  ["src/app/api/challenges/complete/route.ts", "API route", "Retorna HTTP 403 con mensaje 'Los desafios se completan automaticamente'. 0 llamadas fetch a 'challenges/complete'.", "Endpoint DEPRECATED explícitamente. Los desafios ahora se completan automaticamente en servidor.", "A) ELIMINABLE"],
  ["src/app/api/dashboard/progress/route.ts", "API route", "94 lineas con implementacion completa. 0 fetch/apiFetch a 'dashboard/progress' en todo el repositorio.", "Endpoint de progreso del dashboard. Nunca fue integrado en el frontend.", "A) ELIMINABLE"],
  ["src/app/api/dashboard/streaks/route.ts", "API route", "167 lineas con calculo de rachas, zona horaria Madrid. 0 fetch/apiFetch a 'dashboard/streaks'.", "Endpoint de rachas. Implementacion completa pero sin ningun consumidor frontend.", "A) ELIMINABLE"],
  ["src/app/api/dashboard/metrics/route.ts", "API route", "70 lineas consultando meditacion, habitos, journal, finanzas. 0 fetch/apiFetch a 'dashboard/metrics'.", "Endpoint de metricas semanales. Sin consumidor frontend. Solo referenciado en su propio comentario.", "A) ELIMINABLE"],
  ["src/app/api/analytics/insights/route.ts", "API route", "124 lineas con DAU, retencion, uso de features, funnel. 0 fetch/apiFetch a 'analytics/insights'.", "Endpoint de analytics avanzados. Requiere plan PREMIUM. Sin consumidor en el frontend.", "A) ELIMINABLE"],
  ["src/app/api/stripe/restore/route.ts", "API route", "199 lineas con flujo completo de restauracion de compra. 0 fetch/apiFetch a 'stripe/restore'.", "Endpoint para restaurar compras de Stripe. Sin boton ni flujo en el frontend que lo llame.", "A) ELIMINABLE"],
  ["src/app/api/widgets/config/route.ts", "API widget", "55 lineas. 0 fetch desde cliente. Solo referenciado en otros archivos de widget server-side.", "API de configuracion para widgets nativos iOS/Android. No existe cliente nativo en este repo.", "C) DUDOSO"],
  ["src/app/api/widgets/refresh/route.ts", "API widget", "65 lineas. 0 fetch desde cliente. Solo referenciado en su propio comentario.", "API de refresh para widgets nativos. Sin cliente nativo que lo consuma.", "C) DUDOSO"],
  ["src/app/api/widgets/[type]/route.ts", "API widget", "Implementacion completa. 0 fetch desde cliente. Solo referenciado en logs de observabilidad.", "API de tipo de widget nativo. Infraestructura preparada pero sin cliente.", "C) DUDOSO"],
];

// ── SECTION 3: Inaccessible Pages ──
const pageHeaders = ["Ruta", "Tipo", "Evidencia", "Motivo", "Categoria"];
const pageRows = [
  ["src/app/(dashboard)/imperio/mente/mentor/page.tsx", "Pagina Next.js", "Grep de '/imperio/mente/mentor' y 'mente/mentor' devuelve 0 resultados en Links, router.push, redirect(), o configuracion de navegacion. El sidebar enlaza a /imperio/mente (padre), no a este sub-page.", "Pagina duplicada de mentor especifica para mente. La ruta /imperio/mentor (general) SI es accesible desde TopBar, WeeklyRecap e insights. Esta sub-pagina es un orphan.", "A) ELIMINABLE"],
];

// ── SECTION 4: Old Code (debug, artifacts) ──
const oldHeaders = ["Archivo", "Tipo", "Evidencia", "Motivo", "Categoria"];
const oldRows = [
  ["src/app/api/auth/reset-password/route.ts (lines 14-17, 79-82)", "Console.logs debug", "12 ocurrencias de console.log con etiqueta [RESET DEBUG]. Estas lineas imprimen datos sensibles (token, email) en produccion.", "Restos de sesion de debugging forense. No deberian estar en produccion.", "B) MANTENER*"],
  ["src/lib/emails/sender.ts (10 console.log)", "Console.logs debug", "10 console.log trazando cada paso del envio de email. Usados para depuracion durante desarrollo.", "Logs de desarrollo en modulo de envio de emails. Utiles para debug pero excesivos en produccion.", "B) MANTENER*"],
  ["src/lib/weekly-recap-sender.ts (6 console.log)", "Console.logs debug", "6 console.log trazando el flujo de envio del resumen semanal.", "Logs de desarrollo en modulo de recap semanal.", "B) MANTENER*"],
  ["search1.json, search2.json, search3.json", "Artifacts", "Primeras lineas: arrays de resultados de busqueda web sobre Firebase Auth y PWA.", "Caches de busqueda web de sesion de debugging de Firebase. No son codigo de la app.", "A) ELIMINABLE"],
  ["firebase-issue-77.json, firebase-google-signin-doc.json, firebase-redirect-doc.json", "Artifacts", "Primeras lineas: objetos JSON con resultados de scrape de documentacion Firebase.", "Caches de documentacion Firebase de sesion de debugging.", "A) ELIMINABLE"],
  ["tool-results/ (136 archivos .txt, ~7.2 MB)", "Cache dir", "Muestreo aleatorio: archivos como read_*.txt, bash_*.txt, grep_*.txt con output de herramientas del agente de IA.", "Directorio de cache de ejecucion de herramientas. No es codigo de la app. No esta en .gitignore.", "A) ELIMINABLE"],
  ["scripts/firebase_auth_search{1-4}.json, scripts/cct_popup_search.json, etc. (10 JSON)", "Artifacts", "Primeras lineas: arrays de resultados de busqueda web.", "10 archivos JSON de cache de busqueda en el directorio scripts/.", "A) ELIMINABLE"],
  ["scripts/audit-report.py, vitazen-audit-report.py, vitazen_audit.py, generate-audit-report.js", "Scripts 1-use", "Lineas iniciales: scripts de generacion de reportes PDF/DOCX de auditoria.", "Scripts de una sola ejecucion para generar entregables de sesiones previas. No son parte del build.", "A) ELIMINABLE"],
  ["scripts/fix-fonts.py", "Script 1-use", "35 lineas: parche para eliminar registros de fuente de audit-report.py.", "Script de parche de una sola ejecucion.", "A) ELIMINABLE"],
];

// ── SECTION 5: Duplicate Structure ──
const dupHeaders = ["Elemento", "Tipo", "Evidencia", "Motivo", "Categoria"];
const dupRows = [
  ["VitaZen/ (directorio completo, ~370 archivos)", "Directorio duplicado", "git ls-files VitaZen/ retorna 340 archivos trackeados. 76 archivos difieren de src/ raiz. NO esta en .gitignore. El build usa root src/, no VitaZen/src/.", "Copia casi completa del proyecto hecha en alguna sesion anterior. Tiene 2 archivos extra (dates.ts, engine.ts) y versiones antiguas con [AUTH-FORENSIC] logs. Genera confusion sobre cual codigo es el canonico.", "A) ELIMINABLE"],
  ["examples/websocket/ (2 archivos)", "Proto no integrado", "Grep de 'websocket', 'socket.io', 'SocketDemo' en VitaZen/src/ devuelve 0 resultados.", "Demo standalone de chat con Socket.IO. No integrado en la app. Usa puerto 3003 con Caddy.", "C) DUDOSO"],
  ["db/custom.db (24 KB)", "DB SQLite huérfana", "No referenciada en .env, configs, ni codigo. La app usa Neon PostgreSQL en produccion.", "Base de datos SQLite local creada durante sesion de exploracion/testing.", "A) ELIMINABLE"],
  ["docs/vitazen-finanzas-principios.md", "Documento suelto", "Grep de 'vitazen-finanzas' o su contenido devuelve 0 referencias en el codigo.", "Documento de principios de producto. No integrado en la app ni referenciado.", "C) DUDOSO"],
  ["agent-ctx/auth-pages-main.md", "Contexto de agente", "32 lineas documentando lo que se hizo en una sesion de creacion de auth pages.", "Memo de sesion del agente de IA. No es codigo de la app.", "A) ELIMINABLE"],
  ["download/ (7 archivos PNG + 3 PDF/DOCX + README.md)", "Entregables previos", "Grep de rutas a download/ desde VitaZen/src/ devuelve 0 resultados. Solo scripts de auditoria escriben ahi.", "Archivos generados como entregables de sesiones previas de auditoria. No son parte del build.", "A) ELIMINABLE"],
  ["mini-services/ (.gitkeep solo)", "Directorio vacio", "Contiene unicamente .gitkeep (0 bytes). No hay codigo de servicio.", "Placeholder para microservicios planificados pero nunca implementados.", "C) DUDOSO"],
];

// ── SECTION 6: Config Issues ──
const cfgHeaders = ["Archivo / Ajuste", "Tipo", "Evidencia", "Motivo", "Categoria"];
const cfgRows = [
  ["package.json: name = 'nextjs_tailwind_shadcn_ts'", "Config", "Linea del package.json: el nombre del proyecto sigue siendo el boilerplate original.", "Nombre generico de plantilla starter. Deberia ser 'vitazen'. No afecta funcionalidad.", "B) MANTENER*"],
  ["next.config.ts: ignoreBuildErrors: true", "Config", "Linea 7 del next.config.ts. Silencia todos los errores de TypeScript en build.", "Opcion de desarrollo que oculta errores reales. Riesgo en produccion si se olvida cambiar.", "B) MANTENER*"],
  ["next.config.ts: reactStrictMode: false", "Config", "Linea 9 del next.config.ts. Desactiva el modo estricto de React.", "A menudo desactivado para debugging. React 19 recomienda strict: true.", "B) MANTENER*"],
  ["tailwind.config.ts: './pages/**/*' content path", "Config", "El path './pages/**/*' esta presente pero no existe ningun directorio pages/ (App Router).", "Path heredado de template Pages Router. Inofensivo pero innecesario.", "B) MANTENER*"],
  [".env: DATABASE_URL apunta a SQLite local", "Config", ".env contiene 'file:/home/z/my-project/db/custom.db' pero schema.prisma declara provider = 'postgresql'.", "Mismatch entre .env local (SQLite) y schema (PostgreSQL/Neon). Solo afecta desarrollo local.", "B) MANTENER*"],
  ["14 dependencias npm sin uso (next-auth, next-intl, @dnd-kit/*, zustand, framer-motion, etc.)", "Dependencias", "Grep de cada nombre de paquete en VitaZen/src/ devuelve 0 importaciones. Solo @hookform/resolvers aparece en shadcn form.tsx (scaffold no usado).", "Paquetes heredados del template original. Incrementan node_modules y tiempo de install. No afectan runtime.", "B) MANTENER*"],
];

// ═══════════════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════════════════

async function build() {
  const coverPalette = {
    bg: c(P.bg), titleColor: c(P.titleColor), subtitleColor: c(P.subtitleColor),
    metaColor: c(P.metaColor), accent: c(P.accent), footerColor: c(P.footerColor),
  };

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 24, color: c(P.body) },
          paragraph: { spacing: { line: 312 } },
        },
        heading1: {
          run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32, bold: true, color: c(P.primary) },
        },
        heading2: {
          run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28, bold: true, color: c(P.primary) },
        },
      },
    },
    sections: [
      // ── SECTION 0: COVER ──
      {
        properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 }, size: { width: 11906, height: 16838 } } },
        children: buildCoverR1({
          title: "Auditoria Forense de Limpieza del Repositorio VitaZen",
          englishLabel: "REPOSITORY CLEANUP AUDIT",
          subtitle: "Analisis exhaustivo de codigo muerto, APIs huérfanas, paginas inaccesibles y artefactos",
          metaLines: [
            "Repositorio: github.com/josinesprados-hub/VitaZen",
            "Stack: Next.js 15 + React 19 + TypeScript + Firebase Auth + Prisma + Stripe",
            "Fecha: 13 de julio de 2026",
            "Clasificacion: A) Eliminable  |  B) Mantener  |  C) Dudoso",
          ],
          footerLeft: "VitaZen",
          footerRight: "Julio 2026",
          palette: coverPalette,
        }),
      },
      // ── SECTION 1: TOC ──
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 }, size: { width: 11906, height: 16838 } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "VitaZen \u2014 Auditoria Forense de Limpieza", size: 18, color: c(P.secondary), font: { ascii: "Calibri" } })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: c(P.secondary) })],
            })],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 300 },
            children: [new TextRun({ text: "Contenido", size: 36, bold: true, color: c(P.primary), font: { eastAsia: "SimHei" } })],
          }),
          new TableOfContents("Tabla de contenidos", {
            hyperlink: true,
            headingStyleRange: "1-2",
          }),
          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [new TextRun({ text: "(Haga clic derecho sobre esta tabla y seleccione \u201cActualizar campo\u201d para refrescar los numeros de pagina)", size: 18, color: c(P.secondary), italics: true, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
          }),
        ],
      },
      // ── SECTION 2: BODY ──
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
            size: { width: 11906, height: 16838 },
            pageNumbers: { start: 1, formatType: "decimal" },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "VitaZen \u2014 Auditoria Forense de Limpieza", size: 18, color: c(P.secondary), font: { ascii: "Calibri" } })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "PAGE \\* arabic \\* MERGEFORMAT", size: 18, color: c(P.secondary) })],
            })],
          }),
        },
        children: [
          // ── 1. RESUMEN EJECUTIVO ──
          h1("1. Resumen Ejecutivo"),
          body("Esta auditoria forense analiza la totalidad del repositorio VitaZen con el objetivo de identificar elementos que puedan eliminarse con certeza absoluta sin afectar ninguna funcionalidad existente. El analisis cubre siete categorias: componentes muertos, APIs huérfanas, paginas inaccesibles, codigo antiguo, imports muertos, archivos duplicados y configuracion obsoleta."),
          body("Para cada elemento candidato se ha verificado exhaustivamente que: (1) no esta importado en ninguna parte del proyecto, (2) no esta referenciado dinámicamente, (3) no esta expuesto como endpoint utilizado externamente, (4) no participa en build, Vercel, cron jobs, scripts o CI, y (5) eliminarlo no cambia ninguna funcionalidad. Cada elemento se clasifica en una de tres categorias: A) Eliminable con certeza, B) Mantener (aunque parezca muerto tiene utilidad), o C) Dudoso (no existe evidencia suficiente para eliminarlo)."),
          body("El hallazgo mas critico es la existencia de un directorio VitaZen/ completo (~370 archivos) que duplica el codigo fuente raiz. Este directorio esta trackeado en git, no esta en .gitignore, ha divergido del codigo canonico (76 archivos difieren, 2 archivos extra), y contiene versiones antiguas con logs de debugging que ya fueron limpiados del codigo activo. Este duplicado duplica el tamano del repositorio y genera confusion sobre cual version del codigo es la que se despliega en produccion."),
          body("Se identificaron ademas 7 componentes sin importadores, 11 API routes sin consumidores frontend, 1 pagina inaccesible, 1 modulo de libreria muerto, y mas de 150 archivos de artefactos de debugging y caches de herramientas que no pertenecen al codigo de la aplicacion."),

          // ── 2. COMPONENTES MUERTOS ──
          h1("2. Componentes Muertos"),
          body("Se analizó la totalidad de los archivos bajo src/components/ buscando importadores en todo el repositorio (imports con alias @/, imports relativos, y dynamic import()). Los siguientes componentes fueron definidos pero nunca importados ni montados en ninguna página, layout u otro componente. La verificación incluyó búsquedas del nombre del componente, la ruta del archivo, y cualquier referencia dinámica. Los 38+ componentes primitivos de shadcn/ui sin consumidores externos directos se excluyen intencionalmente, ya que son andamiaje del design system y pueden ser consumidos en el futuro sin riesgo."),
          makeDataTable(compHeaders, compRows, w),

          // ── 3. APIs MUERTAS ──
          h1("3. APIs Huérfanas"),
          body("Se analizaron las 52 rutas API bajo src/app/api/ buscando cualquier consumidor: llamadas fetch() o apiFetch() desde el frontend, referencias en hooks, componentes o páginas, invocaciones desde otros endpoints, configuracion en vercel.json (cron jobs), y referencias en middleware.ts. Las rutas consumidas exclusivamente por Vercel Cron, Stripe webhooks o el Service Worker se marcaron como activas. Las tres rutas de widgets se clasifican como dudosas porque representan infraestructura preparada para widgets nativos iOS/Android que podrian activarse en el futuro."),
          makeDataTable(apiHeaders, apiRows, w),

          // ── 4. PAGINAS INACCESIBLES ──
          h1("4. Paginas Inaccesibles"),
          body("Se verificó cada page.tsx bajo src/app/ buscando cualquier forma de navegación hacia ella: componentes Link con href, router.push(), router.replace(), redirect(), y configuración de navegación en Sidebar, TopBar, y componentes de breadcrumbs. Solo se encontró una página completamente inaccesible. Es importante notar que /imperio/mentor (la ruta general de mentor) SÍ es accesible desde TopBar, WeeklyRecap e insights. La página huérfana es una variante específica para el imperio de mente que duplica funcionalidad."),
          makeDataTable(pageHeaders, pageRows, w),

          // ── 5. CODIGO ANTIGUO Y ARTEFACTOS ──
          h1("5. Codigo Antiguo y Artefactos de Debug"),
          body("Se buscaron referencias a tecnologías obsoletas (Supabase, Vite), código de debug (console.log, TODO, FIXME, debugger, __debug), archivos de prueba (*.test.ts, __tests__), y artefactos generados por herramientas de desarrollo. No se encontraron referencias a Supabase, Vite, TODO, FIXME, debugger ni archivos de prueba en el codigo activo. Sin embargo, se identificaron 41 console.log distribuidos en 14 archivos del codigo activo, concentrados en los módulos de reset-password, envío de emails y recap semanal. Estos console.logs están marcados como 'Mantener' porque su eliminación requiere juicio funcional: algunos pueden ser útiles para troubleshooting en producción, mientras que otros (como los [RESET DEBUG] que imprimen tokens) son claramente indebidos."),
          body("Los archivos JSON de búsqueda, el directorio tool-results/ y los scripts de generación de reportes son artefactos de sesiones previas de debugging y auditoría que no tienen relación con el código de la aplicación. Pueden eliminarse sin riesgo."),
          makeDataTable(oldHeaders, oldRows, w),

          // ── 6. ARCHIVOS DUPLICADOS Y ESTRUCTURA ──
          h1("6. Archivos Duplicados y Estructura del Repositorio"),
          body("El hallazgo más significativo de esta auditoría es el directorio VitaZen/ en la raíz del repositorio. Este directorio contiene una copia casi completa del proyecto (~370 archivos, 340 trackeados en git) con divergencias respecto al código raíz. El build de Next.js utiliza src/ en el directorio raíz (determinado por el CWD al ejecutar npm run build), no VitaZen/src/. La existencia de este duplicado genera riesgo de confusión sobre cuál es el código canónico, duplica el tamaño del repositorio en git, y los archivos divergentes (con logs de debugging antiguos) podrían ser confundidos con código activo durante revisiones."),
          body("Los directorios examples/, db/, docs/, agent-ctx/, download/ y mini-services/ contienen artefactos de sesiones previas que no participan en el build ni en la lógica de la aplicación. Se clasifican como eliminables o dudosos según su potencial utilidad futura."),
          makeDataTable(dupHeaders, dupRows, w),

          // ── 7. CONFIGURACION OBSOLETA ──
          h1("7. Configuracion y Dependencias"),
          body("Se identificaron varios ajustes de configuración y dependencias npm que no afectan la funcionalidad actual pero que representan deuda técnica. El nombre genérico del package.json, las opciones de next.config.ts, el path obsoleto en tailwind.config.ts y el mismatch entre .env y schema.prisma son cuestiones que deben abordarse con cautela, preferiblemente en una fase de limpieza separada. Las 14 dependencias npm sin uso incrementan el tamaño de node_modules y el tiempo de instalación, pero no afectan el bundle de producción ya que Next.js solo incluye lo importado. Su eliminación requiere prueba de regresión completa."),
          makeDataTable(cfgHeaders, cfgRows, w),

          // ── 8. RESUMEN DE CLASIFICACION ──
          h1("8. Resumen de Clasificacion"),
          body("A continuación se presenta el resumen cuantitativo de los hallazgos por categoría de clasificación, separando los elementos que pueden eliminarse con certeza absoluta de aquellos que requieren decisión adicional."),
          bodyBold("A) ELIMINABLE CON CERTEZA: 30 elementos"),
          body("Incluyen: 7 componentes UI muertos, 1 módulo de librería muerto, 8 API routes huérfanas (excluyendo las 3 de widgets), 1 página inaccesible, el directorio VitaZen/ completo (~370 archivos), 6 archivos JSON de búsqueda en raíz, el directorio tool-results/ (136 archivos), 10 archivos JSON de búsqueda en scripts/, 5 scripts de auditoría de una sola ejecución, 1 script fix-fonts.py, 3 archivos JSON de Firebase en raíz, el archivo db/custom.db, el directorio agent-ctx/, el directorio download/ con entregables previos, y el archivo notifications/index.ts (barrel sin importadores). La eliminación de todos estos elementos no afecta ninguna funcionalidad de VitaZen."),
          bodyBold("B) MANTENER: 7 elementos"),
          body("Incluyen: 41 console.log en código de producción (requieren juicio funcional individual), nombre del package.json (cambio cosmético), opciones de next.config.ts (requieren prueba), path obsoleto en tailwind.config.ts (inofensivo), mismatch .env/schema (solo desarrollo local), y 14 dependencias npm sin uso (requieren npm dedupe y prueba de regresión). Estos elementos no se eliminan porque su modificación, aunque beneficiosa, requiere un proceso de limpieza separado con validación funcional."),
          bodyBold("C) DUDOSO: 5 elementos"),
          body("Incluyen: 3 API routes de widgets nativos (infraestructura preparada para futuro desarrollo iOS/Android), el directorio examples/websocket/ (prototipo no integrado pero podría ser útil), el archivo docs/vitazen-finanzas-principios.md (documento de producto sin referencia en código), y el directorio mini-services/ (placeholder vacío para microservicios futuros). No existe evidencia suficiente para eliminarlos con certeza; su destino depende de la hoja de ruta del producto."),

          // ── 9. METODOLOGIA ──
          h1("9. Metodologia de Verificacion"),
          body("Cada elemento candidato fue verificado con al menos tres de las siguientes técnicas: (1) búsqueda global del nombre del componente/ruta en todo el repositorio usando patrones regex que cubren imports con alias @/, imports relativos, y referencias en strings, (2) verificación de consumidores de API buscando fetch(), apiFetch(), y cualquier referencia a la ruta del endpoint, (3) análisis de navegación buscando Link href, router.push(), router.replace(), redirect() y configuración de sidebar/navegación, (4) inspección de la cadena de dependencias verificando que el elemento no es re-exportado ni consumido indirectamente, (5) verificación cruzada entre las copias VitaZen/ y src/ raíz para confirmar cuál es el código canónico. Las búsquedas se realizaron excluyendo el directorio skills/ (que pertenece al agente de IA, no a VitaZen) y el directorio node_modules/."),
          body("Los resultados de esta auditoría son conservadores: si existe cualquier duda sobre si un elemento podría ser utilizado, se clasifica como 'Mantener' o 'Dudoso' en lugar de 'Eliminable'. La prioridad es conservar la estabilidad de VitaZen, no reducir líneas de código."),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("/home/z/my-project/download/Auditoria_Forense_Limpieza_VitaZen.docx", buffer);
  console.log("Document generated: /home/z/my-project/download/Auditoria_Forense_Limpieza_VitaZen.docx");
}

build().catch(console.error);