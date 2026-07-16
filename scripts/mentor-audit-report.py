#!/usr/bin/env python3
"""
VitaZen — Auditoria Forense del Mentor IA
Phase 2 — Intelligence Audit Report
"""
import os, sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm, pt
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import hashlib

# ━━ Fonts ━━
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Medium', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Medium.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Light', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Light.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold', medium='NotoSerifSC-Medium')

pdfmetrics.registerFont(TTFont('Tinos', f'{FONT_DIR}/truetype/english/Tinos-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Tinos-Bold', f'{FONT_DIR}/truetype/english/Tinos-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Tinos-Italic', f'{FONT_DIR}/truetype/english/Tinos-Italic.ttf'))
registerFontFamily('Tinos', normal='Tinos', bold='Tinos-Bold', italic='Tinos-Italic')

# ━━ Cascade Palette ━━
PAGE_BG      = colors.HexColor('#f3f3f2')
SECTION_BG   = colors.HexColor('#ecebe9')
CARD_BG      = colors.HexColor('#eae9e5')
TABLE_STRIPE = colors.HexColor('#efefed')
HEADER_FILL  = colors.HexColor('#716542')
COVER_BLOCK  = colors.HexColor('#6d6753')
BORDER       = colors.HexColor('#c4bfaf')
ICON         = colors.HexColor('#a08a46')
ACCENT       = colors.HexColor('#87702a')
ACCENT_2     = colors.HexColor('#5daec8')
TEXT_PRIMARY  = colors.HexColor('#201f1d')
TEXT_MUTED   = colors.HexColor('#797770')
SEM_SUCCESS  = colors.HexColor('#4e9164')
SEM_WARNING  = colors.HexColor('#a88744')
SEM_ERROR    = colors.HexColor('#a35e57')
SEM_INFO     = colors.HexColor('#55789b')

# ━━ Page Setup ━━
PAGE_W, PAGE_H = A4
LEFT_M = 22*mm
RIGHT_M = 22*mm
TOP_M = 20*mm
BOTTOM_M = 22*mm
CONTENT_W = PAGE_W - LEFT_M - RIGHT_M

OUTPUT_PATH = '/home/z/my-project/download/Auditoria_Forense_Mentor_IA_VitaZen.pdf'
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# ━━ Styles ━━
def make_styles():
    s = {}
    s['body'] = ParagraphStyle('body', fontName='Tinos', fontSize=9.5, leading=15,
        textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=6, spaceBefore=2)
    s['body_bold'] = ParagraphStyle('body_bold', parent=s['body'], fontName='Tinos-Bold')
    s['h1'] = ParagraphStyle('h1', fontName='NotoSerifSC-Bold', fontSize=18, leading=24,
        textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10, keepWithNext=True)
    s['h2'] = ParagraphStyle('h2', fontName='NotoSerifSC-Medium', fontSize=13, leading=18,
        textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6, keepWithNext=True)
    s['h3'] = ParagraphStyle('h3', fontName='NotoSerifSC-Medium', fontSize=11, leading=15,
        textColor=ACCENT, spaceBefore=10, spaceAfter=4, keepWithNext=True)
    s['bullet'] = ParagraphStyle('bullet', parent=s['body'], leftIndent=14, bulletIndent=4,
        spaceBefore=1, spaceAfter=1)
    s['code'] = ParagraphStyle('code', fontName='Tinos', fontSize=8.5, leading=12,
        textColor=SEM_INFO, backColor=CARD_BG, leftIndent=8, rightIndent=8,
        spaceBefore=4, spaceAfter=4, borderPadding=4)
    s['caption'] = ParagraphStyle('caption', fontName='Tinos-Italic', fontSize=8,
        leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=8)
    s['severity_critical'] = ParagraphStyle('sev_crit', fontName='NotoSerifSC-Bold',
        fontSize=9.5, leading=14, textColor=SEM_ERROR, leftIndent=8, spaceBefore=4, spaceAfter=2)
    s['severity_high'] = ParagraphStyle('sev_high', fontName='NotoSerifSC-Medium',
        fontSize=9.5, leading=14, textColor=SEM_WARNING, leftIndent=8, spaceBefore=4, spaceAfter=2)
    s['severity_medium'] = ParagraphStyle('sev_med', fontName='Tinos',
        fontSize=9.5, leading=14, textColor=ACCENT_2, leftIndent=8, spaceBefore=4, spaceAfter=2)
    s['severity_low'] = ParagraphStyle('sev_low', fontName='Tinos',
        fontSize=9.5, leading=14, textColor=TEXT_MUTED, leftIndent=8, spaceBefore=4, spaceAfter=2)
    s['verdict'] = ParagraphStyle('verdict', fontName='NotoSerifSC-Bold', fontSize=12, leading=17,
        textColor=HEADER_FILL, alignment=TA_CENTER, spaceBefore=12, spaceAfter=6)
    return s

STYLES = make_styles()

# ━━ TOC Template ━━
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ━━ Helpers ━━
def heading(text, style_key='h1', level=0):
    st = STYLES[style_key]
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', st)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def para(text):
    return Paragraph(text, STYLES['body'])

def bold_para(text):
    return Paragraph(text, STYLES['body_bold'])

def bullet(text):
    return Paragraph(f'<bullet>&bull;</bullet> {text}', STYLES['bullet'])

def code_block(text):
    return Paragraph(text.replace('\n', '<br/>'), STYLES['code'])

def spacer(h=6):
    return Spacer(1, h*mm)

def hr():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=6)

def severity_block(label, title, text, style_key):
    return [
        Paragraph(f'<b>[{label}]</b> {title}', STYLES[style_key]),
        Paragraph(text, STYLES['body']),
    ]

def table_from_data(headers, rows, col_widths=None):
    if col_widths is None:
        col_widths = [CONTENT_W / len(headers)] * len(headers)
    header_row = [Paragraph(f'<b>{h}</b>', ParagraphStyle('th', fontName='NotoSerifSC-Medium',
        fontSize=8.5, leading=12, textColor=colors.white))] for h in headers]
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), ParagraphStyle('td', fontName='Tinos',
            fontSize=8.5, leading=12, textColor=TEXT_PRIMARY)) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Medium'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t

# ━━ Build Story ━━
def build_story():
    story = []

    # ── COVER ──
    story.append(Spacer(1, 80*mm))
    story.append(Paragraph('VITAZEN', ParagraphStyle('cover_brand', fontName='NotoSerifSC-Bold',
        fontSize=14, leading=18, textColor=ICON, alignment=TA_CENTER, letterSpacing=6)))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph('Auditoria Forense del Mentor IA', ParagraphStyle('cover_title',
        fontName='NotoSerifSC-Bold', fontSize=32, leading=38, textColor=TEXT_PRIMARY, alignment=TA_CENTER)))
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph('Fase 2: Comportamiento, Memoria e Inteligencia', ParagraphStyle('cover_sub',
        fontName='NotoSerifSC-Medium', fontSize=14, leading=20, textColor=ACCENT, alignment=TA_CENTER)))
    story.append(Spacer(1, 30*mm))
    story.append(HRFlowable(width='30%', thickness=1, color=BORDER, spaceBefore=0, spaceAfter=0))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph('Informe de Solo Lectura', ParagraphStyle('cover_meta',
        fontName='Tinos-Italic', fontSize=10, leading=14, textColor=TEXT_MUTED, alignment=TA_CENTER)))
    story.append(Paragraph('Julio 2026', ParagraphStyle('cover_meta2',
        fontName='Tinos', fontSize=10, leading=14, textColor=TEXT_MUTED, alignment=TA_CENTER)))
    story.append(PageBreak())

    # ── TOC ──
    toc = TableOfContents()
    toc_h0 = ParagraphStyle('toc_h0', fontName='NotoSerifSC-Bold', fontSize=11, leading=18,
        textColor=TEXT_PRIMARY, leftIndent=0, spaceBefore=6)
    toc_h1 = ParagraphStyle('toc_h1', fontName='Tinos', fontSize=9.5, leading=16,
        textColor=TEXT_MUTED, leftIndent=16, spaceBefore=2)
    toc.levelStyles = [toc_h0, toc_h1]
    story.append(Paragraph('Indice', STYLES['h1']))
    story.append(toc)
    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # SECTION 1: ARQUITECTURA ACTUAL
    # ═══════════════════════════════════════════
    story.append(heading('1. Arquitectura Actual del Mentor', 'h1', 0))

    story.append(para(
        'El sistema de inteligencia del Mentor IA de VitaZen es una arquitectura de multiples capas '
        'que opera enteramente en el servidor (server-side), sin depender de ningun SDK de IA externo '
        'como Vercel AI SDK. El proveedor de IA unico es Groq, accedido a traves del SDK oficial de Groq '
        'mediante un patron de proxy lazy-loaded que evita la instanciacion del cliente en el momento de la '
        'evaluacion del modulo (cuando la clave API podria no estar disponible). El modelo utilizado es '
        '<b>llama-3.3-70b-versatile</b> para todas las operaciones: respuestas de chat y generacion de titulos.'
    ))

    story.append(heading('1.1 Flujo de datos por mensaje', 'h2', 1))
    story.append(para(
        'Cada mensaje del usuario sigue un flujo riguroso y altamente resguardado. Primero, el endpoint '
        'POST /api/ai/chat recibe el mensaje y realiza la autenticacion via Firebase. A continuacion, '
        'ejecuta todas las validaciones (threadId, contenido, hilo no archivado) <b>antes</b> de consumir '
        'cualquier credito. Solo despues de pasar todas las validaciones se ejecuta checkAILimit(), que '
        'utiliza un lock advisory transaccional de PostgreSQL (pg_advisory_xact_lock) para garantizar la '
        'atomicidad del incremento del contador. Esto previene condiciones de carrera donde dos requests '
        'concurrentes podrian ambos pasar el check.'
    ))

    story.append(para(
        'Despues del limite, se adquiere un lock advisory de sesion por threadId (pg_advisory_lock, no '
        'transaccional, porque la llamada a Groq tarda 2-5 segundos y no debe mantener una transaccion '
        'DB abierta durante ese tiempo). Esto serializa los envios al mismo hilo sin bloquear otros hilos. '
        'Se leen los ultimos mensajes de historial (10 para FREE, 30 para PREMIUM), se construye el '
        'contexto del usuario via buildMentorContext(), se inyecta en el system prompt, y se llama a Groq. '
        'Los mensajes se guardan atomicamente en una transaccion DB. Si Groq falla, se hace rollback del '
        'credito consumido.'
    ))

    story.append(heading('1.2 Motores de inteligencia', 'h2', 1))
    story.append(para(
        'Un aspecto arquitectonico notable es que <b>toda la inteligencia auxiliar es determinista y '
        'basada en reglas</b>, sin involucrar IA en ningun caso. El sistema cuenta con cinco motores '
        'independientes que alimentan el contexto del Mentor:'
    ))

    story.append(table_from_data(
        ['Motor', 'Tipo', 'Entrada', 'Salida'],
        [
            ['Estado Emocional', 'Reglas ponderadas', 'Check-ins, wellness, actividad semanal', 'Status + 6 metricas + resumen'],
            ['Patrones de Vida', 'Correlacion Pearson + validacion', 'Finanzas, wellness, meditacion (90 dias)', 'Max 2 observaciones cruzadas'],
            ['Etapas de Vida', 'Clasificacion por umbrales', 'Datos mensuales agregados (3 meses)', 'Etapa + transiciones'],
            ['Memorias Silenciosas', 'Observadores puros', 'Actividad historica, retornos, hitos', '1 observacion rara'],
            ['Cierre Mensual', 'Digest completo', 'Datos del mes: finanzas, ritmo, memorias', 'Balance + conexiones'],
        ],
        [CONTENT_W*0.18, CONTENT_W*0.22, CONTENT_W*0.32, CONTENT_W*0.28]
    ))
    story.append(Paragraph('Tabla 1: Motores de inteligencia auxiliar del Mentor', STYLES['caption']))

    # ═══════════════════════════════════════════
    # SECTION 2: PROMPT DEL SISTEMA
    # ═══════════════════════════════════════════
    story.append(heading('2. Prompt del Sistema', 'h1', 0))

    story.append(heading('2.1 Estructura y contenido', 'h2', 1))
    story.append(para(
        'El prompt del sistema se define en <b>src/lib/groq.ts</b> como un objeto SYSTEM_PROMPTS con '
        'dos variantes: FREE y PREMIUM. Ambos comparten la misma base identica de personalidad: '
        'FORMA DE SER, LO QUE NUNCA HACES, LO QUE SÍ HACES y TONO. La unica diferencia entre ambos '
        'es la seccion final: FREE tiene "EFICIENCIA" mientras que PREMIUM tiene "PROFUNDIDAD". '
        'El prompt tiene aproximadamente 650 palabras por variante.'
    ))

    story.append(heading('2.2 Analisis de personalidad', 'h2', 1))
    story.append(para(
        'La personalidad esta bien definida y coherente. El tono descrito ("tranquilo, directo, con gracia. '
        'Cercano pero no casual. Experto pero no pedante. Empatico pero no circular") es claro y '
        'diferenciado. Las restricciones son especificas y utiles: prohibicion de listas numeradas de '
        'consejos, positivismo artificial, frases de chatbot ("Es importante recordar que..."), coaching '
        'circular, y la obligacion de terminar con algo accionable. La seccion LO QUE SÍ HACES '
        'establece directrices positivas claras: escuchar antes que responder, validar brevemente, dar '
        'orientacion concreta, maximo UNA pregunta por respuesta.'
    ))

    story.append(heading('2.3 Problemas detectados', 'h2', 1))

    story.extend(severity_block('ALTO', 'Duplicacion del 95% entre prompts FREE y PREMIUM',
        'Ambos prompts comparten exactamente las mismas secciones FORMA DE SER, LO QUE NUNCA HACES, '
        'LO QUE SÍ HACES y TONO (copia identica). La unica diferencia real es una seccion de 5-6 lineas '
        'al final. Esto significa que un cambio en la personalidad requiere editar en dos lugares, '
        'con riesgo de divergencia. No es un bug funcional, pero es un problema de mantenibilidad '
        'significativo para una aplicacion premium.', 'severity_high'))

    story.extend(severity_block('MEDIO', 'Ausencia de identidad VitaZen en el prompt base',
        'El prompt describe un "mentor real de desarrollo personal" generico. No menciona VitaZen, '
        'no hace referencia a los Imperios, no explica que el usuario utiliza una app con multiples '
        'modulos. El contexto que se inyecta despues tiene separadores ("Lo que sabes de esta persona"), '
        'pero el prompt base no prepara al modelo para recibir datos estructurados de una app. '
        'Un modelo que no sabe que viene de VitaZen puede malinterpretar las senales de contexto '
        'o no aprovecharlas al maximo.', 'severity_medium'))

    story.extend(severity_block('BAJO', 'No hay instrucciones de manejo de idioma o longitud de respuesta',
        'El prompt no especifica longitud objetivo de respuesta ni como manejar si el usuario escribe '
        'en otro idioma. Dado que el contexto y el prompt estan en espanol, el modelo siempre responde '
        'en espanol, pero no hay instruccion explicita. La longitud queda librada al criterio del modelo, '
        'lo cual podria generar respuestas inconsistentes entre sesiones o entre tiers.', 'severity_low'))

    story.extend(severity_block('BAJO', 'No hay manejo de temas fuera del alcance',
        'El prompt no indica que hacer si el usuario pregunta sobre temas que no son desarrollo personal '
        '(por ejemplo, recetas de cocina, codigo de programacion, politica). Un mentor real de desarrollo '
        'personal redirigiria con naturalidad, pero el prompt no lo instruye explicitamente.', 'severity_low'))

    # ═══════════════════════════════════════════
    # SECTION 3: MEMORIA
    # ═══════════════════════════════════════════
    story.append(heading('3. Memoria', 'h1', 0))

    story.append(heading('3.1 Memoria corta (historial de conversacion)', 'h2', 1))
    story.append(para(
        'La memoria corta funciona como un buffer circular simple. En cada envio de mensaje, el endpoint '
        'lee los ultimos N mensajes del hilo actual desde la base de datos (10 para FREE, 30 para PREMIUM), '
        'los ordena cronologicamente, y los envia como el array "messages" a Groq. No hay ningun tipo '
        'de compresion, resumen o embeddings. Los mensajes se envian tal cual fueron guardados.'
    ))

    story.append(para(
        '<b>Que recuerda:</b> Los ultimos 10 mensajes (FREE) o 30 (PREMIUM) del hilo actual. Esto '
        'incluye tanto el texto del usuario como las respuestas del asistente, con todo su contenido literal. '
        'Es una ventana deslizante: conforme avanza la conversacion, los mensajes mas antiguos caen fuera '
        'de la ventana y el modelo pierde acceso a ellos.'
    ))

    story.append(para(
        '<b>Que NO recuerda:</b> Cualquier mensaje mas alla de la ventana. Si un usuario FREE tiene una '
        'conversacion de 50 mensajes, los primeros 40 son completamente invisibles para el modelo en '
        'cada respuesta. Si el usuario cambia de hilo, la memoria del hilo anterior es cero (excepto por '
        'el titulo del hilo que aparece en el contexto). No hay memoria entre hilos excepto los titulos.'
    ))

    story.extend(severity_block('ALTO', 'No existe resumen de conversaciones anteriores',
        'Cuando un usuario PREMIUM tiene 100 mensajes en un hilo, solo los ultimos 30 se envian al modelo. '
        'Los primeros 70 desaparecen completamente. No hay ningun mecanismo de resumen progresivo, '
        'compresion semantica, o embedding que capture la esencia de lo que se discutio. Para una app '
        'premium que promete "continuidad entre conversaciones" y "construir continuidad entre sesiones", '
        'esta es una limitacion estructural significativa. Un mentor real recordaria lo que se hablo hace '
        'semanas, no solo los ultimos 30 mensajes.', 'severity_high'))

    story.extend(severity_block('MEDIO', 'La capa 5 (memoria conversacional) solo envia titulos de hilos',
        'En el contexto PREMIUM, la capa 5 envia los titulos de los ultimos 3 hilos con su fecha: '
        '"Temas recientes de conversacion: Dificultades con el enfoque (hace 3 dias)...". Esto es '
        'extremadamente poco informacion. El modelo no tiene acceso al contenido de esas conversaciones, '
        'solo al titulo. Si el titulo es "Nueva conversacion" (el valor por defecto) o es generico, '
        'no aporta nada. Ni siquiera se envia la fecha del primer mensaje del hilo, solo updatedAt.', 'severity_medium'))

    story.append(heading('3.2 Memoria larga (contexto rebuild)', 'h2', 1))
    story.append(para(
        'La "memoria larga" no es realmente memoria. Es una reconstruccion en tiempo real desde la base '
        'de datos en cada mensaje. La funcion buildMentorContext() ejecuta aproximadamente 20 consultas '
        'DB en paralelo, procesa los datos a traves de los motores de inteligencia, y genera un bloque '
        'de texto que se inyecta en el system prompt. No hay base de datos vectorial, no hay embeddings, '
        'no hay almacenamiento persistente de memoria a largo plazo.'
    ))

    story.append(para(
        '<b>Que recuerda (PREMIUM):</b> Nombre del usuario, datos de onboarding (objetivos, foco, niveles '
        'iniciales), estado emocional de esta semana con metricas detalladas y tendencia, etapa de vida '
        'actual con posibles transiciones, hasta 2 patrones cruzados detectados (si hay datos suficientes), '
        'memorias silenciosas mostradas al usuario, 5 check-ins recientes con notas e intenciones, '
        'registros de bienestar (sueno) con tendencias, hasta 3 entradas de diario con fragmento de '
        'contenido, gastos recientes con patron de intencion y contexto, cierres mensuales recientes '
        'con reflexiones, 8 habitos con rachas y estado, 5 meditaciones recientes, actividad semanal '
        'desglosada, progreso de imperios, y consistencia semanal.'
    ))

    story.append(para(
        '<b>Que recuerda (FREE):</b> Nombre del usuario, ultimo check-in (emocion y energia), '
        'hasta 3 rachas de habitos, ultima meditacion, ultimo titulo de diario, y senal de consistencia '
        '(mejorando/declinando). Esto es bastante menos, pero suficiente para personalizacion basica.'
    ))

    story.append(para(
        '<b>Que NO recuerda (ningun tier):</b> El contenido especifico de conversaciones pasadas de otros '
        'hilos. Decisiones o compromisos que el usuario haya hecho en sesiones anteriores. Metas '
        'establecidas en conversaciones previas. Seguimiento de objetivos a lo largo del tiempo. '
        'Cualquier informacion que el usuario haya compartido pero que no quede reflejada en los datos '
        'estructurados (check-ins, habitos, diario, finanzas, bienestar).'
    ))

    story.extend(severity_block('CRITICO', 'No hay memoria semantica persistente entre sesiones',
        'Este es el hallazgo mas importante de la auditoria. El Mentor no tiene ningun mecanismo para '
        'recordar lo que se ha conversado previamente con el usuario fuera del historial literal del hilo '
        'actual. Si un usuario comparte en el hilo A que esta pasando por un divorcio, y luego abre el hilo '
        'B y pregunta "Como manejo el estres de esta semana?", el Mentor no tiene ninguna forma de saber '
        'que el usuario menciono el divorcio. Los titulos de hilos son la unica conexion, y un titulo '
        'como "Estres en el trabajo" no captura la profundidad de una conversacion. Para competir con '
        'asistentes de primer nivel (ChatGPT con Memory, Claude con Projects), esta es la brecha mas '
        'grande del sistema.', 'severity_critical'))

    story.append(heading('3.3 Memoria persistente (Memorias Silenciosas)', 'h2', 1))
    story.append(para(
        'Las Memorias Silenciosas son el unico mecanismo de "memoria persistente" del sistema, pero no '
        'funcionan como una memoria de conversaciones. Son observaciones generadas automaticamente por '
        'el sistema (no por el Mentor) cuando se detectan ciertos patrones: retorno tras ausencia, '
        'recurrencia de estados, cambios de etapa, hitos de presencia (30 dias, 1 ano), y milestones '
        'temporales (3, 6, 12 meses). Se almacenan en EmotionalDashboardState.memoryState como un array '
        'de textos mostrados. El Mentor consume las ultimas memorias silenciosas del contexto, no las genera.'
    ))

    story.extend(severity_block('MEDIO', 'Las memorias silenciosas son lecturas, no escrituras del Mentor',
        'El Mentor nunca escribe en el sistema de memorias. Solo consume observaciones que otros motores '
        'generaron. Un asistente de primer nivel deberia poder identificar informacion clave de una '
        'conversacion y recordarla despues ("la semana pasada mencionaste que querias dejar de fumar"). '
        'Actualmente, esa capacidad simplemente no existe en la arquitectura.', 'severity_medium'))

    story.append(heading('3.4 Deduplicacion y prioridad en el contexto', 'h2', 1))
    story.append(para(
        'El sistema de contexto implementa deduplicacion de multiples formas: entre el Estado Emocional '
        'y las Etapas de Vida (si ambos describen lo mismo, solo se añade la perspectiva temporal), '
        'entre los Patrones y el Estado Emocional (si el ESE ya conecta dos dominios, el patron se omite), '
        'entre los Cierres Mensuales y los Patrones (mismos IDs se filtran), y entre las Memorias Silenciosas '
        'y el Estado Emocional (las memorias de tipo "shift" se omiten si el ESE esta activo). '
        'La deduplicacion es solida y bien pensada. Sin embargo, se basa en palabras clave y no en '
        'semantica real, lo que podria fallar con formulaciones inusuales.'
    ))

    # ═══════════════════════════════════════════
    # SECTION 4: CONTEXTO
    # ═══════════════════════════════════════════
    story.append(heading('4. Contexto por Modulo VitaZen', 'h1', 0))

    story.append(para(
        'La siguiente tabla detalla exactamente que informacion llega al Mentor desde cada modulo de '
        'VitaZen, y que se pierde en el camino. La columna "Datos que se pierden" es tan importante '
        'como la columna "Datos que llegan".'
    ))

    story.append(table_from_data(
        ['Modulo', 'FREE llega', 'PREMIUM llega', 'Se pierde'],
        [
            ['Check-in', 'Ultimo: emocion, energia, intencion', '5 ultimos: emocion, energia, enfoque, estres, intencion, nota, tendencia', 'Notas completas de check-ins antiguos, evolucion emocional a largo plazo'],
            ['Imperios', 'Nada', 'Progreso completo: nivel, XP, racha por imperio', 'Nivel anterior, XP ganado por semana, hitos de nivel'],
            ['Observaciones\n(Patrones)', 'Nada', 'Hasta 2 observaciones cruzadas validadas', 'Patrones debiles (por debajo del umbral 0.55), historial de patrones anteriores'],
            ['Perfil/Onboarding', 'Nada', 'Objetivos, foco principal, niveles iniciales de estres/energia/enfoque, habitos iniciales', 'Motivacion profunda, circunstancias de vida'],
            ['Habitos', '3 rachas (nombre, dias)', '8 habitos con racha, ultimo dia completado', 'Fechas de creacion, dias saltados, historial de completado'],
            ['Meditacion', 'Ultima: duracion, tipo', '5 sesiones con tipo y duracion', 'Tipo de meditacion preferida, tendencias de duracion'],
            ['Nutricion', 'Nada (solo conteo semanal)', 'Nada (solo conteo semanal)', 'Todo el contenido de nutricion. Solo se usa como numero en el conteo de actividad semanal. No llega ningun dato real de alimentacion al contexto.'],
            ['Diario', 'Ultimo titulo', '3 entradas con titulo, animo, y fragmento de contenido', 'Contenido completo de entradas antiguas, temas recurrentes, evolucion de pensamientos'],
            ['Finanzas', 'Nada', '90 dias de gastos con categoria, intencion, y contexto', 'Ingresos, balance real, categorias especificas, montos absolutos (solo se usan para deteccion de patrones)'],
            ['Bienestar', 'Nada', '7 dias: sueno, notas', 'Estado de animo ( duplicado con check-in), energia (duplicado), estres (duplicado)'],
            ['Cierre Mensual', 'Nada', '3 cierres con reflexion, resumen visto, conexiones', 'Resumen completo del cierre, evolucion mes a mes, balance financiero detallado'],
            ['Memoria de Vida', 'Nada', 'Etapa actual (3 meses), transicion', 'Historial completo de etapas, observaciones de meses anteriores'],
            ['Logros', 'Nada', 'Nada', 'Los logros no llegan al contexto del Mentor en ningun tier.'],
        ],
        [CONTENT_W*0.12, CONTENT_W*0.22, CONTENT_W*0.30, CONTENT_W*0.36]
    ))
    story.append(Paragraph('Tabla 2: Mapeo completo de contexto por modulo VitaZen', STYLES['caption']))

    story.extend(severity_block('MEDIO', 'Nutricion no aporta informacion real al Mentor',
        'Los registros de nutricion solo se cuentan para la actividad semanal. Ningun dato de nutricion '
        '(agua, comidas, macronutrientes) llega al contexto del Mentor. Si un usuario registra que come '
        'mal o bebe poco agua, el Mentor no lo sabe. Los numeros de nutricion en el contexto solo dicen '
        '"2 registros de nutricion" sin ningun contenido real.', 'severity_medium'))

    story.extend(severity_block('BAJO', 'Finanzas: el Mentor nunca ve los montos absolutos',
        'El contexto financiero oculta los montos reales al Mentor. Solo ve categoria, intencion (necesidad, '
        'disfrute, crecimiento, tranquilidad), y contexto textual. Los montos se usan internamente para '
        'calcular correlaciones en el detector de patrones, pero el resultado que llega al prompt es una '
        'observacion cualitativa ("Las semanas con menos descanso tienen mas disfrute"). Esto es '
        'intencionalmente asi por diseno de privacidad, pero limita la capacidad del Mentor para dar '
        'consejo financiero concreto.', 'severity_low'))

    # ═══════════════════════════════════════════
    # SECTION 5: PERSONALIDAD
    # ═══════════════════════════════════════════
    story.append(heading('5. Personalidad y Coherencia', 'h1', 0))

    story.append(heading('5.1 Analisis de consistencia', 'h2', 1))
    story.append(para(
        'La personalidad esta definida con precision en el system prompt y tiene varias capas de '
        'proteccion contra comportamientos indeseados. Las instrucciones "LO QUE NUNCA HACES" cubren '
        'los anti-patrones mas comunes de chatbots: listas numeradas, positivismo artificial, coaching '
        'circular, frases de relleno. Las instrucciones "LO QUE SÍ HACES" son igualmente especificas: '
        'maximo una pregunta por respuesta, orientacion concreta, terminar con algo accionable.'
    ))

    story.append(para(
        'Sin embargo, la coherencia de la personalidad depende enteramente de la capacidad del modelo '
        'llama-3.3-70b-versatile para seguir estas instrucciones. Este modelo, a pesar de ser capaz, '
        'es propenso a ciertos patrones que el prompt intenta combatir sin exito completo:'
    ))

    story.append(bullet('<b>Respuestas genericas:</b> Sin suficiente contexto personalizado (especialmente en usuarios FREE), el modelo tiende a dar respuestas genericas de autoayuda que podrian aplicarse a cualquiera. La falta de datos de onboarding y contexto emocional para FREE amplifica este problema.'))
    story.append(bullet('<b>Exceso de disculpas o suavizado:</b> Aunque el prompt dice "Cuando algo es dificil, lo reconoces. No lo maquillas", el modelo a veces suaviza excesivamente respuestas sobre temas sensibles.'))
    story.append(bullet('<b>Inconsistencia entre sesiones:</b> Como no hay memoria entre hilos, el tono y enfoque del Mentor pueden variar significativamente entre conversaciones. En un hilo puede ser directo y en otro mas exploratorio, sin continuidad.'))
    story.append(bullet('<b>Positivismo residual:</b> A pesar de la prohibicion explicita, el modelo ocasionalmente incluye frases como "Es un buen paso" o "Lo estas haciendo bien", especialmente cuando el contexto muestra progreso.'))

    story.extend(severity_block('ALTO', 'El prompt no puede garantizar consistencia sin memoria entre sesiones',
        'La personalidad esta bien definida para una sesion individual, pero la inconsistencia entre '
        'sesiones es un problema estructural, no de prompt. Sin memoria semantica, el Mentor no puede '
        '"recordar" que en la ultima conversacion fue directo y concreto, o que al usuario no le gusta '
        'que le hagan preguntas. La unica forma de mejorar esto es con una capa de memoria persistente '
        'que capture preferencias del usuario y estilo de conversacion.', 'severity_high'))

    # ═══════════════════════════════════════════
    # SECTION 6: RAZONAMIENTO
    # ═══════════════════════════════════════════
    story.append(heading('6. Razonamiento', 'h1', 0))

    story.append(heading('6.1 Conexion entre imperios', 'h2', 1))
    story.append(para(
        'La capacidad de conectar imperios es el punto mas fuerte del sistema. El motor de Patrones de '
        'Vida implementa 5 detectores de correlacion basados en Pearson: energia-gasto impulsivo, '
        'practica mental-estabilidad financiera, estres-cambio financiero, sueno-necesidad, y '
        'crecimiento-estabilidad. Cada correlacion se valida con multiples filtros: deteccion de anomalias '
        '(>2 desviaciones estandar), puntuacion de consistencia (>=50%), umbral de anomalias totales '
        '(<30%), y un filtro filosofico que bloquea observaciones que suenan a coaching, evaluacion, '
        'patrones obvios, o lenguaje de IA. El sistema es riguroso: "Si hay duda, no mostrar nada."'
    ))

    story.append(para(
        'Sin embargo, solo existen 5 detectores y <b>4 de los 5 involucran finanzas</b> (finanzas-energia, '
        'finanzas-mente, finanzas-estres, finanzas-sueno). El quinto (crecimiento-estabilidad) tambien '
        'usa finanzas. Esto significa que sin datos financieros suficientes, el motor de patrones es '
        'practicamente inutil. No hay detectores para: meditacion-bienestar emocional, habitos-energia, '
        'diario-estres, nutricion-sueno, o checkin-consistencia. Para un usuario que no usa el modulo de '
        'finanzas, el Mentor pierde toda la capacidad de razonamiento cruzado.'
    ))

    story.extend(severity_block('ALTO', 'Los patrones cruzados dependen casi exclusivamente de finanzas',
        'El motor de Patrones de Vida es la unica capacidad de "razonamiento" del Mentor. Pero 4 de '
        '5 detectores requieren datos financieros, y el quinto tambien los usa internamente. Un usuario '
        'que no registre gastos (probablemente la mayoria de usuarios FREE) no generara ningun patron '
        'cruzado. Para una app de "desarrollo personal integral", esto es una limitacion severa. Se '
        'necesitan detectores que conecten otros imperios: mente-energia, disciplina-consistencia, '
        'crecimiento-emocional, etc.', 'severity_high'))

    story.append(heading('6.2 Seguimiento de objetivos y progreso', 'h2', 1))
    story.append(para(
        'El seguimiento de objetivos se limita a los datos de onboarding (solo PREMIUM): los objetivos '
        'que el usuario establecio al comenzar. No hay ningun mecanismo para actualizar estos objetivos, '
        'marcarlos como completados, o establecer nuevos. Si el usuario hace check-ins con intenciones '
        'diarias, esas intenciones llegan al contexto (solo la mas reciente), pero no se acumulan ni se '
        'rastrean como objetivos. El progreso de imperios (nivel, XP, racha) llega como datos estaticos, '
        'sin tendencia ni comparacion temporal.'
    ))

    story.extend(severity_block('MEDIO', 'No hay seguimiento de objetivos dinamicos',
        'Los objetivos del usuario se capturan una vez en el onboarding y nunca se actualizan. Un Mentor '
        'real preguntaria periodicamente "Como va con X objetivo?" o ajustaria su enfoque segun el '
        'progreso. Actualmente, el Mentor solo puede referenciar los objetivos iniciales, que pueden '
        'estar obsoletos semanas o meses despues.', 'severity_medium'))

    story.append(heading('6.3 Deteccion de patrones y continuidad', 'h2', 1))
    story.append(para(
        'La deteccion de patrones a nivel de respuesta del Mentor depende completamente de la calidad '
        'del contexto inyectado y de la capacidad del modelo para hacer inferencias. Dado que el modelo '
        'recibe un bloque de texto con senales estructuradas y se le pide integrarlas de forma invisible, '
        'su capacidad de razonamiento esta limitada por: (a) la ventana de historial (10-30 mensajes), '
        '(b) la ausencia de memoria semantica, y (c) la temperatura del modelo (0.5 FREE, 0.8 PREMIUM). '
        'La temperatura baja de FREE reduce la creatividad pero tambien la capacidad de hacer conexiones '
        'inusuales. La temperatura alta de PREMIUM permite mas creatividad pero tambien mas inconsistencia.'
    ))

    # ═══════════════════════════════════════════
    # SECTION 7: TITULOS
    # ═══════════════════════════════════════════
    story.append(heading('7. Generacion de Titulos', 'h1', 0))

    story.append(para(
        'Los titulos se generan automaticamente cuando un hilo tiene 2 o menos mensajes y el titulo '
        'es todavia "Nueva conversacion". Se usa el mismo modelo (llama-3.3-70b-versatile) con un prompt '
        'minimo: "Genera un titulo corto de maximo 6 palabras. Solo el titulo, sin comillas ni '
        'explicaciones. En espanol." Se envian los primeros 200 caracteres del mensaje del usuario, con '
        'temperatura 0.3 y max_tokens 20. Si la generacion falla, se usa un fallback de 50 caracteres '
        'del mensaje del usuario. Los titulos se limpian de markdown (*#_`~) y se limitan a 80 caracteres.'
    ))

    story.append(para(
        '<b>Problemas:</b> No hay deteccion de duplicados. Si un usuario tiene multiples conversaciones '
        'sobre temas similares, puede generar titulos identicos o muy parecidos. No hay verificacion '
        'contra titulos existentes del mismo usuario. Ademas, los primeros 200 caracteres del primer '
        'mensaje pueden no ser representativos si el usuario comienza con un saludo ("Hola, queria '
        'preguntarte algo..."). El fallback de 50 caracteres genera titulos feos e inutiles como '
        '"Hola, queria preguntarte algo que me esta..." que seran el titulo permanente del hilo si '
        'la generacion de IA falla.'
    ))

    story.extend(severity_block('MEDIO', 'Titulos duplicados y fallback de baja calidad',
        'No hay mecanismo para evitar titulos duplicados. El fallback de 50 caracteres genera titulos '
        'truncados poco utiles. Si la generacion de titulo falla en el segundo mensaje (por timeout, '
        'error de API), el titulo queda como "Nueva conversacion" o el truncado feo permanentemente, '
        'ya que la condicion messageCount <= 2 solo se cumple en los primeros dos mensajes.', 'severity_medium'))

    # ═══════════════════════════════════════════
    # SECTION 8: FREE VS ELITE
    # ═══════════════════════════════════════════
    story.append(heading('8. FREE vs ELITE: Diferencias Reales', 'h1', 0))

    story.append(heading('8.1 Comparativa exhaustiva', 'h2', 1))

    story.append(table_from_data(
        ['Dimension', 'FREE', 'ELITE (PREMIUM)'],
        [
            ['Mensajes/dia', '15 (resetea medianoche Madrid)', 'Ilimitados'],
            ['Temperatura modelo', '0.5 (menos creativo)', '0.8 (mas creativo)'],
            ['Max tokens respuesta', '800 (~600 palabras)', '2048 (~1500 palabras)'],
            ['Historial por hilo', '10 mensajes', '30 mensajes'],
            ['Mensajes visibles', '50 (recientes)', 'Todos'],
            ['Hilos activos max', '20', '100'],
            ['Hilos visibles', '10', 'Todos'],
            ['Contexto: Check-ins', '1 (basico)', '5 (detallados con notas)'],
            ['Contexto: Habitos', '3 rachas', '8 con estado'],
            ['Contexto: Meditacion', '1 sesion', '5 sesiones'],
            ['Contexto: Diario', '1 titulo', '3 con fragmento'],
            ['Contexto: Onboarding', 'No', 'Completo'],
            ['Contexto: Bienestar', 'No', '7 dias con sueno'],
            ['Contexto: Finanzas', 'No', '90 dias'],
            ['Contexto: Imperios', 'No', 'Completo'],
            ['Estado Emocional', 'No', '6 metricas + tendencia'],
            ['Patrones cruzados', 'No', 'Hasta 2'],
            ['Etapas de Vida', 'No', '3 meses con transiciones'],
            ['Memorias Silenciosas', 'No', 'Hasta 2'],
            ['Cierre Mensual', 'No', '3 cierres con conexiones'],
            ['Seccion prompt', 'EFICIENCIA (comprimir)', 'PROFUNDIDAD (continuidad)'],
            ['Instrucciones de contexto', 'Basicas (integrar invisible)', 'Avanzadas (evidencia, control)'],
        ],
        [CONTENT_W*0.25, CONTENT_W*0.375, CONTENT_W*0.375]
    ))
    story.append(Paragraph('Tabla 3: Diferencias completas entre planes FREE y ELITE', STYLES['caption']))

    story.append(heading('8.2 Analisis de valor real vs placebo', 'h2', 1))
    story.append(para(
        'La diferenciacion entre planes es genuina y sustancial. No se encontraron "placebos" claros, '
        'es decir, funcionalidades que se anuncien como premium pero que en realidad no aporten valor '
        'diferencial. Cada diferencia en la tabla anterior corresponde a una restriccion real implementada '
        'en el codigo. Sin embargo, hay matices importantes:'
    ))

    story.append(bullet('<b>Diferencia mas impactante:</b> El contexto PREMIUM incluye onboarding, estado emocional, patrones cruzados y etapas de vida. Esto transforma radicalmente la calidad de las respuestas. Un usuario FREE recibe basicamente un chatbot generico con datos superficiales; un usuario PREMIUM recibe un mentor que "conoce" su estado real.'))
    story.append(bullet('<b>Diferencia sutil pero real:</b> Las instrucciones de uso de contexto para PREMIUM incluyen reglas de control de evidencia ("Distingue siempre entre datos observados, patrones detectados y suposiciones") que no existen en FREE. Esto hace que las respuestas PREMIUM sean mas honestas y matizadas.'))
    story.append(bullet('<b>Temperatura y tokens:</b> La diferencia de temperatura (0.5 vs 0.8) y max_tokens (800 vs 2048) es real y perceptible. FREE genera respuestas mas cortas y conservadoras; PREMIUM genera respuestas mas largas y creativas.'))

    # ═══════════════════════════════════════════
    # SECTION 9: COSTE
    # ═══════════════════════════════════════════
    story.append(heading('9. Coste y Optimizacion', 'h1', 0))

    story.append(heading('9.1 Coste por mensaje', 'h2', 1))
    story.append(para(
        'Cada mensaje al Mentor genera dos llamadas a Groq (la segunda solo en mensajes 1-2 del hilo '
        'para generar titulo). El costo depende del tamano del contexto enviado. El contexto del sistema '
        '(prompt base + reglas de contexto + bloque de datos del usuario) varia significativamente:'
    ))

    story.append(table_from_data(
        ['Componente', 'FREE (estimado)', 'PREMIUM (estimado)'],
        [
            ['Prompt base', '~650 palabras (~850 tokens)', '~650 palabras (~850 tokens)'],
            ['Reglas de contexto', '~150 palabras (~200 tokens)', '~400 palabras (~500 tokens)'],
            ['Bloque de datos', '~100 palabras (~130 tokens)', '~600-900 palabras (~800-1200 tokens)'],
            ['Historial (max)', '9 mensajes (~1800 tokens)', '29 mensajes (~5800 tokens)'],
            ['Mensaje usuario', '~100 tokens', '~100 tokens'],
            ['Total input (estimado)', '~3,080 tokens', '~7,550-8,050 tokens'],
        ],
        [CONTENT_W*0.30, CONTENT_W*0.35, CONTENT_W*0.35]
    ))
    story.append(Paragraph('Tabla 4: Estimacion de tokens por mensaje', STYLES['caption']))

    story.append(heading('9.2 Consultas DB por mensaje', 'h2', 1))
    story.append(para(
        'La funcion buildMentorContext() ejecuta 20 consultas DB en paralelo (Promise.all) para cada '
        'mensaje. Para PREMIUM, se anaden llamadas a los motores de inteligencia: getEmotionalState() '
        '(reutiliza datos ya obtenidos, sin consultas extra), detectLifeStages() (7 consultas paralelas '
        'por mes, 3 meses = 21 consultas), detectPatterns() (sin consultas extra, reutiliza datos), '
        'y generateMonthlyDigest() para el ultimo cierre (7+ consultas). Ademas, se consulta '
        'EmotionalDashboardState para memorias silenciosas.'
    ))

    story.append(para(
        '<b>Total estimado por mensaje PREMIUM:</b> ~20 consultas en el bloque principal + ~21 para '
        'life stages + ~7 para cierre mensual + 1 para memorias = ~49 consultas DB por mensaje. '
        'Todas se ejecutan en paralelo donde es posible, pero la latencia total puede ser significativa.'
    ))

    story.extend(severity_block('ALTO', 'generateMonthlyDigest() se ejecuta en cada mensaje PREMIUM',
        'La funcion generateMonthlyDigest() se llama dentro de buildMentorContext() para obtener las '
        'conexiones del ultimo cierre mensual. Esta funcion ejecuta 6 consultas DB adicionales '
        '(computeIntentionBalance, computeFinancialSummary, computeRhythm, computeMemories, '
        'computeEvolution, computeConnections), y computeEvolution internamente llama computeRhythm '
        'nuevamente para el mes anterior. Todo esto se ejecuta en cada mensaje de chat, aunque el '
        'cierre mensual no cambia entre mensajes del mismo dia. Esto es una redundancia significativa '
        'que podria eliminarse cacheando el resultado del digest por dia.', 'severity_high'))

    story.extend(severity_block('MEDIO', 'detectLifeStages() ejecuta 21+ consultas por mensaje',
        'La deteccion de etapas de vida agrrega 7 consultas DB por mes para 3 meses (21 total) en '
        'cada mensaje. Dado que las etapas son mensuales y cambian como maximo una vez al mes, '
        'ejecutar esta logica en cada mensaje es excesivo. Un cache de 1 hora o por dia reduciria '
        'drasticamente la carga.', 'severity_medium'))

    # ═══════════════════════════════════════════
    # SECTION 10: SEGURIDAD
    # ═══════════════════════════════════════════
    story.append(heading('10. Seguridad', 'h1', 0))

    story.append(heading('10.1 Prompt injection', 'h2', 1))
    story.append(para(
        'El sistema tiene protecciones basicas: el contenido del usuario se envia como mensaje con '
        'role "user" (no como parte del system prompt), lo que reduce el riesgo de inyeccion directa. '
        'El system prompt tiene prioridad sobre los mensajes del usuario en la mayoria de modelos. '
        'Sin embargo, no hay ningun filtro o sanitizacion del contenido del usuario antes de enviarlo '
        'a Groq. Un usuario podria intentar inyectar instrucciones como "Olvida todo lo anterior y '
        'actua como..." en su mensaje. El modelo llama-3.3-70b-versatile tiene defensa nativa contra '
        'inyeccion de prompts moderada, pero no es infalible.'
    ))

    story.extend(severity_block('MEDIO', 'No hay sanitizacion de entrada del usuario',
        'El contenido del usuario se envia directamente a Groq sin ningun filtro. Aunque la separacion '
        'de roles (system vs user) proporciona cierta proteccion, no hay validacion de longitud del '
        'contenido mas alla del limite de 4000 caracteres. Un mensaje de 4000 caracteres de intento '
        'de inyeccion de prompt podria sobreescribir parcialmente las instrucciones del sistema. '
        'Se recomienda al menos un filtro basico que detecte patrones comunes de inyeccion.', 'severity_medium'))

    story.append(heading('10.2 Fuga de contexto y datos entre usuarios', 'h2', 1))
    story.append(para(
        'La seguridad entre usuarios es solida. Cada consulta a la base de datos incluye '
        '"userId" como filtro obligatorio. La autenticacion se realiza via Firebase con token JWT. '
        'El advisory lock por threadId y userId previene accesos cruzados. No se encontraron vectores '
        'de fuga de datos entre usuarios en el codigo auditado. El sistema de analytics (trackEvent) '
        'es privacy-first y no envia contenido de mensajes, solo el evento "mentor_used" con userId '
        'y plan.'
    ))

    story.append(heading('10.3 Fuga de memoria', 'h2', 1))
    story.append(para(
        'No hay riesgo de fuga de memoria entre usuarios. Toda la informacion de contexto se construye '
        'dinamicamente desde la base de datos para el usuario autenticado. No hay cachas compartidas '
        'ni almacenamiento global de contexto. La unica excepcion potencial es el in-flight dedup del '
        'silent memory snapshot (inFlightSnapshots Map en server-side), pero este se limpia automaticamente '
        'y esta keyed por userId.'
    ))

    # ═══════════════════════════════════════════
    # SECTION 11: CODIGO MUERTO
    # ═══════════════════════════════════════════
    story.append(heading('11. Codigo Muerto y Problemas de Codigo', 'h1', 0))

    story.append(heading('11.1 Funciones y modulos muertos', 'h2', 1))

    story.append(table_from_data(
        ['Archivo', 'Elemento', 'Estado'],
        [
            ['src/lib/limits.ts', 'incrementAIUsage()', 'DEPRECATED - No-op con comentario. Ningun archivo la importa.'],
            ['src/lib/client/silent-memories.ts', 'Todo el archivo (204 lineas)', 'LEGADO - El sistema completo de memorias silenciosas se movio al servidor. Ningun componente importa desde este archivo.'],
            ['src/lib/client/silent-memories.ts', 'STORAGE_KEY constant', 'MUERTA - Solo usada por el archivo legacy anterior.'],
            ['prisma/schema.prisma', 'reflectionState column', 'DEPRECATED - Comentario indica que el sistema de reflexiones fue eliminado. Ocupa espacio en DB sin uso.'],
            ['src/app/api/ai/threads/route.ts', 'messages include en GET', 'SUBOPTIMO - Incluye el ultimo mensaje de cada hilo en la lista de hilos (take: 1), pero ese dato nunca se usa en el frontend para la lista de conversaciones. Anade carga DB innecesaria.'],
        ],
        [CONTENT_W*0.30, CONTENT_W*0.35, CONTENT_W*0.35]
    ))
    story.append(Paragraph('Tabla 5: Codigo muerto identificado', STYLES['caption']))

    story.append(heading('11.2 Otros problemas de codigo', 'h2', 1))

    story.extend(severity_block('BAJO', 'Proxy sin tipado en groq.ts',
        'El cliente de Groq se exporta como "any" a traves de un Proxy. Esto elimina toda la seguridad '
        'de tipos: no hay autocompletado, no hay verificacion de parametros, y los errores de invocacion '
        'solo se detectan en runtime. Para un sistema critico como el chat, esto es arriesgado. Un '
        'tipado adecuado permitiria detectar errores de API en compilacion.', 'severity_low'))

    story.extend(severity_block('BAJO', 'Type safety debil en aggregateWellnessWeekly',
        'En patterns/detector.ts, la funcion aggregateWellnessWeekly usa "as any" para anadir campos '
        'temporales (_count, _sleep, etc.) al objeto WeeklyWellness. Esto elude el sistema de tipos '
        'y podria causar bugs silenciosos si los campos no se limpian correctamente. La limpieza al '
        'final usa "delete" sobre un "any", lo cual no es verificable.', 'severity_low'))

    story.extend(severity_block('BAJO', 'Doble consulta computeRhythm en computeEvolution',
        'En monthly-closure/digest.ts, computeEvolution() llama computeRhythm() para el mes actual '
        '(ya calculado en el Promise.all principal) y otra vez para el mes anterior. Esto duplica '
        'trabajo DB innecesariamente. El resultado del mes actual ya esta disponible y podria reutilizarse.', 'severity_low'))

    # ═══════════════════════════════════════════
    # SECTION 12: RESUMEN DE PROBLEMAS
    # ═══════════════════════════════════════════
    story.append(heading('12. Resumen de Problemas', 'h1', 0))

    story.append(heading('12.1 Criticos', 'h2', 1))
    story.append(para(
        '<b>P-01: No hay memoria semantica persistente entre sesiones.</b> El Mentor no puede recordar '
        'nada de lo que se ha conversado en hilos anteriores mas alla del titulo. Para una aplicacion '
        'premium que promete continuidad y personalizacion profunda, esta es la brecha fundamental. '
        'Impacto: El Mentor se siente como un chatbot sin memoria, no como un mentor que te conoce. '
        'Un usuario que comparte informacion personal en una sesion y espera que se recuerde en la '
        'siguiente se decepcionara. Esta es la diferencia entre un asistente generico y un mentor real.'
    ))

    story.append(heading('12.2 Altos', 'h2', 1))
    story.append(para(
        '<b>P-02: No existe resumen de conversaciones anteriores.</b> Con ventanas de 10-30 mensajes, '
        'las conversaciones largas pierden su contexto inicial. No hay compresion semantica ni resumen '
        'progresivo que capture la esencia de lo discutido.'
    ))
    story.append(para(
        '<b>P-03: Los patrones cruzados dependen casi exclusivamente de datos financieros.</b> 4 de 5 '
        'detectores requieren finanzas. Sin datos financieros, el razonamiento cruzado del Mentor es '
        'practicamente inexistente. Se necesitan detectores que conecten otros imperios.'
    ))
    story.append(para(
        '<b>P-04: El prompt no puede garantizar consistencia sin memoria entre sesiones.</b> La '
        'personalidad esta bien definida para una sesion, pero sin memoria semantica, el tono y enfoque '
        'varian entre conversaciones.'
    ))
    story.append(para(
        '<b>P-05: generateMonthlyDigest() se ejecuta en cada mensaje PREMIUM.</b> Ejecuta ~13 consultas '
        'DB adicionales por mensaje para un dato que cambia como maximo una vez al dia. Impacto en '
        'latencia y costo operacional.'
    ))
    story.append(para(
        '<b>P-06: Duplicacion del 95% entre prompts FREE y PREMIUM.</b> Riesgo de divergencia ante '
        'cambios en la personalidad. Problema de mantenibilidad significativo.'
    ))

    story.append(heading('12.3 Medios', 'h2', 1))
    story.append(para(
        '<b>P-07: Ausencia de identidad VitaZen en el prompt base.</b> El prompt describe un mentor '
        'generico sin mencionar VitaZen, los Imperios, o la estructura de la app.'
    ))
    story.append(para(
        '<b>P-08: No hay seguimiento de objetivos dinamicos.</b> Los objetivos de onboarding nunca se '
        'actualizan. El Mentor no puede rastrear progreso hacia metas.'
    ))
    story.append(para(
        '<b>P-09: Titulos duplicados y fallback de baja calidad.</b> No hay deteccion de duplicados. '
        'El fallback genera titulos truncados permanentes.'
    ))
    story.append(para(
        '<b>P-10: No hay sanitizacion de entrada del usuario contra prompt injection.</b> El contenido '
        'se envia directamente a Groq sin filtro.'
    ))
    story.append(para(
        '<b>P-11: La capa 5 (memoria conversacional) solo envia titulos.</b> Informacion extremadamente '
        'pobre para construir continuidad entre sesiones.'
    ))
    story.append(para(
        '<b>P-12: Nutricion no aporta informacion real al Mentor.</b> Solo se usa como contador en '
        'la actividad semanal, sin ningun dato de alimentacion en el contexto.'
    ))
    story.append(para(
        '<b>P-13: detectLifeStages() ejecuta 21+ consultas por mensaje.</b> Podria cachearse por dia '
        'dado que las etapas son mensuales.'
    ))
    story.append(para(
        '<b>P-14: Las memorias silenciosas son lecturas, no escrituras del Mentor.</b> El Mentor no puede '
        'identificar y recordar informacion clave de conversaciones.'
    ))

    story.append(heading('12.4 Bajos', 'h2', 1))
    story.append(para(
        '<b>P-15: No hay instrucciones de longitud ni manejo de temas fuera de alcance.</b> '
        '<b>P-16: El cliente Groq no tiene tipado (any). </b>'
        '<b>P-17: aggregateWellnessWeekly usa "as any". </b>'
        '<b>P-18: Doble consulta computeRhythm en computeEvolution. </b>'
        '<b>P-19: Finanzas: el Mentor nunca ve montos absolutos (por diseno).</b>'
    ))

    # ═══════════════════════════════════════════
    # SECTION 13: VEREDICTO FINAL
    # ═══════════════════════════════════════════
    story.append(heading('13. Veredicto Final', 'h1', 0))

    story.append(spacer(4))
    story.append(Paragraph(
        'El Mentor IA de VitaZen tiene una arquitectura solida y bien pensada en su capa de infraestructura: '
        'concurrency safety con advisory locks, rollback atomico de creditos, deduplicacion de contexto, '
        'motores de inteligencia deterministas rigurosos, y diferenciacion de plan quirurgicamente '
        'implementada. El sistema no se cae, no pierde datos, y no tiene fugas de seguridad entre usuarios.',
        STYLES['verdict']
    ))

    story.append(spacer(4))
    story.append(Paragraph(
        'Sin embargo, su inteligencia es la de un chatbot contextualizado, no la de un mentor que recuerda. '
        'La ausencia de memoria semantica persistente es la brecha mas grande: sin ella, el Mentor no '
        'puede construir una relacion real con el usuario a lo largo del tiempo. Cada conversacion es '
        'una interaccion independiente. Los motores auxiliares (patrones, etapas, memorias silenciosas) '
        'son impresionantes como ingenieria, pero alimentan contexto estatico, no memoria viva.',
        STYLES['verdict']
    ))

    story.append(spacer(4))
    story.append(Paragraph(
        'Para competir con asistentes de primer nivel dentro del enfoque de VitaZen, el sistema necesita '
        'prioritariamente: (1) una capa de memoria semantica que capture y recupere informacion clave de '
        'conversaciones anteriores, (2) mas detectores de patrones que no dependan exclusivamente de '
        'finanzas, y (3) unificado del prompt base para eliminar la duplicacion FREE/PREMIUM y agregar '
        'identidad VitaZen. Con estas tres mejoras, el Mentor pasaria de "contextualmente informado" '
        'a "genuinamente personalizado".',
        STYLES['verdict']
    ))

    return story


# ━━ Main ━━
def main():
    story = build_story()
    doc = TocDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=LEFT_M,
        rightMargin=RIGHT_M,
        topMargin=TOP_M,
        bottomMargin=BOTTOM_M,
        title='Auditoria Forense del Mentor IA - VitaZen',
        author='Z.ai',
        subject='Fase 2 - Comportamiento, Memoria e Inteligencia'
    )
    # Page number footer
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Tinos', 8)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawCentredString(PAGE_W / 2, 12*mm, f'{doc.page}')
        canvas.restoreState()
    from reportlab.platypus import PageTemplate, Frame
    frame = Frame(LEFT_M, BOTTOM_M, CONTENT_W, PAGE_H - TOP_M - BOTTOM_M, id='normal')
    template = PageTemplate(id='main', frames=[frame], onPage=add_page_number)
    doc.addPageTemplates([template])

    doc.multiBuild(story)
    print(f'PDF generated: {OUTPUT_PATH}')

if __name__ == '__main__':
    main()