const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents, PageBreak,
  TableLayoutType,
} = require("docx");
const fs = require("fs");

// ═══════════════════════════════════════════════
// PALETTE — DM-1 Deep Cyan (Tech / AI)
// ═══════════════════════════════════════════════
const PAL = {
  bg: "162235", titleColor: "FFFFFF", subtitleColor: "B0B8C0",
  metaColor: "90989F", footerColor: "687078", accent: "37DCF2",
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};
const c = (hex) => hex.replace("#", "");

// ═══════════════════════════════════════════════
// BORDERS
// ═══════════════════════════════════════════════
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ═══════════════════════════════════════════════
// COVER HELPERS
// ═══════════════════════════════════════════════
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11; // Latin chars are ~half CJK width
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
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([" ", "-", "/", ":", ";", ","]);
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
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false, metaLineCount = 0, fixedHeight = 800, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = 16838 - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const rawTop = Math.floor(safeRemaining * 0.45);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

// ═══════════════════════════════════════════════
// COVER BUILDER — R1 Pure Paragraph Left
// ═══════════════════════════════════════════════
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Calibri" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: { ascii: "Calibri" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: { ascii: "Calibri" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor, font: { ascii: "Calibri" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: { ascii: "Calibri" } }),
      new TextRun({ text: "                                                    " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: { ascii: "Calibri" } }),
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

// ═══════════════════════════════════════════════
// BODY HELPERS
// ═══════════════════════════════════════════════
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 240 },
    children: [new TextRun({ text, bold: true, size: 32, color: "000000", font: { ascii: "Calibri" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, size: 28, color: "000000", font: { ascii: "Calibri" } })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: "000000", font: { ascii: "Calibri" } })],
  });
}
function p(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 24, color: "000000", font: { ascii: "Calibri" } })],
  });
}
function pBold(label, text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { after: 120, line: 312 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: "000000", font: { ascii: "Calibri" } }),
      new TextRun({ text, size: 24, color: "000000", font: { ascii: "Calibri" } }),
    ],
  });
}
function makeTable(headers, rows) {
  const t = PAL.table;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: t.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map(h => new TableCell({
          width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 21, color: t.headerText, font: { ascii: "Calibri" } })] })],
          shading: { type: ShadingType.CLEAR, fill: t.headerBg },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        })),
      }),
      ...rows.map((row, idx) => new TableRow({
        cantSplit: true,
        children: row.map(cell => new TableCell({
          width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 21, color: "000000", font: { ascii: "Calibri" } })] })],
          shading: idx % 2 === 0 ? { type: ShadingType.CLEAR, fill: t.surface } : { type: ShadingType.CLEAR, fill: "FFFFFF" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        })),
      })),
    ],
  });
}

// ═══════════════════════════════════════════════
// CONTENT — 14 SECTIONS
// ═══════════════════════════════════════════════
function buildBody() {
  const content = [];

  // ─── 1. CRITICA DEL DISENO ACTUAL ───
  content.push(h1("1. Critica del Diseno Actual"));
  content.push(h2("1.1 El problema fundamental: recordar conversaciones vs. conocer personas"));
  content.push(p("El diseno anterior de la memoria semantica del Mentor IA parte de una premisa que, tras un analisis riguroso, resulta incorrecta: trata la memoria como un sistema de almacenamiento y recuperacion de informacion, cuando deberia ser un sistema de comprension y evolucion del conocimiento sobre una persona. Esta distincion no es academica; es la diferencia entre un chatbot que lee un expediente cada vez que habla contigo y un mentor que realmente te conoce. El diseno anterior, aunque solido en su infraestructura tecnica, no supera este umbral conceptual."));
  content.push(p("El Mentor actual inyecta 18 consultas paralelas a la base de datos en cada interaccion, construye un contexto estratificado en cinco capas y entrega datos estructurados al modelo de lenguaje. Funciona como un sistema de lectura de expediente muy bien optimizado. Pero un expediente no es conocimiento. Un expediente es una fotografia estatica del pasado. El Mentor necesita una comprension dinamica que evolucione, que detecte patrones que el usuario ni siquiera ha articulado, y que entienda las relaciones entre areas de vida que aparentemente no tienen conexion."));
  content.push(p("El concepto de 'memoria semantica' del diseno anterior hereda un problema estructural de la industria: presume que almacenar fragmentos de texto categorizados constituye 'entender' al usuario. ChatGPT almacena conversaciones. Claude almacena contexto. Gemini almacena documentos. Ninguno de ellos 'conoce' a la persona. El diseno anterior replicaba este patron con mejores categorias y mas estructura, pero el patron en si es el error."));

  content.push(h2("1.2 La extraccion por keywords: el eslabon mas debil"));
  content.push(p("El diseno anterior proponia una extraccion basada en keywords como mecanismo principal para identificar informacion memorable en las conversaciones. Este enfoque tiene tres problemas criticos que lo hacen inviable como base de una ventaja competitiva. Primero, las keywords no capturan matices: la frase 'No pude dormir anoche porque estaba pensando en la presentacion' produciria las keywords 'sueno' y 'presentacion', pero perderia completamente la conexion de ansiedad que es la informacion realmente valiosa. Segundo, las keywords no detectan implicaciones: cuando un usuario dice 'Mi hija saco matricula de honor', la extraccion por keywords capturaria 'hija' y 'matricula', pero no detectaria que esto revela un valor central de orgullo familiar que motiva su disciplina. Tercero, las keywords no evolucionan: el mismo termino tiene significados diferentes en contextos diferentes, y un sistema basado en palabras no puede distinguirlos."));
  content.push(p("La extraccion por keywords es la opcion mas barata, pero 'barato' no es sinonimo de 'eficiente' cuando el objetivo es crear una ventaja competitiva real. Si VitaZen quiere que los usuarios digan 'este mentor realmente me conoce', la calidad de la extraccion es el cuello de botella mas importante del sistema entero."));

  content.push(h2("1.3 Los limites por categoria: una restriccion artificial"));
  content.push(p("El diseno anterior asignaba limites fijos por categoria de memoria (identidad, salud, finanzas, relaciones, etc.). Este enfoque, aunque facil de implementar y de razonar, crea distorsiones significativas en la comprension del usuario. Una persona que atraviesa un divorcio generara mucha mas informacion relevante sobre relaciones emocionales que sobre finanzas en un periodo determinado. Forzar un limite por categoria significa que informacion crucial sobre su estado emocional se descarta mientras se reservan espacios vacios para categorias que no son relevantes en ese momento de su vida."));
  content.push(p("Ademas, las categorias fijas no reflejan como funciona la comprension humana real. Cuando un buen amigo te conoce, no tiene '7 espacios de memoria' para diferentes aspectos de tu vida. Su comprensi on es fluida, prioriza lo importante del momento, y naturalmente presta mas atencion a lo que cambia o lo que necesita seguimiento. El diseno de memoria del Mentor deberia emular esta fluidez, no imponer estructura de base de datos."));

  content.push(h2("1.4 La falta de evolucion temporal"));
  content.push(p("Quizas el problema mas sutil pero mas importante del diseno anterior es su tratamiento de la informacion como si fuera atemporal. Las memorias se almacenan, se recuperan y se priorizan, pero no hay un mecanismo robusto para que el Mentor entienda la TRAYECTORIA del usuario. La diferencia entre 'trabaja como diseador' y 'empezo a trabajar como diseador el ano pasado despues de una crisis profesional' es abismal. La primera es un dato; la segunda es comprension. El diseno anterior no tenia un mecanismo satisfactorio para capturar esta dimension temporal de la vida de una persona."));
  content.push(p("Un mentor que conoce de verdad a alguien no solo sabe lo que esa persona es ahora. Sabe de donde viene, que ha cambiado, que ha intentado antes, que ha funcionado y que no. Esta dimension evolutiva es lo que convierte a un asistente reactivo en un acompanante de desarrollo personal."));

  // ─── 2. QUE CONSERVARIAMOS ───
  content.push(h1("2. Que Conservariamos"));
  content.push(p("No todo el diseno anterior debe descartarse. Existen elementos conceptuales y de infraestructura que son solidos y que deben servir de base para la arquitectura definitiva. La clave es distinguir entre los conceptos correctos que necesitan mejor implementacion y los conceptos incorrectos que necesitan reemplazo total."));

  content.push(h2("2.1 La estratificacion de contexto en cinco capas"));
  content.push(p("El sistema actual de buildMentorContext() organiza la informacion en cinco capas: Identidad, Senales de alto nivel, Experiencia vivida, Patrones conductuales y Memoria conversacional. Esta estratificacion es conceptualmente acertada porque reconoce que no toda la informacion tiene el mismo peso ni la misma function en la comprension del usuario. Lo que debe conservarse es el PRINCIPIO de estratificacion, no la implementacion actual. Las cinco capas actuales necesitan redefinirse para alinearse con el nuevo modelo de conocimiento, pero la idea de que el contexto tiene capas de prioridad es correcta y debe mantenerse."));

  content.push(h2("2.2 El modelo de dominios existente"));
  content.push(p("VitaZen ya tiene un modelo de datos rico con dominios bien definidos: check-ins, imperios (disciplina, mente, energia, riqueza), observaciones, perfil, habitos, meditacion, nutricion, finanzas, diario, memoria de vida, logros, timeline y cierre mensual. Este ecosistema de datos es un activo enorme que ninguna app competidora tiene. La arquitectura de memoria no debe duplicar estos datos, sino COMPLEMENTARLOS. Lo que el usuario registra activamente (check-ins, habitos, finanzas) es datos verificados de primera mano. Lo que el Mentor infiere de las conversaciones es conocimiento de segunda mano que enriquece los datos verificados. Ambas fuentes deben coexistir sin duplicarse."));

  content.push(h2("2.3 El concepto de diferenciacion FREE/ELITE"));
  content.push(p("La diferenciacion entre planes FREE y ELITE existe en el diseno actual y es correcta en su existencia, pero incorrecta en su implementacion. Actualmente la diferencia se reduce a: mas mensajes, respuestas mas largas y mas contexto inyectado. Esto no genera suficiente valor percibido para justificar una suscripcion. El concepto que debe conservarse es que los planes deben ser cualitativamente diferentes, no cuantitativamente. Lo que debe redisenarse completamente es como se materializa esa diferencia."));

  content.push(h2("2.4 La infraestructura de concurrencia y atomicidad"));
  content.push(p("El uso de pg_advisory_lock para concurrencia de hilos, el rollback atomico de creditos ante fallos de Groq, y la validacion de limites diarios con garantias de consistencia son elementos de infraestructura que funcionan correctamente y que deben mantenerse tal cual. Estos mecanismos no forman parte del diseno de memoria pero son la base sobre la que se construira, por lo que su estabilidad es critica."));

  // ─── 3. QUE ELIMINARIAMOS ───
  content.push(h1("3. Que Eliminariamos"));

  content.push(h2("3.1 Extraccion por keywords"));
  content.push(p("La extraccion basada en keywords debe eliminarse completamente y reemplazarse por un modelo de IA pequeno especializado. No hay un punto intermedio util aqui: o el sistema entiende el contexto de lo que el usuario dice, o no. Un sistema hibrido (keywords para casos simples, IA para complejos) anade complejidad sin beneficio real, porque la calidad inconsistente es peor que la calidad uniformemente baja. Si el usuario percibe que a veces el Mentor 'entiende' y a veces no, la confianza se erosiona mas rapidamente que si nunca entendiera."));

  content.push(h2("3.2 Limites rigidos por categoria"));
  content.push(p("Los limites fijos por categoria de memoria deben eliminarse. Reemplazan la inteligencia del sistema por reglas arbitrarias. Un usuario que esta pasando por una crisis financiera necesita que su Mentor entienda profundamente ese aspecto de su vida, sin importar si eso 'desbalancea' las categorias. El sistema de capacidad debe ser global e inteligente, no porcional y rigido."));

  content.push(h2("3.3 El termino 'memoria' como concepto arquitectonico"));
  content.push(p("El propio termino 'memoria semantica' debe eliminarse del vocabulario arquitectonico del proyecto. 'Memoria' implica almacenamiento y recuperacion de informacion pasada. El Mentor no necesita memoria; necesita un MODELO DE COMPRENSION del usuario. Este cambio terminologico no es cosm etico: redefine completamente como se piensa el sistema, como se disena la base de datos, como se extrae informacion y como se inyecta en el contexto. Un 'modelo de comprension' se construye, se valida y evoluciona. Una 'memoria' se almacena y se recupera. La diferencia es fundamental."));

  content.push(h2("3.4 Deteccion de patrones por correlacion de Pearson"));
  content.push(p("El sistema actual de deteccion de patrones utiliza correlacion de Pearson sobre datos semanales agregados, limitado a conexiones con finanzas. Este sistema debe eliminarse por tres motivos: primero, la correlacion de Pearson solo detecta relaciones lineales y ignora relaciones no lineales que son comunes en comportamiento humano. Segundo, su limitacion a finanzas como eje central es arbitraria y pierde conexiones valiosas entre otros imperios. Tercero, los patrones conductuales humanos son demasiado complejos para un metodo estadistico simple. La deteccion de patrones y conexiones debe migrar al modelo de IA pequeno que ya realizara la extraccion, lo que permite capturar relaciones semanticas que la estadistica no puede detectar."));

  content.push(h2("3.5 Generacion de titulos con el modelo de 70B"));
  content.push(p("El sistema actual genera titulos de conversacion utilizando el mismo modelo llama-3.3-70b-versatile que se usa para las respuestas del Mentor. Esto es un desperdicio de recursos: generar un titulo de 5-8 palabras no requiere un modelo de 70 mil millones de parametros. Esta funcionalidad debe migrar al modelo pequeno de extraccion, reduciendo el coste por titulo en mas de un 90% y liberando capacidad del modelo principal para lo que realmente importa: la calidad de la respuesta al usuario."));

  // ─── 4. QUE REDISENARIAMOS ───
  content.push(h1("4. Que Redisenariamos"));

  content.push(h2("4.1 El pipeline completo de extraccion"));
  content.push(p("El pipeline de extraccion debe redisenarse desde cero. En lugar de un sistema de keywords post-conversacion, se implementara un sistema de extraccion basado en un modelo de IA pequeno y rapido que analiza cada respuesta del usuario en tiempo real. Este modelo recibira el mensaje del usuario, el contexto de la conversacion actual, y el modelo de comprension existente del usuario, y producira una salida estructurada en JSON que incluya: observaciones nuevas o actualizadas, deteccion de contradicciones con el conocimiento existente, patrones o conexiones entre areas de vida, y cambios en el estado emocional o situacional del usuario."));
  content.push(p("El modelo pequeno actuara como un 'filtro de comprension' entre el usuario y el sistema de almacenamiento. No es un chatbot; es un extractor especializado con un prompt disenado unicamente para identificar informacion que enriquece el modelo de comprension del usuario. Su salida es JSON estructurado, no texto libre, lo que minimiza las alucinaciones y garantiza consistencia."));

  content.push(h2("4.2 El modelo de datos: de memorias a unidades de conocimiento"));
  content.push(p("El modelo de datos debe pasar de un esquema de 'memorias' (texto almacenado con metadatos) a un esquema de 'unidades de conocimiento' (observaciones estructuradas con contexto temporal, confianza y relaciones). Cada unidad de conocimiento no es un fragmento de texto que se almacena; es una comprension que se ha construido, validado y contextualizado. La diferencia es sutil pero transformadora: una memoria se almacena y se recupera tal cual. Una unidad de conocimiento se integra en un modelo mas amplio, se contrasta con otras unidades, y evoluciona con el tiempo."));

  content.push(h2("4.3 El sistema de contradicciones"));
  content.push(p("Las contradicciones no deben 'resolverse' eliminando la informacion anterior. Deben 'evolucionarse' creando un registro de transicion que preserve la trayectoria del usuario. Cuando un usuario que antes mencionaba tener pareja ahora dice que se ha separado, el sistema no debe sobrescribir 'tiene pareja' con 'no tiene pareja'. Debe crear una transicion: 'se separo (junio 2025)', marcar la observacion anterior como historica, y actualizar el modelo de comprension para reflejar el nuevo estado. Esta capacidad de rastrear EVOLUCION, no solo estado actual, es lo que diferencia a un mentor de un asistente."));

  content.push(h2("4.4 Las conexiones entre imperios"));
  content.push(p("El sistema de conexiones entre imperios debe redisenarse completamente para cubrir TODAS las combinaciones posibles, no solo las que involucran finanzas. El modelo de IA pequeno de extraccion detectara conexiones entre cualquier par de imperios: como el sueno afecta a la disciplina, como la ansiedad afecta a las finanzas, como la meditacion mejora el enfoque, como la alimentacion influye en la energia, como el crecimiento personal modifica el resto de areas. Estas conexiones se almacenaran como entidades de primera clase en el modelo de datos, no como derivaciones estadisticas."));

  content.push(h2("4.5 Silent Memories y Life Stages"));
  content.push(p("Los Silent Memories actuales (5 tipos, pool FIFO de 20 observaciones, 13 textos posibles) y los Life Stages (7 sabores, agregacion mensual) son conceptos valiosos pero mal implementados. El pool FIFO de 20 es demasiado pequeno y no tiene ningun criterio de prioridad. Los 13 textos de observacion son limitados y genericos. Los Life Stages tienen observaciones de 5-6 palabras que no capturan matices. Estos conceptos deben absorberse en el modelo de comprension unificado, donde las 'observaciones silenciosas' se convierten en 'inferencias del modelo' y los 'estados de vida' se convierten en 'fase de trayectoria' dentro del modelo temporal."));

  // ─── 5. ARQUITECTURA DEFINITIVA ───
  content.push(h1("5. Arquitectura Definitiva"));
  content.push(h2("5.1 Principio rector: comprender, no almacenar"));
  content.push(p("La arquitectura definitiva se basa en un principio fundamental: el Mentor no almacena informacion sobre el usuario; construye y mantiene un MODELO DE COMPRENSION del usuario. Este principio cambia radicalmente cada decision de diseno. No se disena un sistema de almacenamiento con estrategias de recuperacion. Se disena un sistema de comprension con estrategias de evolucion. La diferencia no es cosm etica; afecta la eleccion de tecnologia, el modelo de datos, el flujo de extraccion, la inyeccion de contexto, y la experiencia del usuario."));

  content.push(h2("5.2 Componentes de la arquitectura"));
  content.push(p("La arquitectura se compone de cuatro componentes principales que trabajan en conjunto. Primero, el Extractor de Comprension: un modelo de IA pequeno (Llama 3.1 8B o equivalente via Groq) que analiza cada respuesta del usuario y produce observaciones estructuradas. Segundo, el Modelo de Comprension: la base de datos estructurada que almacena las unidades de conocimiento sobre el usuario, organizadas por tipo, confianza, relevancia y contexto temporal. Tercero, el Integrador de Contexto: el componente que toma el Modelo de Comprension y lo convierte en un prompt natural que el Mentor puede usar para comportarse como alguien que conoce al usuario. Cuarto, el Motor de Evolucion: el sistema que detecta contradicciones, actualiza confianza, gestiona la prioridad de las unidades de conocimiento, y ejecuta el decaimiento natural de informacion obsoleta."));

  content.push(h2("5.3 Por que un modelo pequeno de IA para la extraccion"));
  content.push(p("La decision de usar un modelo de IA pequeno (8B) en lugar de extraccion por keywords es la decision arquitectonica mas importante de este diseno. Las razones son multiples y profundas. En primer lugar, calidad: un modelo de 8B parametros puede entender contexto, detectar emociones implicitas, identificar relaciones causales y distinguir entre lo que un usuario dice literalmente y lo que realmente comunica. Las keywords no pueden hacer ninguna de estas cosas. En segundo lugar, coste: un modelo de 8B via Groq cuesta una fraccion del modelo de 70B utilizado para las respuestas del Mentor. Una llamada de extraccion cuesta aproximadamente un 1% del coste de una respuesta del Mentor. El coste incremental es marginal. En tercer lugar, velocidad: Groq procesa modelos pequenos en menos de 200 milisegundos, lo que permite la extraccion en tiempo real sin que el usuario perciba latencia adicional. En cuarto lugar, salida estructurada: el modelo puede producir JSON directamente, lo que elimina la necesidad de parsing posterior y garantiza consistencia en el formato de las observaciones."));

  content.push(makeTable(
    ["Enfoque", "Calidad", "Coste por extraccion", "Latencia", "Captura matices"],
    [
      ["Keywords", "Baja", "~$0.0001", "<10ms", "No"],
      ["IA 8B (Groq)", "Alta", "~$0.0003", "~150ms", "Si"],
      ["IA 70B (Groq)", "Muy alta", "~$0.003", "~500ms", "Si"],
      ["Hibrido", "Inconsistente", "Variable", "Variable", "Parcial"],
    ]
  ));
  content.push(p("Tabla 1: Comparacion de enfoques de extraccion. El modelo 8B ofrece el mejor equilibrio entre calidad, coste y velocidad."));

  content.push(h2("5.4 Hechos vs. Observaciones"));
  content.push(p("El usuario pregunta si la memoria deberia almacenar hechos ('Trabaja como diseador') u observaciones ('Actualmente trabaja como diseador'). La respuesta es: ninguna de las dos opciones tal como estan planteadas. El sistema debe almacenar UNIDADES DE CONOCIMIENTO con contexto temporal y nivel de confianza. Un 'hecho' es una afirmacion estatica que puede quedar obsoleta sin que el sistema lo detecte. Una 'observacion' es un acercamiento mejor, pero sigue siendo un fragmento de texto sin estructura. Una unidad de conocimiento, en cambio, incluye: el contenido de la observacion, su alcance temporal (actual, historico, recurrente), la fecha en que se observo por primera vez, la ultima fecha en que se confirmo, el nivel de confianza, la fuente (declaracion directa del usuario, inferencia del modelo, dato verificado de la app), y el numero de veces que se ha mencionado o reforzado."));
  content.push(p("Esta estructura permite que el Mentor entienda no solo QUE sabe del usuario, sino CUANDO lo aprendio, QUE TAN SEGURO esta de esa informacion, y si ha EVOLUCIONADO con el tiempo. Es la diferencia entre leer un dato en un formulario y conocer a una persona."));

  content.push(h2("5.5 El sistema de prioridad inteligente"));
  content.push(p("En lugar de limites por categoria (Opcion A) o un limite global simple (Opcion B), la arquitectura definitiva implementa un sistema de prioridad inteligente (Opcion C) con orientacion categorical suave. El sistema funciona asi: existe un limite global de aproximadamente 150 unidades de conocimiento por usuario, suficiente para meses o anos de comprension profunda. Cada unidad tiene una puntuacion de prioridad calculada a partir de multiples factores: recencia (cuando fue la ultima vez que esta informacion fue relevante), frecuencia de mencion (cuantas veces el usuario ha referenciado esta informacion), saliencia emocional (si la informacion esta relacionada con estados emocionales intensos), relevancia para objetivos actuales (si la informacion es critica para los objetivos que el usuario esta persiguiendo ahora), y diversidad categorial (un factor que bonifica las unidades de categorias subrepresentadas para evitar desbalances extremos)."));
  content.push(p("Este sistema es mas complejo que un limite simple, pero es el unico enfoque que realmente sirve al usuario en lugar de servir a la base de datos. Cuando el numero de unidades alcanza el limite global, las unidades con menor puntuacion de prioridad entran en un estado de 'decaimiento' progresivo: primero se archivan (no se inyectan en el contexto pero se conservan en la base de datos), y si permanecen archivadas durante un periodo prolongado sin ser referenciadas, se eliminan permanentemente."));

  // ─── 6. MODELO DE DATOS DEFINITIVO ───
  content.push(h1("6. Modelo de Datos Definitivo"));
  content.push(h2("6.1 Entidad principal: KnowledgeUnit"));
  content.push(p("La entidad central del sistema es KnowledgeUnit (Unidad de Conocimiento). Cada registro representa una comprension que el Mentor tiene sobre el usuario. No es un fragmento de conversacion ni un dato aislado; es una pieza de un modelo de comprension en evolucion. A continuacion se describen los campos principales y su justificacion."));

  content.push(makeTable(
    ["Campo", "Tipo", "Proposito"],
    [
      ["id", "UUID", "Identificador unico"],
      ["userId", "UUID", "Relacion con el usuario"],
      ["type", "Enum", "identidad, estado_actual, patron, conexion, inferencia, transicion, objetivo, valor"],
      ["content", "Text", "Contenido de la observacion en lenguaje natural"],
      ["domains", "String[]", "Imperios relacionados: disciplina, mente, energia, riqueza, crecimiento"],
      ["confidence", "Float 0-1", "Nivel de confianza del sistema en esta observacion"],
      ["source", "Enum", "user_stated, model_inferred, app_verified, pattern_detected"],
      ["temporalScope", "Enum", "current, historical, recurring, aspirational"],
      ["firstSeen", "DateTime", "Primera vez que se observo"],
      ["lastConfirmed", "DateTime", "Ultima vez que se confirmo o reforzo"],
      ["timesMentioned", "Int", "Veces que el usuario ha referenciado esta informacion"],
      ["priorityScore", "Float", "Puntuacion calculada para gestion de capacidad"],
      ["status", "Enum", "active, archived, superseded, invalidated"],
      ["supersededBy", "UUID?", "Referencia a la unidad que reemplaza esta"],
      ["sourceThreadIds", "UUID[]", "Conversaciones de donde se extrajo esta informacion"],
      ["metadata", "JSON", "Datos adicionales especificos por tipo"],
    ]
  ));
  content.push(p("Tabla 2: Esquema de la entidad KnowledgeUnit."));

  content.push(h2("6.2 Entidad: KnowledgeConnection"));
  content.push(p("La entidad KnowledgeConnection almacena las relaciones que el Mentor ha detectado entre diferentes areas de la vida del usuario. Estas conexiones son de primera clase, no derivaciones secundarias. Representan el nivel mas profundo de comprension: no solo saber que el usuario duerme poco y que su disciplina fluctua, sino entender que DUERME POCO PORQUE su disciplina fluctua, o que su disciplina fluctua CUANDO duerme poco. La direccion y naturaleza de la causalidad importa."));

  content.push(makeTable(
    ["Campo", "Tipo", "Proposito"],
    [
      ["id", "UUID", "Identificador unico"],
      ["userId", "UUID", "Relacion con el usuario"],
      ["description", "Text", "Descripcion de la conexion en lenguaje natural"],
      ["domainFrom", "Enum", "Imperio origen"],
      ["domainTo", "Enum", "Imperio destino"],
      ["direction", "Enum", "unidireccional, bidireccional, correlacional"],
      ["confidence", "Float 0-1", "Confianza en la conexion"],
      ["source", "Enum", "user_stated, model_detected, data_corroborated"],
      ["firstDetected", "DateTime", "Primera vez que se detecto"],
      ["reinforcementCount", "Int", "Veces que se ha observado esta conexion"],
      ["status", "Enum", "active, weakened, broken"],
    ]
  ));
  content.push(p("Tabla 3: Esquema de la entidad KnowledgeConnection."));

  content.push(h2("6.3 Entidad: KnowledgeEvolution"));
  content.push(p("La entidad KnowledgeEvolution registra los cambios en las unidades de conocimiento a lo largo del tiempo. Es el mecanismo que permite al Mentor entender la TRAYECTORIA del usuario, no solo su estado actual. Cada vez que una unidad de conocimiento se actualiza significativamente, se crea un registro de evolucion. Esto permite reconstruir la historia completa de como el Mentor fue comprendiendo al usuario, identificar puntos de inflexion, y detectar patrones de cambio que no son visibles en una fotografia estatica."));

  content.push(h2("6.4 Relaciones y claves"));
  content.push(p("El modelo de datos utiliza claves compuestas para garantizar la integridad referencial y la consulta eficiente. La relacion principal es userId como clave foranea en todas las entidades, lo que permite consultas por usuario de forma directa. Las relaciones entre entidades son: KnowledgeUnit puede tener cero o mas KnowledgeEvolution (historial de cambios), KnowledgeUnit puede ser referenciada por otra KnowledgeUnit a traves de supersededBy (cadena de evolucion), KnowledgeConnection se asocia con dos o mas KnowledgeUnits a traves de los dominios que conecta. No se utilizan claves compuestas complejas; la simplicidad de las relaciones permite que PostgreSQL maneje el esquema eficientemente sin joins costosos."));

  content.push(h2("6.5 Estrategia de contradicciones"));
  content.push(p("Cuando el sistema detecta una contradiccion (por ejemplo, el usuario decia tener pareja y ahora dice que se separo), el flujo es el siguiente: primero, se crea una nueva unidad de conocimiento con el estado actualizado. Segundo, la unidad anterior se marca como 'superseded' y se enlaza a la nueva a traves de supersededBy. Tercero, opcionalmente, se crea una unidad de tipo 'transicion' que describe el cambio: 'Se separo despues de 5 anos de relacion (junio 2025)'. Cuarto, se crea un registro en KnowledgeEvolution para ambas unidades. Quinto, el Integrador de Contexto inyecta la transicion de forma natural, de modo que el Mentor se comporte como alguien que sabe lo que ha pasado sin necesidad de decirlo explicitamente."));

  content.push(h2("6.6 Inferencias del modelo"));
  content.push(p("El sistema permite al Mentor crear sus propias unidades de conocimiento a traves de inferencias. Estas inferencias son observaciones que el usuario nunca ha declarado explicitamente pero que el modelo de IA detecta a partir de patrones recurrentes. Por ejemplo, despues de meses de conversacion, el modelo podria inferir: 'El miedo a decepcionar a su hija es un motor principal de su busqueda de disciplina'. Para evitar falsas conclusiones, las inferencias estan sujetas a reglas estrictas. Solo se crean inferencias con un nivel de confianza minimo de 0.7. Cada inference debe rastrear las unidades de conocimiento que la sustentan (source observations). Si el usuario contradice una inferencia, se degrada inmediatamente a 'invalidated'. Las inferencias nunca se expresan como hechos en el prompt del Mentor; se expresan con un nivel de incertidumbre que refleja su confianza."));
  content.push(p("El sistema de inferencias es lo que convierte al Mentor de un sistema reactivo (que responde a lo que el usuario dice) en un sistema proactivo (que anticipa necesidades y comprende motivaciones profundas). Es la capa mas poderosa del modelo de comprension y tambien la que requiere mas cuidado en su implementacion."));

  // ─── 7. FLUJO COMPLETO ───
  content.push(h1("7. Flujo Completo"));
  content.push(h2("7.1 Flujo por cada mensaje del usuario"));
  content.push(p("El flujo completo del sistema por cada mensaje del usuario se compone de los siguientes pasos. Primero, el usuario envia un mensaje a traves de la interfaz. Segundo, el sistema de autenticacion valida la identidad y el plan del usuario. Tercero, se verifica el limite diario de mensajes (solo para FREE). Cuarto, se adquiere un advisory lock para garantizar la consistencia del hilo. Quinto, se construye el contexto del Mentor combinando los datos verificables de la app (check-ins, habitos, imperios) con las unidades de conocimiento activas del modelo de comprension (solo para ELITE). Sexto, se genera la respuesta del Mentor usando el modelo de 70B. Septimo, se guardan los mensajes de forma atomica. Octavo, se invoca el Extractor de Comprension (modelo de 8B) de forma asincrona para analizar la conversacion y actualizar el modelo de comprension (solo para ELITE). Noveno, se genera el titulo del hilo si es necesario, usando el modelo de 8B en lugar del de 70B. Decimo, se actualiza el hilo y se libera el lock."));

  content.push(h2("7.2 Flujo del Extractor de Comprension (asincrono)"));
  content.push(p("El Extractor de Comprension opera de forma asincrona despues de que se ha enviado la respuesta al usuario, lo que significa que no anade latencia perceptible a la conversacion. Recibe como entrada: el mensaje del usuario, los ultimos 3-5 mensajes de la conversacion actual para contexto, y las unidades de conocimiento activas del usuario para deteccion de contradicciones. Produce como salida un JSON estructurado con: observaciones nuevas o actualizadas (array de objetos con type, content, domains, confidence), contradicciones detectadas (array de referencias a unidades existentes que contradicen el nuevo mensaje), conexiones entre imperios (array de objetos con domainFrom, domainTo, description), y actualizaciones de prioridad (sugerencias de unidades que deberian aumentar o disminuir su prioridad)."));
  content.push(p("El prompt del Extractor esta disenado estrictamente como un extractor, no como un conversador. Su unica funcion es identificar informacion que enriquece el modelo de comprension. No genera respuestas para el usuario, no opina, no aconseja. Es una herramienta de analisis especializada con un ambito de responsabilidad bien definido."));

  content.push(h2("7.3 Flujo de Integracion de Contexto"));
  content.push(p("El Integrador de Contexto es el componente que transforma las unidades de conocimiento del modelo de comprension en texto natural que se inyecta en el prompt del Mentor. Su funcion es critica: debe convertir datos estructurados en una narrativa coherente que el Mentor pueda usar para comportarse como alguien que conoce al usuario, sin que el Mentor jamas diga frases como 'segun tus datos' o 'en conversaciones anteriores'. El integrador organiza las unidades de conocimiento en un perfil narrativo que incluye: identidad y contexto personal, estado actual y situaciones recientes, patrones conductuales relevantes, conexiones entre areas de vida, objetivos y aspiraciones, y un resumen de la trayectoria reciente del usuario. Este perfil se inyecta como parte del system prompt, no como mensajes de usuario, lo que permite al Mentor referenciar esta informacion de forma natural sin revelar su origen."));

  // ─── 8. ESTRATEGIA DE MEMORIA DEFINITIVA ───
  content.push(h1("8. Estrategia de Memoria Definitiva"));
  content.push(h2("8.1 Que merece ser conocimiento"));
  content.push(p("No toda la informacion que el usuario comparte merece convertirse en una unidad de conocimiento permanente. La estrategia de seleccion se basa en tres criterios: durabilidad (es informacion que seguira siendo relevante en semanas o meses?), singularidad (es algo que define al usuario como persona, no un comentario efimero?), y accionabilidad (es informacion que puede ayudar al Mentor a dar mejor acompanamiento?). Basandose en estos criterios, la siguiente informacion merece ser conocimiento permanente: identidad personal (profesion, familia, ubicacion, valores centrales), estado vital actual (situaciones laborales, relacionales, de salud que estan activas), patrones conductuales recurrentes (tendencias que se repiten a lo largo del tiempo), objetivos y aspiraciones (lo que el usuario quiere lograr), valores y motivaciones profundas (lo que impulsa al usuario), y conexiones entre areas de vida (como un aspecto de su vida afecta a otro)."));

  content.push(h2("8.2 Que no merece ser conocimiento"));
  content.push(p("La siguiente informacion NO debe convertirse en unidades de conocimiento permanentes: estados emocionales efimeros ('hoy estoy triste' no es un patron, es un momento), quejas puntuales sin contexto recurrente, datos que ya estan registrados en la app de forma estructurada (check-ins, habitos, finanzas), opiniones sobre temas generales que no revelan nada sobre la persona, y solicitudes de informacion ('como se hace meditacion?'). La regla general es: si la informacion no ayudaria al Mentor a entender MEJOR al usuario dentro de un mes, no debe ser conocimiento permanente. La informacion efimera se maneja a traves del contexto conversacional de la sesion actual, no del modelo de comprension."));

  content.push(h2("8.3 Cuando actualizar"));
  content.push(p("Las unidades de conocimiento se actualizan en tres escenarios. Primero, confirmacion: cuando el usuario menciona informacion que ya existe como unidad de conocimiento, se incrementa timesMentioned y se actualiza lastConfirmed. Segundo, contradiccion: cuando el usuario dice algo que contradice una unidad existente, se ejecuta el flujo de contradicciones descrito en la seccion 6.5. Tercero, inferencia: cuando el modelo de extraccion detecta un patron que no ha sido explicitamente declarado, se crea una nueva unidad de tipo 'inferencia' si supera el umbral de confianza minimo. Ademas, existe un proceso periodico (semanal) que reevalua las puntuaciones de prioridad de todas las unidades y ejecuta el decaimiento de las que han perdido relevancia."));

  content.push(h2("8.4 Cuando olvidar"));
  content.push(p("El olvido en el sistema no es una eliminacion brusca sino un decaimiento progresivo. Cuando una unidad de conocimiento baja su puntuacion de prioridad por debajo de un umbral, entra en estado 'archived'. Las unidades archivadas no se inyectan en el contexto del Mentor pero se mantienen en la base de datos. Si una unidad archivada es mencionada nuevamente por el usuario, se reactiva automaticamente. Si una unidad permanece archivada durante mas de 6 meses sin ser referenciada, se elimina permanentemente. Este enfoque de 'decaimiento suave' evita la perdida accidental de informacion importante mientras mantiene el modelo de comprension enfocado y relevante."));

  content.push(h2("8.5 Cuantas unidades por conversacion"));
  content.push(p("El Extractor de Comprension puede producir entre 0 y 5 unidades de conocimiento nuevas o actualizadas por conversacion. La mayoria de conversaciones produciran 0-2 unidades relevantes. Conversaciones profundas o de crisis pueden producir 3-5. El limite de 5 evita la sobrecarga del sistema y garantiza que solo la informacion mas significativa se incorpore al modelo de comprension. Este limite es por conversacion, no por mensaje, y se aplica de forma suave: si el extractor produce mas de 5, se seleccionan las de mayor confianza y las demas se descartan con un log para analisis posterior."));

  // ─── 9. DIFERENCIACION FREE/ELITE ───
  content.push(h1("9. Diferenciacion Definitiva entre FREE y ELITE"));
  content.push(p("La diferenciacion entre los planes FREE y ELITE debe ser cualitativa, no cuantitativa. El usuario de FREE debe tener un Mentor excelente para el dia a dia. El usuario de ELITE debe tener un mentor personal que le acompana durante meses o anos. La diferencia no esta en la cantidad de mensajes ni en la longitud de las respuestas. Esta en la PROFUNDIDAD de la comprension y la CONTINUIDAD del acompanamiento."));

  content.push(makeTable(
    ["Dimension", "FREE", "ELITE"],
    [
      ["Mensajes diarios", "15", "Ilimitados"],
      ["Modelo de comprension", "No (solo contexto de sesion)", "Si (persistente, evolutivo)"],
      ["Extraccion por IA", "No", "Si (8B asincrono por mensaje)"],
      ["Contexto inyectado", "Datos verificables del dia", "Datos + modelo de comprension completo"],
      ["Conexiones entre imperios", "No", "Si (todas las combinaciones)"],
      ["Inferencias del modelo", "No", "Si (con salvaguardas)"],
      ["Seguimiento de objetivos", "Sesion actual", "Meses/anos"],
      ["Historial de conversaciones", "Ultimos 10 mensajes", "Ultimos 30 mensajes"],
      ["Generacion de titulos", "Modelo 8B", "Modelo 8B"],
      ["Pantalla de transparencia", "No", "Si ('Lo que el Mentor sabe de ti')"],
      ["Edicion/eliminacion de conocimiento", "N/A", "Si (RGPD)"],
    ]
  ));
  content.push(p("Tabla 4: Diferenciacion definitiva entre planes FREE y ELITE."));

  content.push(h2("9.1 La experiencia FREE: un excelente Mentor para hoy"));
  content.push(p("El plan FREE ofrece un Mentor que es excelente en lo que hace: proporciona gui a inmediata basandose en los datos que el usuario ha registrado en la app (check-in del dia, habitos recientes, progreso en imperios) y en el contexto de la conversacion actual. No tiene memoria entre conversaciones, pero dentro de una sesion puede mantener un hilo coherente. Es un companero de check-in diario que te escucha, te orienta y te motiva. Para muchos usuarios, esto es suficiente y valioso. El limite de 15 mensajes diarios controla los costes operativos y crea un incentivo claro para la upgrade."));

  content.push(h2("9.2 La experiencia ELITE: un mentor personal que evoluciona contigo"));
  content.push(p("El plan ELITE transforma radicalmente la experiencia. El Mentor tiene un modelo de comprension persistente que se construye y evoluciona con cada conversacion. Sabe quien eres, que te importa, que has intentado antes, que funciona y que no. Detecta conexiones entre areas de tu vida que tu ni siquiera has articulado. Sigue tus objetivos a largo plazo y te recuerda tu progreso. Te acompana en crisis y celebra tus logros. La diferencia no es que 'recuerda mas cosas'; es que te COMPRENDE como persona. Un usuario ELITE despues de tres meses deberia sentir que su Mentor le conoce mejor que la mayoria de las personas con las que interactua regularmente."));

  content.push(h2("9.3 Por que esta diferencia genera valor real"));
  content.push(p("La diferencia entre FREE y ELITE no es cosm etica porque no se basa en limitar artificialmente la experiencia FREE. El plan FREE es genuinamente util y bien ejecutado. La upgrade a ELITE no desbloquea funciones ocultas; desbloquea una DIMENSION completamente nueva de la relacion con el Mentor. Es la diferencia entre ir al gimnasio por tu cuenta (FREE) y tener un entrenador personal que lleva un registro de tu progreso, ajusta tus rutinas segun tu evolucion, y entiende tus patrones de motivacion (ELITE). Ambas experiencias son validas y valiosas. Pero la segunda es objetivamente mas profunda y mas dificil de replicar."));

  // ─── 10. VENTAJA COMPETITIVA REAL ───
  content.push(h1("10. Como Conseguir que el Mentor Sea una Ventaja Competitiva Real"));
  content.push(p("Una ventaja competitiva real debe cumplir cinco criterios: aporta valor real al usuario, es dificil de copiar, hace que VitaZen sea diferente, seguira siendo util dentro de cinco anos, y merece la complejidad tecnica que requiere. Cada propuesta de esta arquitectura se evalua contra estos cinco criterios."));

  content.push(h2("10.1 Comprension temporal evolutiva"));
  content.push(p("Ninguna app de bienestar actual ofrece un mentor que entienda la TRAYECTORIA del usuario. Todas operan con fotografia estatica: ven tu check-in de hoy, tus habitos de esta semana, tus finanzas de este mes. Ninguna entiende que esta es la tercera vez que intentas dejar de fumar, que la primera vez fallaste por estres laboral y la segunda por una ruptura. Esta comprension temporal es la ventaja competitiva mas poderosa de VitaZen porque es acumulativa: cuanto mas tiempo usa el usuario la app, mejor le conoce el Mentor, y mayor es la barrera de cambio hacia un competidor. Es dificil de copiar porque requiere meses de datos acumulados. Sera util dentro de cinco anos porque la naturaleza humana no cambia. Y merece la complejidad tecnica porque el valor que genera es proporcional al tiempo de uso, lo que reduce el churn y aumenta el LTV."));

  content.push(h2("10.2 Conexiones entre todos los imperios"));
  content.push(p("La capacidad de detectar y rastrear conexiones entre todas las areas de la vida del usuario (disciplina, mente, energia, riqueza, crecimiento) es unica en el mercado. Las apps competidoras tratan cada area de forma aislada. VitaZen puede ser la primera en ofrecer una vision HOLISTICA que entienda como el sueno afecta a las finanzas, como la ansiedad afecta a la disciplina, como la alimentacion afecta a la energia, y como todo esta interconectado. Esta capacidad es dificil de copiar porque requiere un modelo de IA especializado y un modelo de datos disenado especificamente para almacenar conexiones, no solo datos aislados."));

  content.push(h2("10.3 Inferencias profundas con salvaguardas"));
  content.push(p("La capacidad del Mentor de detectar patrones que el usuario no ha articulado (por ejemplo, que su miedo a decepcionar a su hija es el motor principal de su disciplina) es una experiencia transformadora. Cuando un mentor dice algo que el usuario no ha dicho pero que sabe que es cierto, se genera un momento de 'este mentor realmente me entiende' que ninguna otra app puede reproducir. Las salvaguardas (umbral de confianza, rastreo de fuentes, degradacion ante contradiccion) garantizan que las inferencias sean precisas y que el usuario mantenga el control. Esta capacidad es extremadamente dificil de copiar porque requiere un modelo de extraccion entrenado especificamente para el dominio de desarrollo personal y un sistema de confianza acumulativa que toma meses en construirse."));

  content.push(h2("10.4 Comportamiento natural, nunca mecanico"));
  content.push(p("El Mentor nunca debe decir 'segun tus datos', 'en conversaciones anteriores', o 'recuerdo que'. Estas frases rompen la ilusion de que el Mentor es una persona que te conoce. La integracion del modelo de comprension a traves del system prompt, no como mensajes de usuario, permite que la informacion fluya de forma natural. El Mentor simplemente COMPORTA COMO ALGUIEN QUE TE CONOCE. Esta es una ventaja sutil pero poderosa: la diferencia entre un sistema que te dice lo que sabe y un sistema que demuestra lo que sabe a traves de como te habla. Copiar esto no requiere tecnologia; requiere understanding de como las personas interactuan naturalmente, y eso es mucho mas dificil de replicar."));

  content.push(h2("10.5 Transparencia y control del usuario"));
  content.push(p("La pantalla 'Lo que el Mentor sabe de ti' es una ventaja competitiva por tres motivos. Primero, genera CONFIANZA: los usuarios pueden ver exactamente que comprende el Mentor de ellos, lo que elimina la sensacion de 'caja negra' que las personas tienen con la IA. Segundo, cumple con el RGPD de forma que los competidores probablemente no hacen: el usuario puede acceder, editar y eliminar cualquier unidad de conocimiento. Tercero, es un diferenciador de marketing poderoso: 'Nuestro Mentor no tiene secretos para ti. Puedes ver exactamente lo que sabe y corregirlo si te equivocas.' Ninguna app de bienestar con IA ofrece este nivel de transparencia. Es dificil de copiar porque requiere un modelo de datos estructurado (no embeddings opacos) y una interfaz de gestion dedicada."));

  // ─── 11. RIESGOS ───
  content.push(h1("11. Riesgos"));
  content.push(h2("11.1 Alucinaciones del modelo de extraccion"));
  content.push(p("El mayor riesgo tecnico es que el modelo de 8B produzca observaciones incorrectas o alucinadas que se incorporen al modelo de comprension. Una inferencia falsa ('el usuario tiene problemas con el alcohol' cuando en realidad hablaba de reducir el cafe) podria corroer la confianza del usuario si se manifiesta en una conversacion posterior. Las mitigaciones incluyen: el sistema de confianza que requiere multiples menciones antes de que una observacion alcance alta prioridad, la capacidad del usuario de revisar y eliminar unidades de conocimiento desde la pantalla de transparencia, la separacion estricta entre 'user_stated' (alta confianza) y 'model_inferred' (requiere validacion), y la degradacion inmediata cuando el usuario contradice una observacion."));

  content.push(h2("11.2 Privacidad y RGPD"));
  content.push(p("El modelo de comprension almacena informacion personal del usuario de forma persistente. Esto crea obligaciones bajo el RGPD que deben gestionarse proactivamente. El derecho de acceso se cumple a traves de la pantalla 'Lo que el Mentor sabe de ti'. El derecho de supresion se cumple permitiendo la eliminacion individual de unidades de conocimiento y la eliminacion completa del modelo de comprension con un solo boton. El derecho de rectificacion se cumple permitiendo la edicion manual de cualquier unidad. El principio de minimizacion de datos se cumple mediante el decaimiento automatico de informacion obsoleta. La base legal es el consentimiento explicito del usuario al activar el plan ELITE."));

  content.push(h2("11.3 Costes inesperados"));
  content.push(p("El Extractor de Comprension anade un coste por mensaje para usuarios ELITE. Aunque el modelo de 8B es economico (~$0.0003 por llamada), si un usuario ELITE envia 50 mensajes al dia, son $0.015 diarios, o $0.45 mensuales por usuario. Con mil usuarios ELITE activos, son $450 mensuales. Este coste es manejable pero debe monitorearse. La mitigacion principal es que la extraccion ocurre de forma asincrona y puede omitirse para mensajes triviales (saludos, preguntas puntuales) que el extractor clasifica como 'sin observaciones relevantes'."));

  content.push(h2("11.4 Retencion de usuarios y dependencia"));
  content.push(p("Existe un riesgo inverso: si el modelo de comprension funciona demasiado bien, los usuarios desarrollan una dependencia emocional del Mentor que va mas alla del bienestar practico. Esto es un riesgo etico, no tecnico. Las mitigaciones incluyen: el Mentor nunca debe posicionarse como terapeuta o profesional de salud mental, las inferencias del modelo deben ser visibles y editables por el usuario, y el sistema debe incluir senales que recuerden al usuario que el Mentor es una herramienta de acompanamiento, no un sustituto de relaciones humanas o profesionales."));

  // ─── 12. COSTES ───
  content.push(h1("12. Costes"));
  content.push(h2("12.1 Coste de infraestructura adicional"));
  content.push(p("La arquitectura no requiere infraestructura nueva significativa. Se utiliza PostgreSQL existente con una tabla adicional (KnowledgeUnit, KnowledgeConnection, KnowledgeEvolution). No se requiere base de datos vectorial, sistema de embeddings, ni infraestructura de busqueda semantica. El coste de almacenamiento es marginal: 150 unidades de conocimiento por usuario con un promedio de 200 bytes por unidad son 30KB por usuario. Para 10,000 usuarios ELITE, son 300MB de datos estructurados. El coste de consultas es bajo: las queries son simples SELECT con filtros por userId y status, indexes por userId y priorityScore, y ninguna join compleja."));

  content.push(h2("12.2 Coste del modelo de extraccion"));
  content.push(p("El coste del modelo de 8B via Groq es el unico coste incremental significativo. Con un estimado de 30 mensajes promedio por usuario ELITE al dia y un ratio de extraccion del 60% (no todos los mensajes generan observaciones), el coste por usuario es de aproximadamente $0.005 diarios o $0.16 mensuales. Este coste se absorbe facilmente dentro del precio de suscripcion ELITE. Ademas, la migracion de la generacion de titulos del modelo de 70B al 8B AHORRA costes que parcialmente compensan el coste nuevo."));

  content.push(makeTable(
    ["Concepto", "Coste por usuario/mes", "10K usuarios ELITE/mes"],
    [
      ["Extraccion 8B (30 msgs/dia, 60% ratio)", "~$0.16", "~$1,600"],
      ["Generacion de titulos 8B (ahorro vs 70B)", "-$0.02", "-$200"],
      ["Almacenamiento PostgreSQL", "~$0.01", "~$100"],
      ["Consultas DB", "~$0.005", "~$50"],
      ["Total incremental", "~$0.16", "~$1,550"],
    ]
  ));
  content.push(p("Tabla 5: Estimacion de costes incrementales mensuales."));

  content.push(h2("12.3 Retorno sobre la inversion"));
  content.push(p("Si la arquitectura de comprension profunda aumenta la retencion de usuarios ELITE en un 10% (de 3 meses a 3.3 meses de retencion promedio), y el precio de suscripcion ELITE es de $10/mes, el ingreso adicional por 10,000 usuarios es de $30,000/mes contra un coste incremental de $1,550/mes. El retorno sobre la inversion es de aproximadamente 19x. Incluso con estimaciones conservadoras (5% de mejora en retencion), el ROI es de casi 10x. La arquitectura no solo es viable economicamente; es uno de las inversiones con mayor retorno potencial en todo el sistema."));

  // ─── 13. ESCALABILIDAD ───
  content.push(h1("13. Escalabilidad"));
  content.push(h2("13.1 Escalabilidad de la base de datos"));
  content.push(p("El esquema propuesto es altamente escalable dentro de PostgreSQL. Cada usuario tiene un maximo de 150 unidades de conocimiento activas y un maximo historico de aproximadamente 500 (incluyendo archivadas y superseded). Para 100,000 usuarios, son 50 millones de registros en KnowledgeUnit, un volumen que PostgreSQL maneja sin problemas con los indexes adecuados. Los indexes principales son: userId + status (para consultas de contexto), userId + priorityScore DESC (para ordenamiento por prioridad), y userId + type (para filtrado por categoria). No se necesitan joins complejas ni consultas agregadas costosas en el camino critico."));

  content.push(h2("13.2 Escalabilidad del Extractor de Comprension"));
  content.push(p("El Extractor opera de forma asincrona, lo que significa que no esta en el camino critico de la respuesta al usuario. Esto permite implementar un sistema de colas (por ejemplo, basado en las capacidades de PostgreSQL o en un sistema de colas ligero) que gestione los picos de demanda. Si mil usuarios envian un mensaje al mismo tiempo, las mil respuestas del Mentor se generan inmediatamente (usando el modelo de 70B), y las mil extracciones se encolan para procesamiento posterior. El usuario no percibe ningun retraso. En caso de sobrecarga, las extracciones de menor prioridad (mensajes cortos, saludos) pueden omitirse sin impacto en la calidad del modelo de comprension."));

  content.push(h2("13.3 Escalabilidad a largo plazo"));
  content.push(p("A medida que el numero de usuarios crece, los principales puntos de atencion son: la tabla KnowledgeUnit crece linealmente con el numero de usuarios pero permanece acotada por usuario (max 500 registros), las consultas por usuario son O(log n) con los indexes adecuados, el Extractor puede paralelizarse horizontalmente agregando mas capacidad de procesamiento de colas, y la integracion de contexto (construir el prompt del Mentor) podria optimizarse con cache de perfiles de usuario que se invalidan cuando se actualiza el modelo de comprension. No se anticipan cuellos de botella arquitectonicos para los proximos anos con el volumen proyectado."));

  // ─── 14. JUSTIFICACION TECNICA ───
  content.push(h1("14. Justificacion Tecnica de Todas las Decisiones"));
  content.push(h2("14.1 Por que PostgreSQL + Prisma, no Vector DB"));
  content.push(p("La decision de mantener PostgreSQL + Prisma como unica tecnologia de almacenamiento se justifica por cuatro razones. Primera, el conocimiento esta ESTRUCTURADO por naturaleza: cada unidad de conocimiento tiene tipo, categoria, dominios, confianza, estado temporal y prioridad. La recuperacion se realiza por tipo y prioridad, no por similitud semantica. No necesitas buscar 'todas las memorias relacionadas con la ansiedad'; necesitas seleccionar 'las 20 unidades de conocimiento activas con mayor prioridad'. Segunda, el volumen por usuario es pequeno (max 500 registros historicos). La busqueda semantica con embeddings solo es necesaria cuando tienes miles de documentos no estructurados que necesitas comparar por significado. Con 150 unidades estructuradas, una query SQL es mas rapida y mas precisa. Tercera, anadir una base de datos vectorial (pgvector, Pinecone, Weaviate) anade complejidad operacional (mantenimiento de indices, sincronizacion de datos, modelo de embeddings) para un beneficio marginal. Cuarta, Prisma ya esta integrado en el proyecto y el equipo lo domina. Sin embargo, el modelo de datos se disena para ser 'vector-ready': si en el futuro se necesita busqueda semantica (por ejemplo, para encontrar 'todas las unidades relacionadas con el miedo al fracaso' sin una categoria explicita), se puede anadir una columna de embedding y un indice pgvector sin cambiar la arquitectura."));

  content.push(h2("14.2 Por que un modelo de IA pequeno, no keywords"));
  content.push(p("La justificacion se resume en una pregunta: cual es el cuello de botella de la calidad del Mentor? No es el tamano del modelo de respuesta (70B es suficiente). No es la cantidad de datos inyectados (el sistema ya tiene acceso a 18 fuentes de datos). El cuello de botella es la CALIDAD DE LA EXTRACCION: que informacion se captura, que matices se preservan, que patrones se detectan. Un sistema de keywords tiene una calidad de extraccion intrinsecamente limitada. Un modelo de 8B tiene una calidad de extraccion que es un orden de magnitud superior. La diferencia de coste ($0.0002 por llamada) es irrelevante comparada con la diferencia de calidad. Si el objetivo es crear una ventaja competitiva real, la calidad de la extraccion es donde se gana o se pierde el juego."));

  content.push(h2("14.3 Por que observaciones con contexto temporal, no hechos"));
  content.push(p("Un 'hecho' ('Trabaja como diseador') es una afirmacion estatica que no tiene mecanismo de actualizacion. Cuando la persona cambia de trabajo, el hecho se vuelve incorrecto y el sistema necesita detectar el cambio, lo cual es dificil si no hay contexto temporal. Una 'observacion con contexto temporal' ('Trabaja como diseador desde marzo 2025, mencionado 7 veces, ultima confirmacion junio 2025') es auto-explicativa: incluye su propia informacion de validez, frecuencia y antiguedad. El Mentor no necesita un sistema separado para determinar si un dato es actual; la propia observacion contiene esa informacion. Ademas, las observaciones con contexto temporal permiten reconstruir la trayectoria del usuario: si una observacion se marca como 'superseded', el sistema sabe que algo cambio y puede rastrear la evolucion. Un hecho sobrescrito pierde esta historia permanentemente."));

  content.push(h2("14.4 Por que prioridad inteligente, no limites por categoria"));
  content.push(p("Los limites por categoria son facil de implementar pero producen resultados suboptimos para el usuario. Un artista que esta pasando por una crisis financiera necesitara mas unidades de conocimiento sobre finanzas que sobre disciplina en ese periodo. Un limite por categoria forzaria al sistema a descartar informacion financiera valiosa para mantener espacio en categorias menos relevantes. La prioridad inteligente resuelve este problema de forma natural: las unidades relacionadas con la crisis financiera tendran alta prioridad por recencia, frecuencia de mencion y saliencia emocional, y ocuparan el espacio que necesitan independientemente de la categoria a la que pertenezcan. El factor de diversidad categorial incluido en la formula de prioridad evita que una sola categoria domine completamente el modelo de comprension, proporcionando el beneficio de los limites por categoria sin su rigidez."));

  content.push(h2("14.5 Por que asincrono, no sincrono"));
  content.push(p("La extraccion de comprension opera de forma asincrona (despues de enviar la respuesta al usuario) por tres razones. Primera, latencia percibida: el usuario no debe esperar mas tiempo por su respuesta solo para que el sistema actualice su modelo de comprension. La experiencia debe ser instantanea. Segunda, resiliencia: si el modelo de extraccion falla (timeout, error de API, respuesta malformada), la conversacion principal no se ve afectada. El error se registra y la extraccion se reintentara en el proximo mensaje. Tercera, desacoplamiento: la extraccion puede optimizarse, actualizarse o reemplazarse sin afectar el camino critico de la conversacion. Esto permite iterar rapidamente sobre el extractor sin riesgo de degradar la experiencia del usuario."));

  content.push(h2("14.6 Por que el modelo de comprension no es RAG"));
  content.push(p("RAG (Retrieval-Augmented Generation) es una tecnica disenada para encontrar informacion relevante en un corpus grande de documentos no estructurados. El modelo de comprension del Mentor no es un corpus de documentos; es un modelo estructurado de conocimiento sobre una persona. No necesitas 'recuperar' informacion relevante de miles de documentos; necesitas SELECCIONAR las unidades de conocimiento mas relevantes de un conjunto pequeno y bien organizado (max 150 unidades activas). RAG anade complejidad (embeddings, vector store, retrieval logic, chunking) para resolver un problema que no existe: el modelo de comprension ya esta estructurado, categorizado y priorizado. La seleccion se hace con una query SQL simple y directa. Usar RAG para esto seria como usar una base de datos vectorial para gestionar una agenda de contactos: funciona, pero es innecesariamente complejo."));

  return content;
}

// ═══════════════════════════════════════════════
// ASSEMBLE DOCUMENT
// ═══════════════════════════════════════════════
async function main() {
  const coverConfig = {
    title: "Arquitectura Definitiva del Mentor IA",
    subtitle: "Revision Final - Fase 2.1",
    englishLabel: "VITAZEN  -  TECHNICAL  ARCHITECTURE",
    metaLines: [
      "Documento de diseno tecnico",
      "Version definitiva pre-implementacion",
      "Julio 2026",
    ],
    footerLeft: "VitaZen",
    footerRight: "Confidencial",
    palette: PAL,
  };

  const bodyContent = buildBody();

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: "Calibri" }, size: 24, color: "000000" },
          paragraph: { spacing: { line: 312 } },
        },
        heading1: {
          run: { font: { ascii: "Calibri" }, size: 32, bold: true, color: "000000" },
          paragraph: { spacing: { before: 480, after: 240, line: 312 } },
        },
        heading2: {
          run: { font: { ascii: "Calibri" }, size: 28, bold: true, color: "000000" },
          paragraph: { spacing: { before: 360, after: 180, line: 312 } },
        },
        heading3: {
          run: { font: { ascii: "Calibri" }, size: 24, bold: true, color: "000000" },
          paragraph: { spacing: { before: 240, after: 120, line: 312 } },
        },
      },
    },
    sections: [
      // SECTION 1: COVER (no page numbers, no margins)
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: buildCoverR1(coverConfig),
      },
      // SECTION 2: TOC (Roman numerals)
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
            pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
          },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: { ascii: "Calibri" } })],
            })],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 360 },
            children: [new TextRun({ text: "INDICE", bold: true, size: 32, color: "000000", font: { ascii: "Calibri" } })],
          }),
          new TableOfContents("Table of Contents", {
            hyperlink: true,
            headingStyleRange: "1-3",
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [new TextRun({
              text: "Nota: Este indice se genera mediante codigos de campo. Para garantizar la precision de los numeros de pagina, haga clic derecho sobre el indice y seleccione \"Actualizar campo\".",
              italics: true, size: 18, color: "888888", font: { ascii: "Calibri" },
            })],
          }),
          new Paragraph({ children: [new PageBreak()] }),
        ],
      },
      // SECTION 3: BODY (Arabic numerals starting from 1)
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
              children: [new TextRun({ text: "VitaZen - Arquitectura del Mentor IA", size: 18, color: "808080", font: { ascii: "Calibri" } })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: { ascii: "Calibri" } })],
            })],
          }),
        },
        children: bodyContent,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = "/home/z/my-project/download/VitaZen-Arquitectura-Definitiva-Mentor-IA-Fase-2.1.docx";
  fs.writeFileSync(outputPath, buffer);
  console.log("Document generated: " + outputPath);
}

main().catch(console.error);