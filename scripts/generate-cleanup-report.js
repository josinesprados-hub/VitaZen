const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, PageNumber,
  WidthType, ShadingType, BorderStyle, TableLayoutType,
  SectionType, NumberFormat,
} = require("docx");

const P = {
  primary: "#0A1628", body: "#000000", secondary: "#6878A0",
  accent: "#5B8DB8", surface: "#F4F8FC",
  bg: "#0A1628", titleColor: "#FFFFFF", subtitleColor: "#A0B8D0",
  metaColor: "#8AA8C8", footerColor: "#607890",
};
const c = (hex) => hex.replace("#", "");

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};
const allNoBorders = {
  top: { style: BorderStyle.NONE, size: 0, space: 0 },
  bottom: { style: BorderStyle.NONE, size: 0, space: 0 },
  left: { style: BorderStyle.NONE, size: 0, space: 0 },
  right: { style: BorderStyle.NONE, size: 0, space: 0 },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, space: 0 },
  insideVertical: { style: BorderStyle.NONE, size: 0, space: 0 },
};

function heading(text, level = HeadingLevel.HEADING_1) {
  const sizes = { [HeadingLevel.HEADING_1]: 32, [HeadingLevel.HEADING_2]: 28, [HeadingLevel.HEADING_3]: 26 };
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 480 : 320, after: 160 },
    children: [new TextRun({
      text, bold: true, size: sizes[level] || 28,
      color: "000000",
      font: { ascii: "Times New Roman", eastAsia: "SimHei" },
    })],
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: "000000" })],
  });
}

function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720, hanging: 240 },
    spacing: { line: 312, after: 60 },
    children: [new TextRun({ text, size: 24, color: "000000" })],
  });
}

function makeTableCell(text, opts = {}) {
  const { bold = false, width = 50, header = false, align = AlignmentType.LEFT } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: header ? { type: ShadingType.CLEAR, fill: c(P.accent) } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
    },
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({
        text, size: 21, bold: bold || header,
        color: header ? "FFFFFF" : "000000",
        font: { ascii: "Times New Roman", eastAsia: "SimSun" },
      })],
    })],
  });
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = title.length <= cpl ? [title] : [title];
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = [title]; titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(remainingSpace * 0.45);
  const rawBottom = Math.floor(remainingSpace * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, midSpacing: 0, bottomSpacing };
}

function buildCoverR1(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 36, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split("").join("  "),
        size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" },
        characterSpacing: 40,
      })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300,
        line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({
        text: titleLines[i], size: titleSize, bold: true,
        color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" },
      })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({
        text: config.subtitle, size: 24, color: P.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" },
      })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({
        text: line, size: 24, color: P.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" },
      })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

const today = "2026-07-13";

const doc = new Document({
  styles: { default: { document: {
    run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 24, color: "000000" },
    paragraph: { spacing: { line: 312 } },
  }}},
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: buildCoverR1({
        title: "Informe de Limpieza Fase 1 \u2014 VitaZen",
        englishLabel: "OPERATIONAL CLEANUP REPORT",
        subtitle: "Eliminaci\u00f3n segura de artefactos de desarrollo y rutas muertas",
        metaLines: [
          "Repositorio: josinesprados-hub/VitaZen",
          "Commit: bbf8ef2 \u2014 main",
          "Fecha: 2026-07-13",
        ],
        footerLeft: "VitaZen",
        footerRight: "Fase 1 \u2014 2026-07-13",
        palette: P,
      }),
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({
              text: "Informe de Limpieza Fase 1 \u2014 VitaZen",
              size: 18, color: "808080", font: { ascii: "Times New Roman" },
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              children: [PageNumber.CURRENT], size: 18, color: "808080",
              font: { ascii: "Times New Roman" },
            })],
          })],
        }),
      },
      children: [
        heading("1. Resumen Ejecutivo"),
        body("Se ha completado la primera fase de limpieza del repositorio VitaZen (josinesprados-hub/VitaZen) sobre la rama principal. Esta fase se centr\u00f3 exclusivamente en la eliminaci\u00f3n de artefactos de desarrollo, archivos de investigaci\u00f3n temporal y rutas API muertas que no forman parte del comportamiento funcional de la aplicaci\u00f3n. El objetivo era reducir el ruido en el repositorio sin alterar en absoluto la funcionalidad de VitaZen."),
        body("Se eliminaron un total de 177 archivos en un \u00fanico commit (bbf8ef2), reduciendo el tracked size en aproximadamente 137.000 l\u00edneas. El build completo de Next.js se ejecut\u00f3 tras la limpieza, complet\u00e1ndose sin errores: 27 p\u00e1ginas est\u00e1ticas generadas correctamente y las 57 rutas API activas permanecen intactas. Ning\u00fan componente visual, configuraci\u00f3n de Firebase, Prisma, Stripe ni l\u00f3gica de autenticaci\u00f3n fue modificada."),

        heading("2. Alcance y Objetivos"),
        heading("2.1 Objetivo", HeadingLevel.HEADING_2),
        body("Realizar una primera fase de limpieza completamente segura del repositorio VitaZen, eliminando \u00fanicamente archivos que pudieran demostrarse al 100% como artefactos de desarrollo, resultados de b\u00fasquedas temporales o c\u00f3digo muerto. El comportamiento funcional de la aplicaci\u00f3n deb\u00eda permanecer id\u00e9ntico antes y despu\u00e9s de la limpieza."),
        heading("2.2 Criterios de eliminaci\u00f3n", HeadingLevel.HEADING_2),
        body("Cada archivo candidato fue verificado antes de su eliminaci\u00f3n mediante b\u00fasqueda de referencias en el c\u00f3digo fuente activo (directorio src/). Solo se eliminaron archivos que cumpl\u00edan todas las siguientes condiciones: no estaban importados por ning\u00fan m\u00f3dulo de la aplicaci\u00f3n, no eran referenciados por ninguna configuraci\u00f3n de Next.js, Vercel, Prisma, Firebase o Stripe, y su eliminaci\u00f3n no provoc\u00f3 errores en el build de producci\u00f3n."),

        heading("3. Evidencia Previas a la Eliminaci\u00f3n"),
        heading("3.1 Directorio can\u00f3nico del repositorio", HeadingLevel.HEADING_2),
        body("El repositorio contiene un directorio VitaZen/ en su ra\u00edz, con 340 archivos trackeados por git. Se realiz\u00f3 una comparaci\u00f3n exhaustiva para determinar cu\u00e1l es el c\u00f3digo can\u00f3nico de la aplicaci\u00f3n. La evidencia encontrada es concluyente: el directorio ra\u00edz es el c\u00f3digo can\u00f3nico. Los argumentos son los siguientes:"),
        bullet("El archivo package.json existe en la ra\u00edz con el script de build (prisma generate && next build). El archivo VitaZen/package.json es id\u00e9ntico pero no tiene node_modules/ ni .next/ asociados."),
        bullet("El archivo next.config.ts est\u00e1 en la ra\u00edz. El archivo VitaZen/next.config.ts es una copia id\u00e9ntica sin efecto en el build."),
        bullet("El archivo vercel.json con la configuraci\u00f3n de crons de producci\u00f3n est\u00e1 en la ra\u00edz. Vercel construye siempre desde la ra\u00edz del repositorio por defecto."),
        bullet("El directorio .next/ (build output) y node_modules/ solo existen en la ra\u00edz, no en VitaZen/."),
        bullet("Ning\u00fan archivo de configuraci\u00f3n (next.config.ts, middleware.ts, tsconfig.json) referencia al directorio VitaZen/."),
        bullet("Ning\u00fan archivo en src/ importa desde VitaZen/."),
        bullet("La comparaci\u00f3n diff entre VitaZen/src/ y src/ revela 76 archivos con diferencias, confirmando que VitaZen/ contiene versiones antiguas del c\u00f3digo."),
        body("Conclusi\u00f3n: el directorio VitaZen/ es una instant\u00e1nea est\u00e1tica y desactualizada del c\u00f3digo ra\u00edz. No participaba en el build ni era utilizado por Vercel. Sin embargo, dado que no estaba incluido en la lista autorizada de eliminaci\u00f3n de esta fase, se conserva intacto para una decisi\u00f3n expl\u00edcita en una fase posterior."),

        heading("3.2 Verificaci\u00f3n de archivos objetivo", HeadingLevel.HEADING_2),
        body("Cada categor\u00eda de archivos fue verificada individualmente antes de la eliminaci\u00f3n. Se ejecutaron b\u00fasquedas con ripgrep en el directorio src/ para confirmar la ausencia de referencias. Los resultados se detallan en la secci\u00f3n 4."),

        heading("4. Detalle de Archivos Eliminados"),
        heading("4.1 Resumen cuantitativo", HeadingLevel.HEADING_2),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ children: [
              makeTableCell("Categor\u00eda", { header: true, width: 35 }),
              makeTableCell("N\u00ba", { header: true, width: 12, align: AlignmentType.CENTER }),
              makeTableCell("Justificaci\u00f3n", { header: true, width: 53 }),
            ]}),
            new TableRow({ children: [
              makeTableCell("tool-results/"),
              makeTableCell("139", { align: AlignmentType.CENTER }),
              makeTableCell("Outputs de sesiones de agente (bash, grep, read). No referenciados por src/."),
            ]}),
            new TableRow({ children: [
              makeTableCell("download/"),
              makeTableCell("9", { align: AlignmentType.CENTER }),
              makeTableCell("Informes de auditor\u00eda e iconos generados. No usados por la app."),
            ]}),
            new TableRow({ children: [
              makeTableCell("agent-ctx/"),
              makeTableCell("1", { align: AlignmentType.CENTER }),
              makeTableCell("Contexto de agente (auth-pages-main.md). No referenciado por src/."),
            ]}),
            new TableRow({ children: [
              makeTableCell("db/custom.db"),
              makeTableCell("1", { align: AlignmentType.CENTER }),
              makeTableCell("SQLite local. La app usa Prisma con PostgreSQL."),
            ]}),
            new TableRow({ children: [
              makeTableCell("JSON de b\u00fasqueda (ra\u00edz)"),
              makeTableCell("6", { align: AlignmentType.CENTER }),
              makeTableCell("Resultados de b\u00fasqueda Firebase/iOS (firebase-*.json, search*.json)."),
            ]}),
            new TableRow({ children: [
              makeTableCell("JSON de b\u00fasqueda (scripts/)"),
              makeTableCell("12", { align: AlignmentType.CENTER }),
              makeTableCell("Mismos artefactos de investigaci\u00f3n almacenados en scripts/."),
            ]}),
            new TableRow({ children: [
              makeTableCell("Scripts de auditor\u00eda"),
              makeTableCell("6", { align: AlignmentType.CENTER }),
              makeTableCell("Uso \u00fanico: audit-forense.js, audit-report.py, fix-fonts.py, etc."),
            ]}),
            new TableRow({ children: [
              makeTableCell("src/app/api/route.ts"),
              makeTableCell("1", { align: AlignmentType.CENTER }),
              makeTableCell('Endpoint de prueba "Hello World". Ning\u00fan cliente lo consume.'),
            ]}),
            new TableRow({ children: [
              makeTableCell("src/app/api/silent-memories/"),
              makeTableCell("1", { align: AlignmentType.CENTER }),
              makeTableCell("Ruta sin clientes. La lib server/silent-memories.ts se mantiene."),
            ]}),
            new TableRow({ children: [
              makeTableCell("src/app/api/challenges/complete/"),
              makeTableCell("1", { align: AlignmentType.CENTER }),
              makeTableCell("DEPRECATED: retornaba 403. La lib challenge-auto-complete.ts se mantiene."),
            ]}),
            new TableRow({ children: [
              makeTableCell("TOTAL", { bold: true }),
              makeTableCell("177", { bold: true, align: AlignmentType.CENTER }),
              makeTableCell("137.027 l\u00edneas eliminadas", { bold: true }),
            ]}),
          ],
        }),

        heading("4.2 Rutas API eliminadas \u2014 Verificaci\u00f3n de seguridad", HeadingLevel.HEADING_2),
        body("Las tres rutas API eliminadas fueron verificadas individualmente para confirmar que no exist\u00edan clientes que las consumieran. La verificaci\u00f3n se realiz\u00f3 mediante b\u00fasqueda del path de la ruta en todo el c\u00f3digo fuente (src/) usando patrones de fetch:"),
        bullet("src/app/api/route.ts: B\u00fasqueda de '/api' sin subpath en llamadas fetch. Resultado: cero coincidencias. Era un endpoint de prueba que devolv\u00eda { message: 'Hello, world!' }."),
        bullet("src/app/api/silent-memories/route.ts: B\u00fasqueda de '/api/silent-memories'. Resultado: cero coincidencias en clientes. La funci\u00f3n getSilentMemoryData() que importaba sigue existiendo en src/lib/server/silent-memories.ts y es utilizada por silent-memory-state.ts. Solo se elimin\u00f3 la ruta HTTP, no la l\u00f3gica de negocio."),
        bullet("src/app/api/challenges/complete/route.ts: B\u00fasqueda de 'challenges/complete'. Resultado: cero coincidencias. La ruta estaba marcada como DEPRECATED y retornaba HTTP 403. La funcionalidad de auto-completado reside en src/lib/challenge-auto-complete.ts, importada por seis rutas API activas, y permanece intacta."),

        heading("5. Lo Que No Se Elimin\u00f3 y Por Qu\u00e9"),
        heading("5.1 Directorio VitaZen/ (340 archivos en git)", HeadingLevel.HEADING_2),
        body("Este directorio es una copia est\u00e1tica del c\u00f3digo ra\u00edz con 76 archivos desactualizados respecto a src/. La evidencia demuestra que no participa en el build ni es utilizado por Vercel. Sin embargo, no estaba incluido en la lista autorizada para esta fase y contiene 340 archivos trackeados, lo que requiere una decisi\u00f3n expl\u00edcita del propietario antes de su eliminaci\u00f3n. Se recomienda abordarlo en la fase 2."),
        heading("5.2 Componentes y p\u00e1ginas de la aplicaci\u00f3n", HeadingLevel.HEADING_2),
        body("Ning\u00fan componente visual, widget, p\u00e1gina, layout ni estilo fue modificado. Las 27 p\u00e1ginas est\u00e1ticas y las 57 rutas API activas permanecen id\u00e9nticas. Los directorios /api/dashboard/*, /api/analytics/*, /api/stripe/restore y todos los endpoints funcionales se mantienen sin cambios."),
        heading("5.3 Dependencias y configuraci\u00f3n", HeadingLevel.HEADING_2),
        body("No se modific\u00f3 package.json, bun.lock, next.config.ts, tailwind.config.ts, tsconfig.json, prisma/, vercel.json, middleware.ts ni ning\u00fan archivo de configuraci\u00f3n. Las dependencias npm permanecen intactas. Los esquemas de Prisma y las configuraciones de Firebase y Stripe no fueron tocados."),

        heading("6. Validaci\u00f3n del Build"),
        body("Tras la eliminaci\u00f3n de los 177 archivos, se ejecut\u00f3 el build completo de producci\u00f3n (npm run build = prisma generate && next build). El resultado fue exitoso sin errores de compilaci\u00f3n ni de tipos. Los indicadores clave del build son los siguientes:"),
        bullet("Prisma generate: completado en 551ms, cliente generado correctamente en ./node_modules/@prisma/client."),
        bullet("Next.js 16.1.3 (Turbopack): compilaci\u00f3n exitosa en 16.6 segundos."),
        bullet("P\u00e1ginas est\u00e1ticas generadas: 27/27, sin fallos ni p\u00e1ginas omitidas."),
        bullet("Rutas API activas: 57 rutas listadas en el output del build, incluyendo todos los endpoints funcionales y los 5 cron jobs de Vercel."),
        bullet("Rutas eliminadas confirmadas ausentes: /api, /api/silent-memories y /api/challenges/complete no aparecen en el listado de rutas del build."),
        body("Es importante destacar que la ruta /api/silent-memory (singular) permanece activa y funcional. Solo se elimin\u00f3 /api/silent-memories (plural), que era una ruta duplicada sin clientes."),

        heading("7. Confirmaci\u00f3n de Integridad Funcional"),
        body("El comportamiento funcional de VitaZen permanece id\u00e9ntico tras esta limpieza. Esto se fundamenta en las siguientes verificaciones:"),
        bullet("Ning\u00fan archivo importado por el c\u00f3digo fuente activo fue eliminado. Las \u00fanicas rutas API eliminadas no ten\u00edan clientes que las consumieran, demostrado con b\u00fasquedas exhaustivas en src/."),
        bullet("Las librer\u00edas de negocio que las rutas eliminadas importaban (getSilentMemoryData en silent-memories.ts, tryAutoCompleteChallenge en challenge-auto-complete.ts) se mantienen intactas y contin\u00faan siendo utilizadas por otras partes del sistema."),
        bullet("El build de producci\u00f3n se complet\u00f3 sin errores, generando el mismo conjunto de p\u00e1ginas y rutas API (excepto las tres rutas muertas)."),
        bullet("No se modific\u00f3 ning\u00fan archivo de configuraci\u00f3n, dependencia, esquema de base de datos, l\u00f3gica de autenticaci\u00f3n, integraci\u00f3n de Stripe o componente visual."),

        heading("8. Registro del Commit"),
        body("Se realiz\u00f3 un \u00fanico commit con mensaje descriptivo detallando todas las eliminaciones y su justificaci\u00f3n. El commit fue pushado a la rama main del repositorio josinesprados-hub/VitaZen."),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ children: [
              makeTableCell("Campo", { header: true, width: 30 }),
              makeTableCell("Valor", { header: true, width: 70 }),
            ]}),
            new TableRow({ children: [
              makeTableCell("Hash", { bold: true }),
              makeTableCell("bbf8ef2"),
            ]}),
            new TableRow({ children: [
              makeTableCell("Rama", { bold: true }),
              makeTableCell("main"),
            ]}),
            new TableRow({ children: [
              makeTableCell("Archivos cambiados", { bold: true }),
              makeTableCell("177 (todos eliminaciones)"),
            ]}),
            new TableRow({ children: [
              makeTableCell("L\u00edneas eliminadas", { bold: true }),
              makeTableCell("137.027"),
            ]}),
            new TableRow({ children: [
              makeTableCell("L\u00edneas a\u00f1adidas", { bold: true }),
              makeTableCell("0"),
            ]}),
            new TableRow({ children: [
              makeTableCell("Build post-commit", { bold: true }),
              makeTableCell("Exitoso, 0 errores"),
            ]}),
          ],
        }),
      ],
    },
  ],
});

const OUTPUT = "/home/z/my-project/download/Informe_Limpieza_Fase1_VitaZen.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("Generated:", OUTPUT);
});