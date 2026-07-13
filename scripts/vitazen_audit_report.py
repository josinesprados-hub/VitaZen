#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VitaZen - Informe de Auditoria Funcional Completa
"""
import sys, os, hashlib, textwrap
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'skills', 'pdf', 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, Image
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# FONT REGISTRATION
# ============================================================
FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))

# CJK fonts not needed for Spanish document — skip variable fonts that ReportLab can't handle

pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold', italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ============================================================
# CASCADE PALETTE
# ============================================================
PAGE_BG       = colors.HexColor('#f4f4f3')
SECTION_BG    = colors.HexColor('#ecebe9')
CARD_BG       = colors.HexColor('#eeeeeb')
TABLE_STRIPE  = colors.HexColor('#efeeec')
HEADER_FILL   = colors.HexColor('#635a3f')
COVER_BLOCK   = colors.HexColor('#645e4c')
BORDER        = colors.HexColor('#d5cebb')
ICON          = colors.HexColor('#9f873f')
ACCENT        = colors.HexColor('#93761f')
ACCENT_2      = colors.HexColor('#6f4fcd')
TEXT_PRIMARY   = colors.HexColor('#262522')
TEXT_MUTED     = colors.HexColor('#817e77')
SEM_SUCCESS   = colors.HexColor('#449c62')
SEM_WARNING   = colors.HexColor('#a68a52')
SEM_ERROR     = colors.HexColor('#a45048')
SEM_INFO      = colors.HexColor('#4e7faf')

# ============================================================
# STYLES
# ============================================================
PAGE_W, PAGE_H = A4
LEFT_M = 22 * mm
RIGHT_M = 22 * mm
TOP_M = 20 * mm
BOTTOM_M = 20 * mm
CONTENT_W = PAGE_W - LEFT_M - RIGHT_M

def ps(name, **kw):
    defaults = dict(
        fontName='FreeSerif', fontSize=10.5, leading=17,
        alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
        spaceAfter=6, spaceBefore=2,
    )
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)

sH1 = ps('H1', fontName='FreeSerif-Bold', fontSize=20, leading=26, alignment=TA_LEFT, spaceBefore=18, spaceAfter=10, textColor=HEADER_FILL)
sH2 = ps('H2', fontName='FreeSerif-Bold', fontSize=14, leading=19, alignment=TA_LEFT, spaceBefore=14, spaceAfter=8, textColor=TEXT_PRIMARY)
sH3 = ps('H3', fontName='FreeSerif-Bold', fontSize=11.5, leading=16, alignment=TA_LEFT, spaceBefore=10, spaceAfter=6, textColor=HEADER_FILL)
sBody = ps('Body')
sBodySmall = ps('BodySmall', fontSize=9.5, leading=14)
sMuted = ps('Muted', fontSize=9, leading=13, textColor=TEXT_MUTED, alignment=TA_LEFT)
sBullet = ps('Bullet', leftIndent=14, bulletIndent=0, spaceBefore=2, spaceAfter=2)
sTableCell = ps('TableCell', fontSize=9, leading=13, alignment=TA_LEFT, spaceAfter=0, spaceBefore=0)
sTableHeader = ps('TableHeader', fontName='FreeSerif-Bold', fontSize=9, leading=13, alignment=TA_LEFT, textColor=colors.white, spaceAfter=0, spaceBefore=0)
sTagCritical = ps('TagCritical', fontName='FreeSerif-Bold', fontSize=8.5, leading=11, textColor=SEM_ERROR, alignment=TA_CENTER)
sTagHigh = ps('TagHigh', fontName='FreeSerif-Bold', fontSize=8.5, leading=11, textColor=colors.HexColor('#c05621'), alignment=TA_CENTER)
sTagMedium = ps('TagMedium', fontName='FreeSerif-Bold', fontSize=8.5, leading=11, textColor=SEM_WARNING, alignment=TA_CENTER)
sTagLow = ps('TagLow', fontName='FreeSerif-Bold', fontSize=8.5, leading=11, textColor=SEM_INFO, alignment=TA_CENTER)
sTagInfo = ps('TagInfo', fontName='FreeSerif-Bold', fontSize=8.5, leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER)

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def heading(text, style, level=0):
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name=lt;a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(t): return heading(t, sH1, 0)
def h2(t): return heading(t, sH2, 1)
def h3(t): return heading(t, sH3, 2)

def body(t): return Paragraph(t, sBody)
def body_sm(t): return Paragraph(t, sBodySmall)
def muted(t): return Paragraph(t, sMuted)
def bullet(t): return Paragraph(f'<bullet>&bull;</bullet> {t}', sBullet)
def hr(): return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=6)

def severity_tag(sev):
    m = {
        'CRITICA': (sTagCritical, 'CRITICA'),
        'ALTA': (sTagHigh, 'ALTA'),
        'MEDIA': (sTagMedium, 'MEDIA'),
        'BAJA': (sTagLow, 'BAJA'),
        'INFO': (sTagInfo, 'INFO'),
    }
    sty, label = m.get(sev, (sTagInfo, sev))
    return Paragraph(f'[{label}]', sty)

def issue_table(rows):
    """rows = list of (severity, title, file, detail)"""
    hdr = [
        Paragraph('<b>Gravedad</b>', sTableHeader),
        Paragraph('<b>Problema</b>', sTableHeader),
        Paragraph('<b>Archivo</b>', sTableHeader),
        Paragraph('<b>Detalle</b>', sTableHeader),
    ]
    data = [hdr]
    for sev, title, fp, detail in rows:
        data.append([
            severity_tag(sev),
            Paragraph(title, sTableCell),
            Paragraph(f'<font size="7.5">{fp}</font>', sTableCell),
            Paragraph(detail, sTableCell),
        ])
    cw = [CONTENT_W * f for f in [0.10, 0.24, 0.22, 0.44]]
    t = Table(data, colWidths=cw, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSerif-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def feature_table(rows):
    """rows = list of (feature, free, elite, note)"""
    hdr = [
        Paragraph('<b>Funcionalidad</b>', sTableHeader),
        Paragraph('<b>Free</b>', sTableHeader),
        Paragraph('<b>Elite</b>', sTableHeader),
        Paragraph('<b>Nota</b>', sTableHeader),
    ]
    data = [hdr]
    for feat, free, elite, note in rows:
        data.append([
            Paragraph(feat, sTableCell),
            Paragraph(free, sTableCell),
            Paragraph(elite, sTableCell),
            Paragraph(note, sTableCell),
        ])
    cw = [CONTENT_W * f for f in [0.30, 0.15, 0.15, 0.40]]
    t = Table(data, colWidths=cw, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def page_title(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(LEFT_M, PAGE_H - 12*mm, 'VitaZen - Informe de Auditoria Funcional')
    canvas.drawRightString(PAGE_W - RIGHT_M, PAGE_H - 12*mm, datetime.now().strftime('%Y-%m-%d'))
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.3)
    canvas.line(LEFT_M, PAGE_H - 14*mm, PAGE_W - RIGHT_M, PAGE_H - 14*mm)
    canvas.restoreState()


# ============================================================
# TOC TEMPLATE
# ============================================================
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ============================================================
# BUILD DOCUMENT
# ============================================================
OUTPUT = '/home/z/my-project/download/VitaZen_Auditoria_Funcional.pdf'
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

doc = TocDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=LEFT_M, rightMargin=RIGHT_M,
    topMargin=TOP_M, bottomMargin=BOTTOM_M,
    title='VitaZen - Informe de Auditoria Funcional Completa',
    author='Equipo de Auditoria',
    subject='Auditoria funcional de comportamiento de la aplicacion VitaZen',
)

story = []

# ---- TABLE OF CONTENTS ----
toc = TableOfContents()
toc_h0 = ParagraphStyle('TocH0', fontName='FreeSerif-Bold', fontSize=11, leading=18, leftIndent=0, textColor=TEXT_PRIMARY)
toc_h1 = ParagraphStyle('TocH1', fontName='FreeSerif', fontSize=10, leading=16, leftIndent=16, textColor=TEXT_MUTED)
toc.levelStyles = [toc_h0, toc_h1]
story.append(Paragraph('Indice', sH1))
story.append(Spacer(1, 6))
story.append(toc)
story.append(PageBreak())

# ================================================================
# CHAPTER 1: RESUMEN EJECUTIVO
# ================================================================
story.append(h1('1. Resumen Ejecutivo'))

story.append(body(
    'Este informe presenta los resultados de una auditoria funcional completa de VitaZen, '
    'una aplicacion web de desarrollo personal construida con Next.js 16, Prisma, Firebase Auth '
    'y Stripe. El analisis se ha realizado examinando el comportamiento real del codigo fuente, '
    'recorriendo todos los flujos de navegacion, verificando cada boton, enlace y estado de la '
    'interfaz, y contrastando las promesas visibles al usuario con las funcionalidades reales '
    'implementadas en el codigo.'
))
story.append(body(
    'La aplicacion dispone de 27 paginas estaticas, 57 rutas API, un sistema de autenticacion '
    'completo con Firebase, un modelo de suscripcion premium con Stripe, un chat de IA conectado '
    'a Groq, y cinco imperios de desarrollo personal con funcionalidades CRUD completas. La '
    'arquitectura general es solida, con protecciones contra condiciones de carrera (advisory locks), '
    'transacciones atomicas para operaciones criticas, y un sistema de gating premium que opera '
    'tanto en cliente como en servidor.'
))
story.append(body(
    'A lo largo de esta auditoria se han identificado un total de <b>34 problemas</b>, clasificados '
    'en cinco niveles de gravedad: 3 criticos, 8 altos, 14 medios y 9 bajos. La mayoria de los '
    'problemas se concentran en inconsistencias textuales, codigo muerto, y ajustes de UX que no '
    'afectan la funcionalidad nuclear de la aplicacion. Solo un problema critico impide al usuario '
    'completar un flujo de principio a fin, y ninguno compromete datos del usuario.'
))

# Stats table
story.append(Spacer(1, 8))
stats_data = [
    [Paragraph('<b>Metrica</b>', sTableHeader), Paragraph('<b>Valor</b>', sTableHeader)],
    [Paragraph('Paginas auditadas', sTableCell), Paragraph('27 rutas + 5 sub-rutas', sTableCell)],
    [Paragraph('Rutas API auditadas', sTableCell), Paragraph('57 endpoints', sTableCell)],
    [Paragraph('Componentes examinados', sTableCell), Paragraph('Mas de 80 componentes', sTableCell)],
    [Paragraph('Problemas encontrados', sTableCell), Paragraph('34 (3 criticos, 8 altos, 14 medios, 9 bajos)', sTableCell)],
    [Paragraph('Flujos rotos', sTableCell), Paragraph('1 (pagina huérfana)', sTableCell)],
    [Paragraph('Funcionalidades que no cumplen lo prometido', sTableCell), Paragraph('4 toggle placebo', sTableCell)],
]
st = Table(stats_data, colWidths=[CONTENT_W*0.45, CONTENT_W*0.55], repeatRows=1)
st.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    *[('BACKGROUND', (0, i), (-1, i), colors.white if i % 2 == 1 else TABLE_STRIPE) for i in range(1, 7)]
]))
story.append(st)

# ================================================================
# CHAPTER 2: FLUJOS DE AUTENTICACION
# ================================================================
story.append(h1('2. Flujos de Autenticacion'))
story.append(body(
    'VitaZen utiliza Firebase Auth como unico proveedor de autenticacion, sin NextAuth ni cookies de sesion. '
    'El flujo comienza con el SDK cliente de Firebase, que genera un token ID enviado como Bearer en cada '
    'peticion API. El servidor verifica el token con Firebase Admin SDK y busca al usuario en PostgreSQL '
    'mediante Prisma. Este patron es consistente en toda la aplicacion y funciona correctamente.'
))

story.append(h2('2.1 Registro'))
story.append(body(
    'El registro requiere email, contrasena y nombre. La validacion cliente incluye comprobacion de '
    'coincidencia de contrasena y deteccion proactiva del proveedor de autenticacion al perder el foco '
    'del campo email: si el correo ya existe con Google, se muestra un mensaje indicandolo antes de '
    'enviar el formulario. La contrasena requiere minimo 6 caracteres (validado por Firebase server-side). '
    'Tras el registro exitoso, el usuario es redirigido a /onboarding y se crea su cuenta en la base '
    'de datos junto con 5 registros de progreso de imperio.'
))
story.append(body(
    '<b>Problema:</b> No existe checkbox de aceptacion de terminos y condiciones ni enlace a la politica '
    'de privacidad en el formulario de registro. Esto representa un riesgo legal y de cumplimiento normativo, '
    'especialmente bajo el RGPD europeo, dado que la aplicacion opera en Espana.'
))

story.append(h2('2.2 Inicio de Sesion'))
story.append(body(
    'El login con correo y contrasena funciona correctamente, con gestion inteligente de mismatch de '
    'proveedores: si un usuario intenta login con correo pero su cuenta fue creada con Google, se muestra '
    'un mensaje contextual con un boton para redirigir al login con Google. El login con Google detecta '
    'automaticamente el entorno (iOS PWA, Android TWA, escritorio) y elige popup o redirect segun '
    'corresponda. Ambos flujos redirigen a /onboarding, que actua como puerta de enlace: si el '
    'onboarding ya fue completado, redirige al dashboard.'
))

story.append(h2('2.3 Recuperacion de Contrasena'))
story.append(body(
    'El flujo de recuperacion funciona en dos pasos: (1) la pagina /forgot-password envia un email con '
    'un token UUID de 1 hora de validez, y (2) la pagina /reset-password permite establecer una nueva '
    'contrasena. El token se valida exclusivamente al enviar el formulario, no al cargar la pagina. '
    'Esto significa que si el token ha expirado, el usuario solo lo descubre despues de rellenar el '
    'formulario, lo cual es una experiencia de usuario deficiente aunque funcionalmente correcto. '
    'El sistema implementa proteccion anti-enumeracion: siempre devuelve 200 incluso si el email '
    'no existe, y los tokens se invalidan tras su uso.'
))

story.append(h2('2.4 Cierre de Sesion'))
story.append(body(
    'El logout esta disponible unicamente en el sidebar inferior mediante el boton "Cerrar sesion". '
    'Llama a firebaseSignOut() y limpia el estado local, redirigiendo a /login. No existe dialogo '
    'de confirmacion, por lo que un toque accidental cierra sesion inmediatamente. En movil, el '
    'usuario debe abrir el menu hamburguesa para acceder al boton. No existe opcion de cierre de '
    'sesion en Ajustes ni en el TopBar.'
))

# ================================================================
# CHAPTER 3: DASHBOARD
# ================================================================
story.append(h1('3. Dashboard'))

story.append(body(
    'El dashboard es la pagina principal tras el inicio de sesion y funciona como centro de operaciones. '
    'Muestra un saludo contextual basado en la hora (zona Madrid), el estado emocional del usuario, una '
    'frase diaria determinista, el check-in del dia, una cuadricula con los 5 imperios (nivel, XP, racha), '
    'patrones de vida (premium) y un prompt de cierre mensual durante los primeros 7 dias del mes. '
    'Carga 2 llamadas API en paralelo (imperios y check-in del dia) mas 5 llamadas independientes desde '
    'componentes hijos. Todos los enlaces a imperios y al historial de check-in funcionan correctamente.'
))
story.append(body(
    'Los estados de carga usan skeletons con shimmer que replican la estructura real del dashboard. '
    'El estado vacio del EmotionalHero muestra un mensaje indicando que aparecera con el primer check-in, '
    'pero no distingue entre "sin datos" y "error de API", mostrando el mismo texto en ambos casos. '
    'Los componentes SilentMemory y PremiumReflection fallan silenciosamente sin mostrar error, lo cual '
    'es aceptable para contenido complementario. La pagina incluye logica de post-checkout que sondea '
    'la API cada 2/4/8 segundos para detectar la activacion de la suscripcion premium tras un pago en Stripe.'
))

# ================================================================
# CHAPTER 4: CHECK-IN
# ================================================================
story.append(h1('4. Check-in'))
story.append(body(
    'El check-in es una funcionalidad completamente operativa disponible para todos los usuarios sin '
    'restriccion premium. Se accede desde un boton en el dashboard o desde la pagina dedicada /checkin. '
    'El flujo consta de un modal de 2 pasos: (1) formulario con 4 sliders (emocion, energia, foco, '
    'estres, todos de 1 a 5), un campo de intencion obligatorio (max 120 caracteres) y una nota '
    'opcional (max 300); (2) confirmacion con checkmark y feedback de XP (+10 XP al imperio Mente '
    'solo en el primer check-in del dia).'
))
story.append(body(
    'La API usa advisory locks de PostgreSQL para prevenir double-XP por concurrencia. El DELETE de '
    'un check-in revierte el XP en una transaccion atomica. La historial muestra los ultimos 30 dias '
    'con opciones de editar y eliminar (con confirmacion). Los check-ins usan la fecha de Madrid para '
    'el limite de uno por dia. Cada entrada editable y eliminable, con estados de carga (skeleton), '
    'vacio (PremiumEmptyState con CTA) y error (PremiumErrorState con reintentar) completamente '
    'implementados. El modal tiene soporte completo de accesibilidad: ARIA, focus trap, escape key.'
))

# ================================================================
# CHAPTER 5: LOS 5 IMPERIOS
# ================================================================
story.append(h1('5. Los 5 Imperios'))
story.append(body(
    'Cada imperio sigue un patron consistente: encabezado con icono y titulo, seccion de contenido '
    'principal con CRUD completo, seccion de tips con gating premium (1 tip premium bloqueado para '
    'usuarios free, contenido eliminado server-side), y estados de carga, vacio y error. Los cinco '
    'imperios comparten los componentes PremiumEmptyState, PremiumErrorState, EmpireSkeleton, '
    'ContextualHelp y PrivacyMask. Todos los contratos API frontend-backend coinciden perfectamente.'
))

story.append(h2('5.1 Disciplina (/imperio/disciplina)'))
story.append(body(
    'Gestiona habitos con creacion, edicion, eliminacion y completado. Incluye un reto diario que '
    'se auto-completa cuando el usuario crea o completa un habito. Los habitos soportan frecuencia '
    '(diario, semanal, mensual) y verifican su completado en el periodo actual. La animacion de '
    'MicroReward se muestra al completar un habito. Screenshot mode implementado.'
))

story.append(h2('5.2 Mente (/imperio/mente)'))
story.append(body(
    'Contiene 5 tecnicas de respiracion con guias completas (Diafragmatica, Coherencia Cardiaca, '
    'Atencion Plena, Nadi Shodhana, Box Breathing), un temporizador de meditacion con pausa/reanudacion, '
    'visualizador de patron de respiracion (PatternFlow), e historial de sesiones. Incluye un enlace '
    'al Mentor IA especifico de Mente. <b>El estado vacio carece de boton CTA</b>, a diferencia de '
    'todos los demas imperios que si lo incluyen. No implementa screenshot mode.'
))

story.append(h2('5.3 Energia (/imperio/energia)'))
story.append(body(
    'Dos registros independientes: bienestar (estado de animo, energia, sueno, estres + notas) y '
    'nutricion (comidas, agua, calorias, notas). Ambos usan upsert por dia (solo un registro por '
    'tipo y dia). Las listas estan limitadas visualmente a 7 elementos con uso de RatingInput '
    'custom. Estados vacios con CTA funcionales. No implementa screenshot mode.'
))

story.append(h2('5.4 Riqueza (/imperio/riqueza)'))
story.append(body(
    'El imperio mas complejo: registro financiero con captura rapida de lenguaje natural que parsea '
    '"Cafe 3,50" en datos estructurados, categorias con sugerencias inteligentes basadas en historial, '
    'balance de intenciones (Tranquilidad, Crecimiento, Necesidad, Disfrute), navegacion mensual, '
    'y filtro por periodo. <b>Usa un ancho de contenedor diferente</b> (max-w-5xl) que los demas '
    'imperios (max-w-4xl). <b>No tiene ContextualHelp</b> a pesar de ser el mas complejo. El estado '
    'de error usa un titulo inconsistente: "No se pudo cargar" vs "No se pudo cargar el imperio". '
    'Usa un FAB (Floating Action Button) unico y un toast de guardado exclusivo.'
))

story.append(h2('5.5 Crecimiento (/imperio/crecimiento)'))
story.append(body(
    'Diario personal con entradas que incluyen titulo, contenido, estado de animo (1-5) y gratitud. '
    'Las entradas se agrupan por fecha con etiquetas contextuales (Hoy, Ayer, Esta semana). El '
    'contenido largo se trunca a 150 caracteres con boton expandir/colapsar. Indicador visual de '
    "entrada editada. MicroReward al guardar. Screenshot mode implementado."
))

# ================================================================
# CHAPTER 6: MENTOR IA
# ================================================================
story.append(h1('6. Mentor IA'))
story.append(body(
    'El Mentor IA es la funcionalidad mas sofisticada de VitaZen. Conecta con Groq (modelo '
    'llama-3.3-70b-versatile) y no utiliza respuestas codificadas. Dispone de sidebar con hilos '
    'agrupados por fecha (con tabs "Todas" y "Archivadas"), soporte para renombrar, archivar y '
    'eliminar conversaciones, y chips de sugerencias en conversaciones vacias. La interfaz es '
    'responsiva con sidebar colapsable en desktop y drawer deslizante en movil.'
))
story.append(body(
    'El sistema de contextos construye un perfil del usuario con check-ins, habitos, meditaciones, '
    'diarios, finanzas, estado emocional, imperios y patrones de vida. Los usuarios premium reciben '
    'significativamente mas contexto (5 check-ins vs 2, 8 habitos vs 4, patrones cruzados). El '
    'limite diario de mensajes es de 15 para free (con contador visible) e ilimitado para elite. '
    'Proteccion contra concurrencia con advisory lock por hilo, rollback de creditos si Groq falla, '
    'deteccion offline con banner y gestion de visibilidad para refrescar datos al volver a la app.'
))

# ================================================================
# CHAPTER 7: OBSERVACIONES, EVOLUCION, MEMORIA
# ================================================================
story.append(h1('7. Observaciones, Tu Evolucion y Memoria'))

story.append(h2('7.1 Observaciones (/insights)'))
story.append(body(
    'Pagina basada en reglas (sin IA) que genera observaciones semanales a partir de 16 consultas '
    'paralelas a la base de datos. Muestra un wellness score con anillo circular, cuadricula resumida '
    'semanal, comparativa semana a semana (premium), tarjetas de insight (3 free, 5 premium con '
    'tendencias), y metricas detalladas con gating premium. Todas las tarjetas son enlaces funcionales '
    'a las paginas relevantes. Dos tarjetas ("Actividad total" e "Imperios") enlazan a /insights '
    '(la propia pagina) en lugar de a sus destinos logicos.'
))

story.append(h2('7.2 Tu Evolucion (/memoria-de-vida)'))
story.append(body(
    'Pagina contemplativa con timeline de etapas de vida detectadas automaticamente a partir de datos '
    'agregados (bienestar, check-ins, finanzas, diarios, meditaciones) de los ultimos 6 meses. Los '
    'usuarios free ven unicamente las etapas; las transiciones, momentos destacados y conexiones '
    'historicas estan restringidas a elite. <b>No tiene error boundary ni estado de error visible</b>: '
    'si la API falla, la pagina devuelve null y muestra una pantalla en blanco sin feedback alguno. '
    'Esta es la unica pagina del dashboard con este comportamiento.'
))

story.append(h2('7.3 Memoria (/timeline)'))
story.append(body(
    'Feed cronologico de actividad agrupado por dia con acentos de color por imperio. Incluye filtros '
    'por categoria (Todo, Mente, Energia, Disciplina, Riqueza). Los usuarios free ven unicamente los '
    'ultimos 3 grupos de dias (aproximadamente 7 dias), con una puerta premium en la parte inferior. '
    'Los montos financieros se codifican con PrivacyMask. No tiene error boundary propio.'
))

# ================================================================
# CHAPTER 8: CIERRE MENSUAL, LOGROS, PERFIL, AJUSTES
# ================================================================
story.append(h1('8. Cierre Mensual, Logros, Perfil y Ajustes'))

story.append(h2('8.1 Cierre Mensual (/cierre-mensual)'))
story.append(body(
    'Flujo de 2 fases: reflexion (textarea con pregunta unica) y resumen. El resumen calcula 6 '
    'metricas en paralelo: balance de intenciones, resumen financiero, ritmo de actividad, memorias, '
    'evolucion (premium) y conexiones (premium). Los datos son reales, sin IA. La reflexion se '
    'guarda en base de datos via upsert mensual. El prompt del dashboard aparece solo los dias 1-7 '
    'de cada mes y es descartable por mes via localStorage. <b>Si la API falla al cargar el resumen, '
    'no se muestra ningun mensaje de error al usuario</b>, cayendo silenciosamente a la fase de reflexion.'
))

story.append(h2('8.2 Logros (/logros)'))
story.append(body(
    'Sistema de 45 logros (27 visibles + 18 ocultos) distribuidos en 8 categorias. El progreso se '
    'calcula dinamicamente mediante 17 consultas paralelas a la base de datos. Los logros ocultos se '
    'revelan al 75% de progreso como tarjetas misterio ("???"). <b>El desbloqueo solo ocurre al '
    'visitar la pagina /logros</b>, no hay triggers server-side al escribir datos. Si un usuario '
    'alcanza un hito pero nunca visita la pagina, el logro no se registra. La proteccion contra '
    'condiciones de carrera esta implementada con try/catch en la creacion unica.'
))

story.append(h2('8.3 Perfil (/perfil)'))
story.append(body(
    'Muestra avatar, nombre, plan, pais, ciudad, edad, bio, email (solo lectura), plan (solo lectura) '
    'y fecha de registro. La edicion permite modificar nombre, avatar, pais, ciudad, edad y bio con '
    'validacion server-side. La subida de avatar se procesa client-side: validacion MIME, deteccion '
    'HEIC (bloqueada con mensaje claro), redimension a 512x512, compresion JPEG 80%, limite 200KB. '
    'Se almacena como base64 data URL en la base de datos. No existe opcion de eliminar cuenta.'
))

story.append(h2('8.4 Ajustes (/ajustes)'))
story.append(body(
    'Contiene secciones de email (resumen semanal funcional, recordatorios diarios placebo), '
    'notificaciones push (4 tipos, solo 1 funcional), privacidad (toggle de estadisticas funcional), '
    'cuenta (enlace a perfil, gestor de suscripcion Stripe, cierre de sesion) e informacion de la '
    'app (version 0.2.0, verificacion de email, enlaces a privacidad y terminos). Todos los toggles '
    'usan actualizaciones optimistas con revertido en caso de error. Los enlaces a /privacy y /terms '
    'usan etiquetas a HTML en lugar de Next.js Link, provocando recarga completa de pagina.'
))

# ================================================================
# CHAPTER 9: PAGINA ELITE Y GATING
# ================================================================
story.append(h1('9. Pagina Elite y Sistema de Gating'))

story.append(h2('9.1 Dos Paginas, Listados Inconsistentes'))
story.append(body(
    'Existen dos paginas de precios: /elite (editorial, tono contemplativo, 11 features por plan) '
    'y /pricing (layout tradicional, 6 features free y 8 features elite). Ambas redirigen al mismo '
    'checkout de Stripe, pero los listados de funcionalidades no coinciden entre si. Un usuario que '
    'visita /pricing ve una descripcion menos completa que la de /elite. Ademas, /pricing no esta '
    'enlazada desde ningun elemento de navegacion; solo se alcanza como fallback de error desde /elite.'
))

story.append(h2('9.2 Veracidad de las Promesas'))
story.append(body(
    'Todas las funcionalidades declaradas como "Free" en la pagina elite estan efectivamente disponibles '
    'sin restricciones. Todas las funcionalidades declaradas como "Elite" estan implementadas y '
    'protegidas tanto client-side (PremiumGate) como server-side (validacion en API routes). '
    'El sistema de gating es robusto: el contenido premium se elimina del response del servidor para '
    'usuarios free, no solo se oculta visualmente. No se encontraron promesas falsas.'
))

story.append(h2('9.3 Tabla Comparativa Free vs Elite'))

gating_rows = [
    ('Check-in diario', 'Completo', 'Completo', 'Sin diferencias'),
    ('Habitos, meditacion, bienestar, nutricion, finanzas, diario', 'Completo', 'Completo', 'CRUD completo en ambos planes'),
    ('5 Imperios con niveles, XP, rachas', 'Completo', 'Completo', 'Sin diferencias'),
    ('Mentor IA - mensajes diarios', '15/dia', 'Ilimitado', 'Enforzado server-side con advisory lock'),
    ('Mentor IA - contexto', 'Basico (10 msgs, 800 tokens)', 'Profundo (30 msgs, 2048 tokens)', 'Diferencia significativa en calidad'),
    ('Mentor IA - hilos', '20 max, 10 visibles', '100 max, todos visibles', 'Limite server-side'),
    ('Observaciones - comparativa semanal', 'No disponible', 'Completo', 'Gated PremiumGate + API'),
    ('Timeline - historial', '3 grupos de dia (~7 dias)', 'Completo', 'PremiumHistoryGate'),
    ('Tu Evolucion - transiciones/memorias/patrones', 'Solo etapas', 'Completo', 'Gated server-side'),
    ('Cierre Mensual - evolucion/recuerdos', 'No disponible', 'Completo', 'Gated server-side'),
    ('Tips de imperio', '2 por imperio', '3 por imperio', 'Contenido eliminado server-side'),
    ('Logros', 'Completo', 'Completo', 'Sin diferencias'),
    ('Resumen semanal', 'Basico', 'Avanzado con tendencias', 'Gated server-side'),
]
story.append(Spacer(1, 6))
story.append(feature_table(gating_rows))

# ================================================================
# CHAPTER 10: PROBLEMAS ENCONTRADOS
# ================================================================
story.append(h1('10. Problemas Encontrados'))

# -- 10.1 CRITICOS --
story.append(h2('10.1 Problemas Criticos'))

story.append(issue_table([
    ('CRITICA', '3 toggles placebo de notificaciones push',
     'NotificationPreferences.tsx',
     'Los toggles "Check-in diario", "Resumen semanal" y "Te echamos de menos" guardan estado en DB pero ningun backend los consume. Los usuarios creen haber activado notificaciones que nunca llegaran.'),
    ('CRITICA', '1 toggle placebo de email',
     'schema.prisma / settings/route.ts',
     'El toggle "Recordatorios diarios" se almacena pero ningun cron o servicio lo lee. El codigo lo documenta explicitamente.'),
    ('CRITICA', 'Inconsistencia Riqueza/Finanzas en toda la app',
     'Sidebar, TopBar, imperios, insights, logros, privacy, terms',
     'El sidebar y TopBar muestran "Riqueza" pero la pagina dice "Finanzas". El onboarding, insights, logros, pricing, privacy y terms usan "Finanzas". Un usuario ve un nombre en navegacion y otro al llegar a la pagina.'),
]))

# -- 10.2 ALTOS --
story.append(h2('10.2 Problemas de Gravedad Alta'))

story.append(issue_table([
    ('ALTA', 'Pagina /imperio/mente/mentor es huérfana',
     'imperio/mente/mentor/page.tsx',
     'Cero referencias en todo el codebase. Ningun Link, router.push ni navegacion apunta a esta ruta. Es un duplicado muerto del mentor general en /imperio/mentor.'),
    ('ALTA', '13 console.log AUTH-FORENSIC en produccion',
     'login/page.tsx, onboarding/page.tsx',
     'Logs de depuracion con flujo completo de autenticacion expuestos en la consola del navegador. Un usuario puede inspeccionar el flujo de auth completo.'),
    ('ALTA', 'Sin checkbox de terminos en registro',
     'register/page.tsx',
     'No existe checkbox ni enlace a terminos/privacidad. Riesgo legal bajo RGPD. La pagina /privacy existe pero no se enlaza desde el registro.'),
    ('ALTA', 'Middleware no protege rutas',
     'middleware.ts',
     'El middleware es un passthrough que no bloquea ninguna ruta. Toda la proteccion es client-side. Un acceso directo a rutas del dashboard renderiza HTML antes de que el guard cliente redirija.'),
    ('ALTA', 'Sin error boundary en /memoria-de-vida',
     'memoria-de-vida/page.tsx',
     'Si la API falla, la pagina devuelve null (pantalla en blanco). No hay error.tsx ni estado de error visible. Unico caso en todo el dashboard.'),
    ('ALTA', 'Sin error boundary en /timeline',
     'timeline/page.tsx',
     'Mismo problema que memoria-de-vida: no existe error.tsx para esta ruta. Si un error no capturado ocurre, se muestra el error boundary generico de la app.'),
    ('ALTA', 'Inconsistencia de textos Insights/insights',
     'insights/page.tsx, insights/error.tsx, WeeklyRecap.tsx',
     'El sidebar dice "Observaciones" pero textos internos usan "Insights Semanales", "No se pudieron cargar los insights", "Sin insights". Mezcla de espanol e ingles.'),
    ('ALTA', 'Debug panel en produccion',
     'AuthContext.tsx lineas 22-45',
     'window.__authDebug expone el estado completo de autenticacion. Documentado como "TEMPORARY" pero aun presente en el codebase.'),
]))

# -- 10.3 MEDIOS --
story.append(h2('10.3 Problemas de Gravedad Media'))

story.append(issue_table([
    ('MEDIA', 'Enlaces auto-referenciados en Insights',
     'insights/page.tsx lineas 339, 537',
     'Las tarjetas "Actividad total" e "Imperios" enlazan a /insights (la propia pagina) en lugar de a sus destinos logicos. El usuario hace clic y no navega a ningun sitio nuevo.'),
    ('MEDIA', 'Etiquetas a HTML en vez de Link en Ajustes',
     'ajustes/page.tsx lineas 356, 359',
     'Los enlaces a /privacy y /terms usan a HTML que provoca recarga completa de pagina en vez de navegacion client-side. Inconsistente con el resto de la app.'),
    ('MEDIA', 'Logros solo se desbloquean al visitar la pagina',
     'api/achievements/route.ts',
     'No existen triggers server-side al crear datos. Si un usuario alcanza un hito pero nunca visita /logros, el logro no se registra en la base de datos.'),
    ('MEDIA', '5 API routes muertos',
     'api/dashboard/progress, metrics, momentum, streaks, analytics/insights, stripe/restore',
     'Rutas que no son llamadas por ningun componente del frontend. Consumen espacio de deploy y potencialmente recursos de base de datos si son invocadas externamente.'),
    ('MEDIA', 'Componente PremiumBlur muerto',
     'components/ui/PremiumBlur.tsx',
     'Componente que nunca se importa en ningun archivo del codebase. Codigo muerto.'),
    ('MEDIA', 'Inconsistencia de ancho en Riqueza',
     'imperio/riqueza/page.tsx',
     'Usa max-w-5xl + padding mientras los otros 4 imperios usan max-w-4xl sin padding. Crea un salto visual al navegar entre imperios.'),
    ('MEDIA', 'Mente sin CTA en estado vacio',
     'imperio/mente/page.tsx lineas 681-687',
     'Todos los demas imperios muestran un boton CTA cuando no hay datos. Mente solo muestra texto sin accion.'),
    ('MEDIA', 'Sin confirmacion de logout',
     'Sidebar.tsx',
     'Un unico toque cierra sesion inmediatamente. Sin dialogo de confirmacion. En movil requiere abrir el menu hamburguesa.'),
    ('MEDIA', 'Titulo de error inconsistente en Riqueza',
     'imperio/riqueza/page.tsx linea 815',
     'Dice "No se pudo cargar" mientras los otros 4 imperios dicen "No se pudo cargar el imperio".'),
    ('MEDIA', 'Token de reset no se valida al cargar',
     'ResetPasswordClient.tsx lineas 21-29',
     'Solo comprueba si el parametro token existe. Tokens expirados muestran el formulario completo; el usuario solo descubre el fallo tras enviar.'),
    ('MEDIA', 'Campo nombre sin validacion en registro',
     'register/page.tsx',
     'El campo nombre no tiene atributo required ni minLength. Se puede registrar con nombre vacio.'),
    ('MEDIA', 'Sin Cierre Mensual error UI',
     'cierre-mensual/page.tsx lineas 109-112',
     'Si la API falla al cargar el resumen, cae silenciosamente a la fase de reflexion sin ningun mensaje de error.'),
    ('MEDIA', 'Historial de check-in no se actualiza tras guardar nuevo',
     'checkin/page.tsx',
     'El handleCheckinSave para POST solo actualiza todayCheckin pero no el array checkins ni trends. Quedan obsoletos hasta recarga manual.'),
    ('MEDIA', 'Inconsistencia emoji en check-in',
     'checkin/page.tsx lineas 295, 385',
     'Usa ternarios inline en vez de importar de emotion-emojis.ts (la fuente de verdad). Emocion 1 y 2 se mapean al mismo emoji.'),
]))

# -- 10.4 BAJOS --
story.append(h2('10.4 Problemas de Gravedad Baja'))

story.append(issue_table([
    ('BAJA', '34 componentes shadcn/ui sin uso',
     'components/ui/ (accordion, alert, calendar, etc.)',
     'Componentes de libreria nunca importados. Ocupan espacio de build pero no afectan funcionalidad.'),
    ('BAJA', '5 PremiumGate con isPremium={false} hardcodeado',
     'memoria-de-vida, cierre-mensual',
     'El prop siempre es false. El contenido premium se renderiza via bloques {isPremium && ...} separados. Funcionalmente correcto pero arquitectonicamente engañoso.'),
    ('BAJA', 'Boton placeholder "proximo" sin accion',
     'WeeklyRecap.tsx linea 659',
     '"Resumen semanal por email proximamente" con efectos hover pero sin onClick. Tiene cursor-default pero visualmente parece interactivo.'),
    ('BAJA', 'Sin navegacion cruzada entre imperios',
     'Todas las paginas de imperio',
     'No existe boton "siguiente imperio" ni tabs. El usuario siempre debe volver al sidebar o al dashboard para cambiar de imperio.'),
    ('BAJA', 'Screenshot mode inconsistente',
     'Solo Disciplina y Crecimiento',
     'Mente, Energia y Riqueza no implementan screenshot mode. En modo captura muestran estados vacios o de carga.'),
    ('BAJA', 'Sin option de eliminar cuenta',
     'perfil, ajustes',
     'No existe ningun mecanismo para eliminar la cuenta del usuario ni sus datos asociados.'),
    ('BAJA', 'Sin exportacion de datos (RGPD)',
     'ajustes',
     'No existe funcionalidad de exportacion de datos del usuario, requisito del RGPD.'),
    ('BAJA', 'Sin indicador de fuerza de contrasena',
     'register/page.tsx',
     'Solo se indica "minimo 6 caracteres". No hay requisitos de mayusculas, digitos o caracteres especiales.'),
    ('BAJA', 'Sin not-found.tsx en rutas del dashboard',
     'Ninguna ruta del dashboard',
     'Se depende del 404 por defecto de Next.js. No hay pagina personalizada de "no encontrado".'),
]))

# ================================================================
# CHAPTER 11: LO QUE FUNCIONA CORRECTAMENTE
# ================================================================
story.append(h1('11. Lo Que Funciona Correctamente'))

story.append(body(
    'A pesar de los problemas encontrados, la mayor parte de VitaZen funciona de forma robusta y '
    'completa. A continuacion se detallan los aspectos que operan correctamente y que merecen '
    'reconocimiento por su calidad de implementacion.'
))

story.append(h2('11.1 Arquitectura de Autenticacion'))
story.append(body(
    'El sistema de autenticacion es solido y resiliente. La deteccion proactiva de mismatch de '
    'proveedores (al perder el foco del campo email, antes de enviar) es una experiencia de usuario '
    'superior a la mayoria de aplicaciones. La seleccion inteligente de popup vs redirect segun el '
    'entorno (iOS PWA, Android TWA, escritorio) demuestra atencion al detalle. El flujo de sync '
    'con reintentos, proteccion contra llamadas concurrentes y timeouts configurables (8s Firebase, '
    '20s DB) maneja correctamente los escenarios de red adversos. La auto-curacion de la base de '
    'datos (getAuthUserBasic crea usuarios faltantes con email verificado) evita estados inconsistentes.'
))

story.append(h2('11.2 Protecciones de Concurrencia'))
story.append(body(
    'El uso de pg_advisory_xact_lock para prevenir double-XP en check-ins, double-checkout en Stripe, '
    'y races en el limite de mensajes de IA es una practica de ingenieria de bases de datos avanzada. '
    'Las transacciones atomicas que combinan escritura de datos + actualizacion de XP (o su revertido '
    'en caso de DELETE) garantizan que no haya estados parciales. El rollback de creditos de IA si '
    'Groq falla despues de descontar el limite demuestra un pensamiento exhaustivo sobre fallos parciales.'
))

story.append(h2('11.3 Sistema de Gating Premium'))
story.append(body(
    'El gating premium opera a tres niveles: (1) visual (PremiumGate atenua el contenido a 40% de '
    'opacidad), (2) server-side (el contenido premium se elimina del response del API, no solo se '
    'oculta), y (3) funcional (limites de mensajes, hilos y contexto se enforzan server-side con '
    'locks atomicos). Este triple enfoque es mas robusto que la mayoria de aplicaciones SaaS, donde '
    'el gating suele ser solo visual o solo server-side. No se encontro ninguna forma de acceder a '
    'contenido premium como usuario free.'
))

story.append(h2('11.4 CRUD Completo en los 5 Imperios'))
story.append(body(
    'Cada uno de los 5 imperios tiene operaciones de crear, leer, editar y eliminar completamente '
    'funcionales, con validacion server-side, estados de carga (skeleton), estados vacios con CTA, '
    'estados de error con reintentar, modales de confirmacion para eliminar, bloqueo de scroll del '
    'body durante modales, y proteccion de datos con PrivacyMask. Los contratos API coinciden '
    'perfectamente entre frontend y backend. Riqueza anade captura rapida con parseo de lenguaje '
    'natural, categorias aprendidas y balance de intenciones.'
))

story.append(h2('11.5 Mentor IA con Groq'))
story.append(body(
    'La integracion con Groq es completa y production-ready. El sistema de contextos construye un '
    'perfil rico del usuario a partir de multiples fuentes de datos. La gestion de hilos con archivado, '
    'renombrado y eliminacion es funcional. El contador de mensajes diarios con reset a medianoche '
    '(zona Madrid) funciona correctamente. La deteccion offline con banner sutil y la gestion de '
    'cambio de visibilidad (para refrescar datos al volver de background) demuestra una atencion '
    'exhaustiva a la experiencia mobile-first.'
))

story.append(h2('11.6 Integracion Stripe'))
story.append(body(
    'La integracion con Stripe maneja checkout, portal de gestion, webhooks con idempotencia '
    '(StripeEventLog con TTL de 7 dias), y flujo de restauracion de suscripciones perdidas. '
    'La resolucion de usuarios tiene 3 niveles de fallback (metadata de sesion, metadata de '
    'customer, busqueda en DB). La proteccion contra double-billing con advisory lock y la '
    'verificacion de firma con fallback a test key solo en no-produccion son practicas de seguridad '
    'appropriadas. El flujo de post-checkout con polling en el dashboard asegura que el usuario '
    'vea su upgrade reflejado inmediatamente.'
))

story.append(h2('11.7 Accesibilidad y UX'))
story.append(body(
    'El modal de check-in tiene soporte completo de accesibilidad: role="dialog", aria-modal, '
    'aria-labelledby, aria-describedby, focus trap, escape key y restauracion de foco. Los sliders '
    'usan role="radiogroup" con role="radio" y aria-checked. El sistema de ayuda progresiva '
    '(ContextualHelp) con 3 niveles de detalle (banner completo, icono con tooltip, icono "?") '
    'demuestra un enfoque maduro de UX. El PrivacyMask permite al usuario ocultar estadisticas '
    'sensibles globalmente.'
))

# ================================================================
# CHAPTER 12: VEREDICTO FINAL
# ================================================================
story.append(h1('12. Veredicto Final'))

story.append(body(
    '<b>Se puede utilizar VitaZen completamente de principio a fin sin encontrar una funcionalidad '
    'rota que impida completar un flujo esencial.</b> Todos los CRUD funcionan, la autenticacion '
    'opera correctamente, el check-in se completa sin errores, los 5 imperios son funcionales, '
    'el Mentor IA responde con inteligencia artificial real, el cierre mensual guarda datos, los '
    'logros se calculan correctamente, y la integracion con Stripe procesa pagos y activa suscripciones.'
))

story.append(body(
    'Sin embargo, hay <b>cuatro problemas que degradan la experiencia de forma medible</b>: '
    '(1) los toggles placebo de notificaciones (3 push + 1 email) que hacen creer al usuario que '
    'ha activado algo que no funciona, (2) la inconsistencia Riqueza/Finanzas que confunde al '
    'usuario al ver nombres distintos para el mismo imperio, (3) la pagina huérfana /imperio/mente/mentor '
    'que sugiere una funcionalidad existente pero inaccesible, y (4) los logs AUTH-FORENSIC que '
    'exponen el flujo de autenticacion en produccion.'
))

story.append(body(
    'Ninguno de estos problemas impide utilizar la aplicacion, pero si se priorizan los 3 criticos '
    'y los 8 altos, VitaZen alcanzaria un nivel de pulido consistente con su calidad arquitectonica. '
    'La base tecnica es excelente; los problemas son de acabado, no de fundamento.'
))

story.append(Spacer(1, 20))
story.append(hr())
story.append(muted(
    'Informe generado el ' + datetime.now().strftime('%d de julio de %Y') +
    '. Auditoria realizada sobre el repositorio josinesprados-hub/VitaZen. '
    'Ningun archivo fue modificado durante este proceso.'
))

# ============================================================
# BUILD
# ============================================================
doc.multiBuild(story, onLaterPages=page_title, onFirstPage=page_title)
print(f'PDF generado: {OUTPUT}')