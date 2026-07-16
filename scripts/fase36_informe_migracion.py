#!/usr/bin/env python3
"""
FASE 3.6 — Informe Forense de Migracion Prisma
Mensajes Favoritos: isFavorited + favoritedAt + indice
"""

import sys, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib.colors import HexColor
from datetime import datetime

# ━━ PATHS ━━
OUTPUT_DIR = "/home/z/my-project/download"
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "FASE_3.6_Informe_Migracion_Prisma_Favoritos.pdf")

# ━━ FONTS ━━
FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerif', f'{FONT_DIR}/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerif-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSerif-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')
registerFontFamily('DejaVuSerif', normal='DejaVuSerif', bold='DejaVuSerif-Bold')

# ━━ PALETTE (Dark Cascade) ━━
BG_DARK       = HexColor('#0a0a0a')
BG_SECTION    = HexColor('#111111')
ACCENT        = HexColor('#c8a55a')
ACCENT_DIM    = HexColor('#8a7040')
TEXT_WHITE     = HexColor('#e8e8e8')
TEXT_MUTED     = HexColor('#999999')
TEXT_DIM       = HexColor('#666666')
BORDER_LINE    = HexColor('#2a2a2a')
GREEN_OK       = HexColor('#4ade80')
RED_FAIL       = HexColor('#f87171')
AMBER_WARN     = HexColor('#fbbf24')
TABLE_HEADER   = HexColor('#1a1a1a')
TABLE_ROW_ODD  = HexColor('#0f0f0f')
TABLE_ROW_EVEN = HexColor('#141414')

# ━━ PAGE ━━
PAGE_W, PAGE_H = A4
MARGIN_L = 25 * mm
MARGIN_R = 25 * mm
MARGIN_T = 25 * mm
MARGIN_B = 25 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

# ━━ STYLES ━━
s_title = ParagraphStyle(
    'Title', fontName='DejaVuSans-Bold', fontSize=22, leading=28,
    textColor=TEXT_WHITE, alignment=TA_LEFT, spaceAfter=4*mm,
)
s_subtitle = ParagraphStyle(
    'Subtitle', fontName='DejaVuSans', fontSize=11, leading=15,
    textColor=ACCENT, alignment=TA_LEFT, spaceAfter=8*mm,
)
s_section = ParagraphStyle(
    'Section', fontName='DejaVuSans-Bold', fontSize=14, leading=19,
    textColor=ACCENT, alignment=TA_LEFT, spaceBefore=8*mm, spaceAfter=4*mm,
    borderPadding=(0, 0, 1, 0),
)
s_body = ParagraphStyle(
    'Body', fontName='DejaVuSerif', fontSize=9.5, leading=15,
    textColor=TEXT_WHITE, alignment=TA_JUSTIFY, spaceAfter=3*mm,
)
s_body_left = ParagraphStyle(
    'BodyLeft', fontName='DejaVuSerif', fontSize=9.5, leading=15,
    textColor=TEXT_WHITE, alignment=TA_LEFT, spaceAfter=3*mm,
)
s_code = ParagraphStyle(
    'Code', fontName='DejaVuSans', fontSize=8, leading=12,
    textColor=HexColor('#a8d8a8'), backColor=HexColor('#0d0d0d'),
    borderPadding=(4, 6, 4, 6), spaceAfter=3*mm,
)
s_muted = ParagraphStyle(
    'Muted', fontName='DejaVuSerif', fontSize=8.5, leading=13,
    textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=2*mm,
)
s_label = ParagraphStyle(
    'Label', fontName='DejaVuSans-Bold', fontSize=8.5, leading=12,
    textColor=TEXT_DIM, alignment=TA_LEFT,
)
s_table_header = ParagraphStyle(
    'TH', fontName='DejaVuSans-Bold', fontSize=8.5, leading=12,
    textColor=TEXT_WHITE, alignment=TA_CENTER,
)
s_table_cell = ParagraphStyle(
    'TC', fontName='DejaVuSerif', fontSize=8.5, leading=12,
    textColor=TEXT_WHITE, alignment=TA_LEFT,
)
s_table_cell_center = ParagraphStyle(
    'TCC', fontName='DejaVuSerif', fontSize=8.5, leading=12,
    textColor=TEXT_WHITE, alignment=TA_CENTER,
)
s_footer = ParagraphStyle(
    'Footer', fontName='DejaVuSans', fontSize=7, leading=10,
    textColor=TEXT_DIM, alignment=TA_CENTER,
)
s_verdict_ok = ParagraphStyle(
    'VOK', fontName='DejaVuSans-Bold', fontSize=9, leading=13,
    textColor=GREEN_OK, alignment=TA_LEFT,
)
s_verdict_fail = ParagraphStyle(
    'VFail', fontName='DejaVuSans-Bold', fontSize=9, leading=13,
    textColor=RED_FAIL, alignment=TA_LEFT,
)
s_verdict_warn = ParagraphStyle(
    'VWarn', fontName='DejaVuSans-Bold', fontSize=9, leading=13,
    textColor=AMBER_WARN, alignment=TA_LEFT,
)


def hr():
    return HRFlowable(
        width="100%", thickness=0.5, color=BORDER_LINE,
        spaceBefore=4*mm, spaceAfter=4*mm,
    )

def section(n, title):
    return Paragraph(f'<font color="{ACCENT.hexval()}">0{n}.</font>  {title}', s_section)

def body(text):
    return Paragraph(text, s_body)

def body_left(text):
    return Paragraph(text, s_body_left)

def code_block(text):
    return Paragraph(text.replace('\n', '<br/>').replace(' ', '&nbsp;'), s_code)

def label(text):
    return Paragraph(text, s_label)

def muted(text):
    return Paragraph(text, s_muted)

def verdict_ok(text):
    return Paragraph(text, s_verdict_ok)

def verdict_fail(text):
    return Paragraph(text, s_verdict_fail)

def verdict_warn(text):
    return Paragraph(text, s_verdict_warn)

def make_table(headers, rows, col_widths=None):
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n
    header_paras = [Paragraph(h, s_table_header) for h in headers]
    data = [header_paras]
    for row in rows:
        data.append([Paragraph(str(c), s_table_cell) if i == 0 else Paragraph(str(c), s_table_cell_center) for i, c in enumerate(row)])
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER),
        ('TEXTCOLOR', (0, 0), (-1, 0), TEXT_WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.3, BORDER_LINE),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_ODD if i % 2 == 1 else TABLE_ROW_EVEN
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


def draw_page_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG_DARK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # accent line at top
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.5)
    canvas.line(MARGIN_L, PAGE_H - 18*mm, PAGE_W - MARGIN_R, PAGE_H - 18*mm)
    # footer
    canvas.setFont('DejaVuSans', 7)
    canvas.setFillColor(TEXT_DIM)
    canvas.drawCentredString(PAGE_W / 2, 12*mm, f"FASE 3.6  |  Migracion Prisma Favoritos  |  Forense  |  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    canvas.restoreState()


def build_report():
    doc = SimpleDocTemplate(
        OUTPUT_FILE,
        pagesize=A4,
        leftMargin=MARGIN_L, rightMargin=MARGIN_R,
        topMargin=MARGIN_T, bottomMargin=MARGIN_B,
    )
    story = []

    # ━━━ COVER ━━━
    story.append(Spacer(1, 30*mm))
    story.append(Paragraph("FASE 3.6", ParagraphStyle(
        'PhaseNum', fontName='DejaVuSans-Bold', fontSize=48, leading=52,
        textColor=ACCENT, alignment=TA_LEFT,
    )))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("Migracion Prisma", s_title))
    story.append(Paragraph("Mensajes Favoritos", s_title))
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Informe Forense de Auditoria y Ejecucion", s_subtitle))
    story.append(hr())
    story.append(Spacer(1, 6*mm))

    meta_data = [
        ["Proyecto", "VitaZen"],
        ["Repositorio", "github.com/josinesprados-hub/VitaZen"],
        ["Fecha", datetime.now().strftime("%Y-%m-%d %H:%M Europe/Madrid")],
        ["Motor", "Prisma 7.8.0 + PostgreSQL (Neon)"],
        ["Objetivo", "Sincronizar isFavorited, favoritedAt e indice en AIMessage"],
        ["Resultado", "BLOQUEADO — Sin URL Neon en .env"],
    ]
    for label_t, val_t in meta_data:
        story.append(Paragraph(f'<font color="{ACCENT.hexval()}">{label_t}:</font>  {val_t}', s_body_left))

    story.append(PageBreak())

    # ━━━ 01. ESTADO INICIAL DE PRISMA ━━━
    story.append(section(1, "Estado Inicial de Prisma"))
    story.append(body(
        "Se ejecuto <font name='DejaVuSans'>prisma validate</font> contra el archivo "
        "<font name='DejaVuSans'>prisma/schema.prisma</font> del proyecto VitaZen. El schema "
        "utiliza el nuevo sistema de configuracion <font name='DejaVuSans'>prisma.config.ts</font> "
        "(earlyAccess) que lee la URL de conexion desde la variable de entorno "
        "<font name='DejaVuSans'>DATABASE_URL</font>. La validacion del schema arroja resultado "
        "positivo: el archivo es sintacticamente correcto, los modelos estan bien definidos, las "
        "relaciones son consistentes, y los indices compuestos cumplen con la sintaxis de Prisma. "
        "No se detectan errores estructurales ni warnings en la definicion del esquema."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_ok("[OK] prisma validate — Schema valido"))
    story.append(Spacer(1, 2*mm))
    story.append(body(
        "El generador configurado es <font name='DejaVuSans'>prisma-client-js</font> y el "
        "proveedor de base de datos declarado es <font name='DejaVuSans'>postgresql</font>. "
        "El Prisma Client se genero correctamente con <font name='DejaVuSans'>prisma generate</font> "
        "en 557ms, produciendo la version 7.8.0 del cliente. Todos los tipos TypeScript generados "
        "incluyen los campos <font name='DejaVuSans'>isFavorited</font> y "
        "<font name='DejaVuSans'>favoritedAt</font> del modelo AIMessage, lo que confirma que "
        "el schema refleja correctamente la intencion de la FASE 3.6."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_ok("[OK] prisma generate — Client v7.8.0 generado correctamente"))

    # ━━━ 02. ESTADO INICIAL DE LA BASE DE DATOS ━━━
    story.append(section(2, "Estado Inicial de la Base de Datos"))
    story.append(body(
        "La verificacion del estado de la base de datos revelo un hallazgo critico que impide "
        "cualquier operacion de migracion. El archivo <font name='DejaVuSans'>.env</font> en "
        "ambas ubicaciones (<font name='DejaVuSans'>/home/z/my-project/.env</font> y "
        "<font name='DejaVuSans'>/home/z/my-project/VitaZen/.env</font>) contiene unicamente "
        "la siguiente linea:"
    ))
    story.append(code_block("DATABASE_URL=file:/home/z/my-project/db/custom.db"))
    story.append(body(
        "Esta URL corresponde a una base de datos SQLite local (protocolo <font name='DejaVuSans'>file:</font>), "
        "lo cual es incompatible con el proveedor <font name='DejaVuSans'>postgresql</font> declarado en "
        "<font name='DejaVuSans'>schema.prisma</font>. Al ejecutar <font name='DejaVuSans'>prisma migrate status</font>, "
        "Prisma devuelve el error P1013: <i>\"The provided database string is invalid. datasource.url must "
        "start with the protocol postgresql:// or postgres://\"</i>. Esto significa que es imposible determinar "
        "el estado actual de la base de datos Neon de produccion, verificar si las columnas ya existen, "
        "o ejecutar cualquier migracion sin una URL de conexion valida a PostgreSQL."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_fail("[BLOQUEO] Sin URL Neon PostgreSQL en .env — migracion imposible"))

    # ━━━ 03. MIGRACION EJECUTADA ━━━
    story.append(section(3, "Migracion Ejecutada"))
    story.append(body(
        "No se ejecuto ninguna migracion. El intento de verificar el estado con "
        "<font name='DejaVuSans'>prisma migrate status</font> fallo inmediatamente debido a la "
        "URL invalida. No existe la carpeta <font name='DejaVuSans'>prisma/migrations/</font> en "
        "ninguno de los dos niveles del proyecto (<font name='DejaVuSans'>/home/z/my-project/</font> "
        "ni <font name='DejaVuSans'>/home/z/my-project/VitaZen/</font>), lo que indica que este "
        "entorno nunca ha ejecutado migraciones versionadas de Prisma contra la base de datos real. "
        "El archivo <font name='DejaVuSans'>db/custom.db</font> es una base de datos SQLite local "
        "de 24 KB que se utiliza unicamente para desarrollo o pruebas unitarias, no para produccion."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_fail("[NO EJECUTADA] Migracion bloqueada por ausencia de URL Neon"))

    # ━━━ 04. SQL GENERADO ━━━
    story.append(section(4, "SQL Generado (Resumen)"))
    story.append(body(
        "No se genero SQL porque no fue posible conectar a la base de datos. Sin embargo, basandose "
        "en la diferencia entre el schema actual (que ya incluye los campos) y el estado esperado de "
        "la base de datos sin dichos campos, el SQL que Prisma generaria para esta migracion seria "
        "equivalente al siguiente:"
    ))
    story.append(code_block(
        "-- ALTER TABLE \"AIMessage\" ADD COLUMN \"isFavorited\" BOOLEAN NOT NULL DEFAULT false;<br/>"
        "-- ALTER TABLE \"AIMessage\" ADD COLUMN \"favoritedAt\" TIMESTAMP(3);<br/>"
        "-- CREATE INDEX \"AIMessage_isFavorited_favoritedAt_idx\" ON \"AIMessage\"(\"isFavorited\", \"favoritedAt\");"
    ))
    story.append(body(
        "Estas tres sentencias SQL son aditivas y no destructivas: anaden dos columnas nuevas con un "
        "valor por defecto seguro (<font name='DejaVuSans'>false</font> para boolean, "
        "<font name='DejaVuSans'>NULL</font> para timestamp) y crean un indice compuesto para optimizar "
        "las consultas de mensajes favoritos. Ninguna operacion elimina datos, modifica columnas "
        "existentes, altera relaciones o rompe la compatibilidad con datos actuales."
    ))

    # ━━━ 05. COLUMNAS CREADAS ━━━
    story.append(section(5, "Columnas Creadas"))
    story.append(body(
        "No se crearon columnas en la base de datos porque la migracion no se ejecuto. Las columnas "
        "estan declaradas en el schema pero su existencia en la base de datos Neon de produccion "
        "no pudo ser verificada. A continuacion se detalla la especificacion completa de las columnas "
        "pendientes de aplicacion:"
    ))
    story.append(Spacer(1, 2*mm))
    story.append(make_table(
        ["Columna", "Tipo", "Nullable", "Default", "Notas"],
        [
            ["isFavorited", "BOOLEAN", "NO", "false", "Marca de favorito"],
            ["favoritedAt", "TIMESTAMP(3)", "SI", "NULL", "Fecha/hora de marcado"],
        ],
        col_widths=[CONTENT_W*0.22, CONTENT_W*0.20, CONTENT_W*0.13, CONTENT_W*0.15, CONTENT_W*0.30],
    ))
    story.append(Spacer(1, 3*mm))
    story.append(body(
        "Ambas columnas se anaden al modelo <font name='DejaVuSans'>AIMessage</font> existente. "
        "La columna <font name='DejaVuSans'>isFavorited</font> tiene un valor por defecto de "
        "<font name='DejaVuSans'>false</font>, lo que garantiza que todos los mensajes existentes "
        "conservaran su estado original (no favoritos) tras la migracion. La columna "
        "<font name='DejaVuSans'>favoritedAt</font> acepta NULL, por lo que los registros existentes "
        "no se ven afectados y solo se popula cuando un usuario marque un mensaje como favorito."
    ))

    # ━━━ 06. INDICES CREADOS ━━━
    story.append(section(6, "Indices Creados"))
    story.append(body(
        "No se creo ningun indice en la base de datos. El indice pendiente es un indice compuesto "
        "declarado en el schema con la directiva <font name='DejaVuSans'>@@index([isFavorited, favoritedAt])</font>. "
        "Este indice optimiza las consultas que filtran mensajes favoritos ordenados por fecha de "
        "marcado, que es exactamente el patron de acceso que utilizara la funcionalidad de Mensajes "
        "Favoritos de la FASE 3.6. El indice compuesto permite a PostgreSQL resolver ambas condiciones "
        "(filtro por booleano + ordenacion por timestamp) sin escaneos completos de tabla."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(make_table(
        ["Indice", "Columnas", "Tipo", "Proposito"],
        [
            ["AIMessage_isFavorited_favoritedAt_idx", "isFavorited, favoritedAt", "B-tree (composite)", "Consulta de favoritos por fecha"],
        ],
        col_widths=[CONTENT_W*0.32, CONTENT_W*0.28, CONTENT_W*0.18, CONTENT_W*0.22],
    ))
    story.append(Spacer(1, 3*mm))
    story.append(body(
        "El modelo AIMessage ya cuenta con un segundo indice <font name='DejaVuSans'>@@index([threadId, createdAt])</font> "
        "que no se modifica en esta migracion y permanece intacto para las consultas existentes de carga "
        "de mensajes por conversacion."
    ))

    # ━━━ 07. PRISMA CLIENT REGENERADO ━━━
    story.append(section(7, "Prisma Client Regenerado"))
    story.append(body(
        "Se ejecuto <font name='DejaVuSans'>prisma generate</font> con exito, produciendo el cliente "
        "v7.8.0 en 557ms. El cliente generado incluye todos los tipos TypeScript actualizados con los "
        "campos <font name='DejaVuSans'>isFavorited: boolean</font> y "
        "<font name='DejaVuSans'>favoritedAt: Date | null</font> en el tipo "
        "<font name='DejaVuSans'>AIMessage</font>. Esto confirma que el schema local esta "
        "sincronizado con el codigo TypeScript generado, y que los componentes que consumen el "
        "Prisma Client pueden acceder a estos campos sin errores de tipado."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_ok("[OK] Prisma Client v7.8.0 generado — Tipos TS actualizados con isFavorited + favoritedAt"))

    # ━━━ 08. VALIDACIONES REALIZADAS ━━━
    story.append(section(8, "Validaciones Realizadas"))
    story.append(body(
        "Se ejecutaron las siguientes validaciones para determinar el estado de integridad del "
        "proyecto tras las declaraciones de favoritos en el schema:"
    ))
    story.append(Spacer(1, 2*mm))
    story.append(make_table(
        ["Validacion", "Comando", "Resultado", "Detalle"],
        [
            ["Schema", "prisma validate", "OK", "Schema sintacticamente valido"],
            ["Client Gen", "prisma generate", "OK", "v7.8.0 en 557ms"],
            ["TypeScript", "tsc --noEmit", "27 errores", "0 errores nuevos (todos preexistentes)"],
            ["ESLint (favs)", "eslint favorites/*", "OK", "0 errores en archivos de favoritos"],
            ["Build", "next build", "ERROR", "GROQ_API_KEY faltante (preexistente)"],
            ["Migrate Status", "prisma migrate status", "ERROR", "P1013 — URL invalida (SQLite)"],
        ],
        col_widths=[CONTENT_W*0.14, CONTENT_W*0.22, CONTENT_W*0.10, CONTENT_W*0.54],
    ))
    story.append(Spacer(1, 3*mm))
    story.append(body(
        "Los 27 errores de TypeScript detectados son completamente preexistentes y no guardan "
        "relacion alguna con los campos de favoritos. Se verifico especificamente que ningun error "
        "menciona <font name='DejaVuSans'>isFavorited</font>, <font name='DejaVuSans'>favoritedAt</font>, "
        "o el modelo <font name='DejaVuSans'>AIMessage</font> en su mensaje de error. Los errores "
        "preexistentes se concentran en: <font name='DejaVuSans'>goals/engine.ts</font> (propiedad "
        "<font name='DejaVuSans'>mentorGoal</font> inexistente), <font name='DejaVuSans'>timeline/route.ts</font> "
        "(tipos string|undefined), y <font name='DejaVuSans'>NotificationPreferences.tsx</font> "
        "(tipos incorrectos en props)."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(body(
        "El error de build (<font name='DejaVuSans'>GROQ_API_KEY missing</font>) es tambien "
        "preexistente: la variable de entorno de la API de Groq no esta configurada en este entorno "
        "de trabajo, lo que impide la compilacion de la ruta <font name='DejaVuSans'>/api/ai/chat</font>. "
        "Este error no tiene ninguna relacion con la migracion de favoritos y existia antes de "
        "cualquier cambio relacionado con la FASE 3.6."
    ))

    # ━━━ 09. INTEGRIDAD DE DATOS ━━━
    story.append(section(9, "Confirmacion de Integridad de Datos"))
    story.append(body(
        "Dado que la migracion no se ejecuto contra la base de datos de produccion, no fue posible "
        "verificar directamente la integridad de los datos existentes. Sin embargo, el analisis "
        "tecnico del SQL que se generaria confirma que la migracion es completamente segura:"
    ))
    story.append(Spacer(1, 2*mm))
    story.append(make_table(
        ["Criterio", "Evaluacion", "Razon"],
        [
            ["Perdida de datos", "NO", "Solo se anaden columnas, no se elimina nada"],
            ["Registros afectados", "NINGUNO", "Valores por defecto preservan estado original"],
            ["Relaciones modificadas", "NO", "No se tocan foreign keys ni constraints"],
            ["Tablas eliminadas", "NO", "Solo ALTER TABLE sobre AIMessage"],
            ["Compatibilidad", "TOTAL", "Campos nuevos con defaults seguros"],
        ],
        col_widths=[CONTENT_W*0.25, CONTENT_W*0.15, CONTENT_W*0.60],
    ))
    story.append(Spacer(1, 3*mm))
    story.append(body(
        "La columna <font name='DejaVuSans'>isFavorited</font> con <font name='DejaVuSans'>DEFAULT false</font> "
        "garantiza que todos los registros existentes de AIMessage tendran valor "
        "<font name='DejaVuSans'>false</font> tras la migracion, lo cual es semanticamente correcto: "
        "ningun mensaje fue previamente marcado como favorito. La columna "
        "<font name='DejaVuSans'>favoritedAt</font> nullable aceptara <font name='DejaVuSans'>NULL</font> "
        "para todos los registros existentes, lo cual es igualmente correcto ya que ningun mensaje "
        "tiene una fecha de marcado previa."
    ))

    # ━━━ 10. ESTADO FINAL DE LA BASE DE DATOS ━━━
    story.append(section(10, "Estado Final de la Base de Datos"))
    story.append(body(
        "El estado final de la base de datos Neon de produccion es <b>desconocido</b>. No fue "
        "posible conectarse a la base de datos para verificar si las columnas "
        "<font name='DejaVuSans'>isFavorited</font> y <font name='DejaVuSans'>favoritedAt</font> "
        "ya existen o no. Existen tres escenarios posibles:"
    ))
    story.append(Spacer(1, 2*mm))
    story.append(body(
        "<b>Escenario A:</b> La base de datos ya tiene las columnas (por ejemplo, si se aplico "
        "<font name='DejaVuSans'>prisma db push</font> desde otro entorno). En este caso, la "
        "migracion seria un no-op y no se requiere ninguna accion adicional. El schema y la base "
        "de datos ya estarian sincronizados."
    ))
    story.append(body(
        "<b>Escenario B:</b> La base de datos no tiene las columnas y necesita la migracion. En "
        "este caso, es necesario proporcionar la URL de conexion a Neon en el archivo "
        "<font name='DejaVuSans'>.env</font> y ejecutar <font name='DejaVuSans'>prisma migrate "
        "dev --name add_favorites_to_aimessage</font> para generar y aplicar la migracion."
    ))
    story.append(body(
        "<b>Escenario C:</b> La base de datos tiene una estructura intermedia o diferente. Este "
        "escenario es altamente improbable dado que el schema no ha sufrido cambios en el modelo "
        "AIMessage mas alla de los campos de favoritos, pero solo puede descartarse con una "
        "conexion directa a Neon."
    ))
    story.append(Spacer(1, 2*mm))
    story.append(verdict_warn("[PENDIENTE] Estado de BD Neon desconocido — requiere URL de conexion"))

    # ━━━ 11. RIESGOS DETECTADOS ━━━
    story.append(section(11, "Riesgos Detectados"))
    story.append(body(
        "Se identificaron los siguientes riesgos durante la auditoria:"
    ))
    story.append(Spacer(1, 2*mm))

    risks = [
        ["CRITICO", "Sin URL Neon en .env", "Imposible ejecutar migracion, verificar estado de BD o confirmar sincronizacion. La URL actual apunta a SQLite local."],
        ["MEDIO", "Sin historial de migraciones", "No existe prisma/migrations/. No se puede rastrear que migraciones se han aplicado previamente en produccion."],
        ["BAJO", "Errores TS preexistentes (27)", "No afectan la migracion pero podrian enmascarar problemas reales si no se separan correctamente de errores nuevos."],
        ["BAJO", "Build roto por GROQ_API_KEY", "Preexistente. No relacionado con favoritos pero impide validar compilacion completa en este entorno."],
    ]
    story.append(make_table(
        ["Nivel", "Riesgo", "Detalle"],
        risks,
        col_widths=[CONTENT_W*0.12, CONTENT_W*0.28, CONTENT_W*0.60],
    ))
    story.append(Spacer(1, 3*mm))
    story.append(body(
        "El riesgo critico es la ausencia de la URL de conexion a Neon. Sin ella, la unica accion "
        "posible fue validar el schema local y generar el Prisma Client, pero la sincronizacion "
        "con la base de datos real queda pendiente. Se recomienda encarecidamente configurar la "
        "variable <font name='DejaVuSans'>DATABASE_URL</font> con la cadena de conexion PostgreSQL "
        "de Neon (formato <font name='DejaVuSans'>postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require</font>) "
        "y re-ejecutar este procedimiento."
    ))

    # ━━━ 12. RESUMEN EJECUTIVO ━━━
    story.append(section(12, "Resumen Ejecutivo"))
    story.append(body(
        "La auditoria completa del sistema Prisma del proyecto VitaZen revela que el "
        "<font name='DejaVuSans'>schema.prisma</font> esta correctamente configurado con los campos "
        "<font name='DejaVuSans'>isFavorited</font> y <font name='DejaVuSans'>favoritedAt</font> en "
        "el modelo <font name='DejaVuSans'>AIMessage</font>, asi como el indice compuesto "
        "<font name='DejaVuSans'>@@index([isFavorited, favoritedAt])</font>. El schema es valido "
        "según <font name='DejaVuSans'>prisma validate</font>, y el Prisma Client se genera "
        "correctamente incluyendo estos campos en los tipos TypeScript."
    ))
    story.append(body(
        "Sin embargo, la ejecucion de la migracion esta completamente bloqueada porque el archivo "
        "<font name='DejaVuSans'>.env</font> no contiene una URL de conexion a Neon PostgreSQL. "
        "La URL actual (<font name='DejaVuSans'>file:/home/z/my-project/db/custom.db</font>) "
        "corresponde a una base de datos SQLite local, incompatible con el proveedor "
        "<font name='DejaVuSans'>postgresql</font> del schema. No existen carpetas de migracion "
        "previas, lo que sugiere que este entorno nunca ha ejecutado migraciones contra la base "
        "de datos de produccion."
    ))
    story.append(body(
        "Las validaciones de integridad del proyecto confirman que no se introdujeron errores "
        "nuevos: los 27 errores de TypeScript y el error de build por GROQ_API_KEY son todos "
        "preexistentes y no relacionados con la funcionalidad de favoritos. Los archivos "
        "especificos de favoritos (<font name='DejaVuSans'>FavoriteButton.tsx</font>, "
        "<font name='DejaVuSans'>api/ai/favorites/route.ts</font>) pasan ESLint sin errores."
    ))
    story.append(Spacer(1, 4*mm))

    # Final verdict table
    story.append(make_table(
        ["Item", "Estado"],
        [
            ["Schema Prisma (isFavorited + favoritedAt + indice)", "DECLARADO CORRECTAMENTE"],
            ["Prisma Client generado con tipos actualizados", "OK"],
            ["Errores nuevos introducidos", "0"],
            ["Migracion ejecutada en BD Neon", "BLOQUEADA"],
            ["Columnas verificadas en BD de produccion", "IMPOSIBLE"],
            ["Sincronizacion Schema <-> Base de datos", "PENDIENTE"],
        ],
        col_widths=[CONTENT_W*0.55, CONTENT_W*0.45],
    ))
    story.append(Spacer(1, 4*mm))
    story.append(hr())
    story.append(Paragraph(
        "<b>Accion requerida:</b> Configurar DATABASE_URL con la cadena de conexion PostgreSQL de Neon "
        "en el archivo .env y re-ejecutar este procedimiento para completar la sincronizacion.",
        ParagraphStyle('Action', fontName='DejaVuSans-Bold', fontSize=9.5, leading=14,
                       textColor=AMBER_WARN, alignment=TA_LEFT)
    ))

    # ━━━ BUILD ━━━
    doc.build(story, onFirstPage=draw_page_bg, onLaterPages=draw_page_bg)
    print(f"PDF generado: {OUTPUT_FILE}")


if __name__ == "__main__":
    build_report()