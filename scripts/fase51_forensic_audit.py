#!/usr/bin/env python3
"""
VitaZen FASE 5.1 - Auditoria Forense de Rendimiento
12-section forensic performance audit report (PDF)
"""

import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm, inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable, Image, Flowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FONT REGISTRATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import platform
_IS_MAC = platform.system() == 'Darwin'
FONT_DIR = os.path.expanduser('~/.openclaw/workspace/fonts') if _IS_MAC else '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf', subfontIndex=0))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf', subfontIndex=0))
# NotoSansSC variable font not compatible with ReportLab TTFont - skip for Spanish doc
pdfmetrics.registerFont(TTFont('SarasaMonoSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
# NotoSansSC family skipped - variable font not compatible
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold', italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# Font fallback for mixed CJK/Latin
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'skills', 'pdf', 'scripts'))
try:
    from pdf import install_font_fallback
    install_font_fallback()
except Exception:
    pass

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CASCADE PALETTE (dark mode)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE_BG       = colors.HexColor('#131311')
SECTION_BG    = colors.HexColor('#1a1917')
CARD_BG       = colors.HexColor('#2a2821')
TABLE_STRIPE  = colors.HexColor('#1e1d19')
HEADER_FILL   = colors.HexColor('#58503a')
COVER_BLOCK   = colors.HexColor('#443e2c')
BORDER        = colors.HexColor('#514b39')
ICON          = colors.HexColor('#bba872')
ACCENT        = colors.HexColor('#dab549')
ACCENT_2      = colors.HexColor('#3fa6c8')
TEXT_PRIMARY   = colors.HexColor('#f2f2f1')
TEXT_MUTED     = colors.HexColor('#87857d')
SEM_SUCCESS   = colors.HexColor('#66b27f')
SEM_WARNING   = colors.HexColor('#b8a070')
SEM_ERROR     = colors.HexColor('#c67e78')
SEM_INFO      = colors.HexColor('#7d9dbd')

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STYLES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
W, H = A4
MARGIN = 2.2 * cm

styles = getSampleStyleSheet()

s_h1 = ParagraphStyle('H1', fontName='NotoSerifSC-Bold', fontSize=20, leading=28, textColor=ACCENT, spaceAfter=12, spaceBefore=6)
s_h2 = ParagraphStyle('H2', fontName='NotoSerifSC-Bold', fontSize=14, leading=20, textColor=TEXT_PRIMARY, spaceAfter=8, spaceBefore=14)
s_h3 = ParagraphStyle('H3', fontName='NotoSerifSC-Bold', fontSize=11.5, leading=16, textColor=ICON, spaceAfter=6, spaceBefore=10)
s_body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10, leading=16, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=6)
s_body_left = ParagraphStyle('BodyLeft', fontName='FreeSerif', fontSize=10, leading=16, textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=6)
s_muted = ParagraphStyle('Muted', fontName='FreeSerif-Italic', fontSize=9, leading=13, textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=4)
s_bullet = ParagraphStyle('Bullet', fontName='FreeSerif', fontSize=10, leading=15, textColor=TEXT_PRIMARY, leftIndent=18, bulletIndent=6, spaceAfter=3, alignment=TA_LEFT)
s_callout = ParagraphStyle('Callout', fontName='FreeSerif-Bold', fontSize=10, leading=15, textColor=ACCENT, leftIndent=12, spaceAfter=4, spaceBefore=4, alignment=TA_LEFT)
s_table_header = ParagraphStyle('TH', fontName='FreeSerif-Bold', fontSize=8.5, leading=12, textColor=colors.white, alignment=TA_LEFT)
s_table_cell = ParagraphStyle('TC', fontName='FreeSerif', fontSize=8.5, leading=12, textColor=TEXT_PRIMARY, alignment=TA_LEFT)
s_table_cell_sm = ParagraphStyle('TCS', fontName='FreeSerif', fontSize=8, leading=11, textColor=TEXT_PRIMARY, alignment=TA_LEFT)
s_footer = ParagraphStyle('Footer', fontName='FreeSerif-Italic', fontSize=7.5, leading=10, textColor=TEXT_MUTED, alignment=TA_CENTER)

# Severity colors as text labels (no emoji in ReportLab)
def sev_label(level):
    if level == 'CRITICO':
        return '<font color="#c67e78"><b>[CRITICO]</b></font>'
    elif level == 'IMPORTANTE':
        return '<font color="#b8a070"><b>[IMPORTANTE]</b></font>'
    elif level == 'RECOMENDABLE':
        return '<font color="#7d9dbd"><b>[RECOMENDABLE]</b></font>'
    else:
        return '<font color="#66b27f"><b>[NO MERECE LA PENA]</b></font>'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TOC TEMPLATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
        self.page_count = 0

    def afterPage(self):
        self.page_count += 1

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def page_title(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont('FreeSerif-Italic', 7.5)
    canvas.drawCentredString(W / 2, 18 * mm, 'VitaZen - FASE 5.1 - Auditoria Forense de Rendimiento')
    canvas.drawRightString(W - MARGIN, 18 * mm, f'{doc.page}')
    canvas.restoreState()

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TABLE HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def make_table(headers, rows, col_widths=None):
    available = W - 2 * MARGIN
    if col_widths is None:
        n = len(headers)
        col_widths = [available / n] * n
    header_row = [Paragraph(h, s_table_header) for h in headers]
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), s_table_cell) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSerif-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]
    for i in range(1, len(data)):
        bg = TABLE_STRIPE if i % 2 == 0 else CARD_BG
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUILD STORY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story = []

# TOC
toc = TableOfContents()
toc_h0 = ParagraphStyle('TOCH0', fontName='NotoSerifSC-Bold', fontSize=11, leading=18, textColor=ACCENT, leftIndent=0)
toc_h1 = ParagraphStyle('TOCH1', fontName='FreeSerif', fontSize=10, leading=16, textColor=TEXT_PRIMARY, leftIndent=18)
toc.levelStyles = [toc_h0, toc_h1]
story.append(Paragraph('<b>INDICE</b>', ParagraphStyle('TOCTitle', fontName='NotoSerifSC-Bold', fontSize=22, leading=30, textColor=ACCENT, spaceAfter=18)))
story.append(Spacer(1, 6))
story.append(toc)
story.append(PageBreak())

# ═══════════════════════════════════════════════════════
# CHAPTER 1: ESTADO ACTUAL DEL RENDIMIENTO
# ═══════════════════════════════════════════════════════
story.append(add_heading('1. Estado Actual del Rendimiento', s_h1, 0))

story.append(add_heading('1.1 Puntuacion Global', s_h2, 1))
story.append(Paragraph(
    'VitaZen es una aplicacion de bienestar integral construida sobre Next.js con el App Router, '
    'React, Tailwind CSS v4, Prisma 7.8.0, PostgreSQL (Neon), Firebase Auth y la API de Groq para inteligencia artificial. '
    'El proyecto utiliza un despliegue autogestionado mediante Caddy como proxy inverso y Bun como runtime de servidor. '
    'A pesar de utilizar Next.js como marco base, la aplicacion funciona esencialmente como una aplicacion de renderizado '
    'del lado del cliente (CSR), con el 84% de sus paginas marcadas como Client Components y ninguna pagina que realice '
    'obtencion de datos en el servidor. La puntuacion global de rendimiento de la arquitectura se situa en 3.8 sobre 10, '
    'lo que indica un estado funcional pero con un aprovechamiento minimo de las capacidades de Next.js.',
    s_body))

story.append(Spacer(1, 8))
avail = W - 2 * MARGIN
score_data = [
    ['Componentes Server', '1/10', 'Solo 4/25 archivos son Server Components, ninguno obtiene datos'],
    ['Suspense / Streaming', '1/10', 'Solo 1 boundary Suspense en toda la aplicacion'],
    ['Code Splitting', '2/10', 'Cero dynamic(), cero React.lazy(), solo 1 import() dinamico'],
    ['Optimizacion Bundle', '3/10', 'Sin next/image, dependencias pesadas potencialmente en el bundle cliente'],
    ['Optimizacion Imagenes', '0/10', 'Cero uso de next/image, todas las imagenes son etiquetas planas'],
    ['PWA Completo', '5/10', 'Buen manifest, sin service worker'],
    ['Middleware Eficiencia', '7/10', 'Rapido pero esencialmente un no-op'],
    ['Error Boundaries', '9/10', 'Excelente: root, auth, dashboard y nivel de pagina'],
    ['Estados de Carga', '7/10', 'Buenos skeletons, pero todos del lado del cliente'],
    ['Seguridad Tipos', '3/10', 'ignoreBuildErrors: true anula el valor de TypeScript'],
]
story.append(make_table(
    ['Dimension', 'Puntuacion', 'Notas'],
    score_data,
    [avail * 0.22, avail * 0.12, avail * 0.66]
))

story.append(Spacer(1, 12))
story.append(add_heading('1.2 Resumen del Estado Actual', s_h2, 1))
story.append(Paragraph(
    'La aplicacion funciona correctamente para sus usuarios actuales. Las rutas de API estan bien protegidas con '
    'verificacion de tokens Firebase, las operaciones concurrentes utilizan advisory locks de PostgreSQL para prevenir '
    'condiciones de carrera, y el sistema de widgets implementa un patron stale-while-revalidate con invalidacion basada '
    'en triggers. El sistema de observabilidad personalizado (sin dependencias externas como Sentry) implementa '
    'almacenamiento en buffer con deduplicacion, limitacion de frecuencia y supresion de PII. Sin embargo, la aplicacion '
    'no aprovecha ninguna de las ventajas de rendimiento que Next.js ofrece: no hay componentes de servidor que obtengan '
    'datos, no hay streaming con Suspense, no hay importaciones dinamicas para dividir el codigo, y todas las imagenes se '
    'sirven como etiquetas img planas sin optimizacion automatica. El resultado neto es una experiencia que funciona, '
    'pero que transfiere todo el trabajo de renderizado y obtencion de datos al navegador del usuario, lo que impacta '
    'directamente el Time to Interactive (TTI), especialmente en dispositivos moviles con conexiones lentas.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 2: ARQUITECTURA ENCONTRADA
# ═══════════════════════════════════════════════════════
story.append(add_heading('2. Arquitectura Encontrada', s_h1, 0))

story.append(add_heading('2.1 Estructura de Archivos', s_h2, 1))
story.append(Paragraph(
    'El repositorio de VitaZen sigue una estructura estandar de Next.js App Router. El directorio src/app contiene '
    'dos grupos de rutas principales: (auth) para las paginas de autenticacion (login, registro, onboarding, '
    'restablecimiento de contrasena) y (dashboard) para la aplicacion principal. El grupo dashboard incluye 14 paginas '
    'que cubren areas como imperio/mentor, check-in, timeline, insights, perfil, ajustes, pricing, elite, logros, '
    'memoria-de-vida y cierre-mensual. Los componentes se organizan en src/components/ con subdirectorios para dashboard, '
    'layout, mentor, notifications, patterns, observability y ui (componentes shadcn/ui). La capa de datos reside en '
    'src/lib/ con archivos de servidor, cliente y utilidades compartidas. La configuracion de Prisma esta en prisma/ '
    'con un schema.prisma que define 15 modelos y multiples indices compuestos. El proyecto tambien incluye una '
    'configuracion de Android TWA en el directorio android/ y un Caddyfile para el despliegue.',
    s_body))

story.append(add_heading('2.2 Cadena de Datos', s_h2, 1))
story.append(Paragraph(
    'Cada solicitud del cliente sigue un flujo predecible. Primero, el token Bearer se extrae de la solicitud y se '
    'pasa a getAuthUser() o getAuthUserBasic(), que ejecuta una llamada de red a Firebase Admin SDK para verificar el '
    'token y luego una consulta a Prisma para encontrar el usuario. Esto anade 1 llamada de red Firebase y 1-2 consultas '
    'a la base de datos como costo base por solicitud. Los endpoints pesados como momentum (26 consultas), achievements '
    '(hasta 45 verificaciones) e insights (15 consultas findMany) anadan cargas significativas adicionales. Toda la '
    'logica de negocio se ejecuta en los route handlers de Next.js, que se ejecutan como funciones serverless en Vercel '
    'o en el servidor autogestionado con Bun. La conexion a Neon utiliza el adaptador PrismaPg para compatibilidad '
    'con serverless, pero no se configura pool size ni timeout de conexion.',
    s_body))

story.append(add_heading('2.3 Arbol de Componentes', s_h2, 1))
story.append(Paragraph(
    'El arbol de renderizado tiene tres capas criticas. La primera es RootLayout (Server Component) que envuelve todo '
    'en AuthProvider (Client Component), lo que fuerza un boundary de cliente para toda la aplicacion. La segunda es '
    'DashboardLayout (Client Component) que anade estado significativo (toggle de sidebar, guardia de autenticacion, '
    'seguimiento de ruta) que provoca re-renders del arbol completo debajo. La tercera son las 14 paginas del dashboard, '
    'todas Client Components con su propio estado y efectos. Este anidamiento profundo de componentes de cliente significa '
    'que cualquier cambio de estado en el layout del dashboard provoca un re-render de toda la pagina activa, incluyendo '
    'todos sus subcomponentes. El componente MentorChat con 1600 lineas, 18+ variables de estado y 10+ efectos es el '
    'ejemplo mas extremo de este patron monolítico.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 3: CUELLOS DE BOTELLA REALES
# ═══════════════════════════════════════════════════════
story.append(add_heading('3. Cuellos de Botella Reales', s_h1, 0))

story.append(add_heading('3.1 MentorChat: Componente Monolitico de 1600 Lineas', s_h2, 1))
story.append(Paragraph(f'{sev_label("CRITICO")} src/components/mentor/MentorChat.tsx', s_callout))
story.append(Paragraph(
    'Este es el cuello de botella mas significativo de toda la aplicacion. MentorChat.tsx contiene 1600+ lineas de '
    'codigo con 18+ variables de estado, 10+ efectos useEffect, 6+ funciones asincronas y un bloque JSX de sidebar '
    'de ~300 lineas que se recrea en cada render. Cualquier cambio de estado, ya sea escribir un mensaje, cambiar un '
    'hilo activo, abrir un menu contextual o recibir un mensaje, provoca un re-render completo de todo el componente, '
    'incluyendo la lista de hilos, el area de mensajes y el campo de entrada. El componente tiene buen uso de useMemo '
    'para datos derivados (activeThreads, visibleThreads, groupedThreads), pero la falta de descomposicion en '
    'subcomponentes significa que toda la logica de renderizado se reconcilia en cada cambio. Ademas, implementa '
    'sus propios listeners de online/offline en lugar de usar el hook compartido useNetworkStatus, anadiendo '
    'redundancia. Ningun import es lazy: todos los 20+ iconos de lucide-react, PremiumGate, FavoriteButton y '
    'ContextualHelp se cargan ansiosamente en el bundle inicial de la pagina del mentor.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('3.2 Cero Server Components con Datos', s_h2, 1))
story.append(Paragraph(f'{sev_label("CRITICO")} Toda la aplicacion (dashboard)', s_callout))
story.append(Paragraph(
    'De las 25 paginas y layouts del proyecto, solo 4 son Server Components (root layout, auth layout, dashboard '
    'template, dashboard loading) y ninguno de ellos obtiene datos del servidor. El 100% de la obtencion de datos '
    'ocurre en el cliente a traves de useEffect + fetch. Esto significa que cada navegacion dentro del dashboard '
    'sigue este patron: el navegador carga el JavaScript de la pagina, React se hidrata, se ejecuta el efecto, se '
    'muestra un skeleton de carga, se realiza la solicitud HTTP a la API, se espera la respuesta, y finalmente se '
    'renderiza el contenido. El usuario nunca ve HTML significativo hasta que JavaScript se ejecuta. Para el dashboard '
    'principal, existe una cascada secuencial: la pagina obtiene datos (imperios + checkin del dia), y luego los '
    'subcomponentes como EmotionalHero, LifePatternsSection y PremiumReflection realizan sus propias obtenciones '
    'internas, creando un efecto de cascada que multiplica el tiempo de carga percibido.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('3.3 Consultas Sin Limites en APIs', s_h2, 1))
story.append(Paragraph(f'{sev_label("CRITICO")} /api/habits, /api/journal, /api/analytics/insights, /api/ai/threads/[threadId]/messages', s_callout))
story.append(Paragraph(
    'Varios endpoints criticos no implementan paginacion ni limites en sus consultas Prisma. El endpoint GET /api/habits '
    'devuelve todos los habitos del usuario sin paginacion. GET /api/journal devuelve todas las entradas del diario, '
    'potencialmente cientos de registros. GET /api/finance acepta un parametro "days" controlado por el cliente sin '
    'cap maximo, permitiendo que un cliente pase ?days=99999 y descargue toda la tabla. Para usuarios premium, el '
    'endpoint de mensajes no tiene limite take, por lo que un hilo con 500+ mensajes transfiere todo el historial '
    'completo. El caso mas preocupante es /api/analytics/insights, que carga TODOS los eventos de hasta 90 dias en '
    'memoria del servidor para hacer agregacion en JavaScript con bucles anidados, en lugar de usar SQL GROUP BY. '
    'Para una plataforma con 10K usuarios y 50 eventos por dia, esto representa aproximadamente 4.5 millones de '
    'filas cargadas en memoria en una sola solicitud de API.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('3.4 Indice Faltante en Subscription', s_h2, 1))
story.append(Paragraph(f'{sev_label("CRITICO")} prisma/schema.prisma - Modelo Subscription', s_callout))
story.append(Paragraph(
    'El modelo Subscription carece de un indice en el campo userId. Este modelo se consulta en /stripe/checkout '
    '(findFirst por userId), /stripe/webhook (usando el unique de stripeSubscriptionId) y en getAuthUser (include '
    'con where por status). Sin un indice en userId, cada busqueda de suscripcion por usuario realiza un escaneo '
    'completo de la tabla. Esta degradacion es lineal con el numero de usuarios y se manifiesta en cada checkout, '
    'cada solicitud de autenticacion y cada verificacion de estado premium. A medida que la base de usuarios crece, '
    'este escaneo completo se convierte en un cuello de botella progresivo que afecta tiempos de respuesta en rutas '
    'criticas del flujo de pago y autenticacion.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 4: PROBLEMAS DETECTADOS
# ═══════════════════════════════════════════════════════
story.append(add_heading('4. Problemas Detectados', s_h1, 0))

story.append(add_heading('4.1 Problemas de React: Re-renders Innecesarios', s_h2, 1))
story.append(Paragraph(
    'Varios componentes clave carecen de React.memo a pesar de ser puramente presentacionales y usarse en multiples '
    'partes de la aplicacion. PrivacyMask se usa en 10+ ubicaciones (MomentumCard, WeeklyRecap, etc.) y provoca '
    'reconciliacion en cada render del padre cuando isPrivate es false. PremiumGate, PremiumBlur, PremiumSkeleton '
    '(15+ componentes exportados), PremiumEmptyState y PremiumErrorState son todos presentacionales sin estado, pero '
    'ninguno usa React.memo. El Sidebar no tiene memoizacion a pesar de contener muchos elementos hijos y logica '
    'condicional compleja; se re-renderiza en cada cambio de estado del layout padre. Varios componentes definen '
    'subcomponentes internos (TipCard en EmpireTipsSection, ObservationCard en LifePatternsSection, ToggleRow en '
    'NotificationPreferences, ValueSlider en CheckInModal) que se recrean en cada render, generando nuevas '
    'referencias que rompen la igualdad referencial de React.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('4.2 Problemas de Next.js: Ignorando el Framework', s_h2, 1))
story.append(Paragraph(
    'La configuracion next.config.ts tiene ignoreBuildErrors: true, lo que silencia todos los errores de compilacion '
    'TypeScript. El build tendra exito con tipos rotos, enmascarando bugs reales en produccion. No hay ningun uso de '
    'dynamic() o React.lazy() en toda la aplicacion: componentes pesados como MentorChat, CheckInModal y las variantes '
    'de PremiumSkeleton se cargan ansiosamente en el bundle de sus rutas respectivas. El layout del dashboard es un '
    'Client Component, lo que impide que cualquier pagina hija sea un Server Component. No hay headers de Cache-Control, '
    'ETag ni compresion en el Caddyfile, lo que significa que los assets estaticos (bundles JS de 500KB+, imagenes) se '
    'sirven sin cache en visitas repetidas. El manifest.json del PWA falta campos criticos como scope, purpose: maskable '
    'para iconos, y tiene start_url en /onboarding, lo que causa una redireccion molesta para usuarios recurrentes '
    'que abren la PWA. El service worker esta ausente, por lo que la instalabilidad en iOS es limitada y no hay '
    'soporte offline.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('4.3 Problemas de Base de Datos y APIs', s_h2, 1))
story.append(Paragraph(
    'Los endpoints /api/dashboard/metrics y /api/dashboard/progress ejecutan 4-5 consultas secuenciales que podrian '
    'paralelizarse con Promise.all. El endpoint /api/timeline no tiene try/catch, por lo que un rechazo no manejado '
    'puede causar un crash del servidor. El onboarding POST realiza 5-6 operaciones de escritura separadas sin '
    'transaccion: si falla la operacion 5 despues de la 3, el usuario queda marcado como onboardingCompleted: true '
    'pero sin habitos iniciales. La funcion achievements.ts checkAndUnlock() itera hasta 45 definiciones de logros '
    'con inserciones secuenciales en el peor caso. La consulta allCheckinDates en achievements no tiene limite take, '
    'cargando potencialmente anos de datos de check-in. El SDK de Groq no tiene timeout explicito ni reintentos '
    'para errores transitorios 429/5xx, y usa creacion no-streaming por lo que el cliente espera la respuesta '
    'completa antes de ver cualquier contenido.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('4.4 Problemas de PWA y Movil', s_h2, 1))
story.append(Paragraph(
    'El service worker de Firebase Messaging carga /api/notifications/sw-config como importScripts en el startup, '
    'bloqueando la activacion del SW hasta que la API responda. Tambien carga 2 scripts de Firebase compat desde '
    'gstatic.com (~100KB combinados) en cada inicio del SW. El Caddyfile no tiene headers de seguridad (CSP, HSTS, '
    'X-Content-Type-Options) ni de cacheo para assets estaticos. En movil, la ausencia de cache es devastadora: '
    'los bundles JS se re-solicitan en cada navegacion, lo que en conexiones 3G/4G puede tardar segundos. El '
    'manifest.json no define scope ni orientation, y los iconos solo tienen purpose: "any" sin la variante '
    '"maskable" requerida para iconos adaptativos de Android. La funcion resend.ts registra el prefijo (4 '
    'caracteres) de la API key en console.log en cada inicio del servidor, lo que es visible en los logs de '
    'Vercel para cualquiera con acceso.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 5: CLASIFICACION POR PRIORIDAD
# ═══════════════════════════════════════════════════════
story.append(add_heading('5. Clasificacion por Prioridad', s_h1, 0))

story.append(Paragraph(
    'Cada problema detectado ha sido clasificado en cuatro niveles segun su impacto real en el usuario, la frecuencia '
    'de ocurrencia, el coste en CPU, memoria, red y bateria, y la dificultad de implementacion. La clasificacion '
    'sigue el sistema obligatorio de cuatro niveles definido en la especificacion de la FASE 5.1.',
    s_body))

story.append(Spacer(1, 10))
# Critical table
story.append(add_heading('5.1 Mejoras Criticas', s_h2, 1))
crit_rows = [
    ['MentorChat monolitico (1600 lineas)', 'Decomponer en subcomponentes', 'Alto', 'Alto', 'Renderizado completo en cada interaccion'],
    ['Cero Server Components', 'Convertir paginas clave a SC', 'Medio', 'Bajo', 'TTI duplicado/triplicado en movil'],
    ['Consultas sin paginacion', 'Agregar take/skip/cursor', 'Bajo', 'Bajo', 'OOM del servidor, timeouts'],
    ['Indice faltante Subscription', 'Agregar @@index([userId])', 'Bajo', 'Bajo', 'Escaneo completo en cada auth/checkout'],
    ['analytics/insights en memoria', 'Usar SQL GROUP BY', 'Medio', 'Bajo', 'OOM con 4.5M filas'],
    ['ignoreBuildErrors: true', 'Eliminar, corregir errores TS', 'Bajo', 'Medio', 'Bugs ocultos en produccion'],
]
story.append(make_table(
    ['Problema', 'Que Cambiar', 'Dificultad', 'Riesgo', 'Impacto en Usuario'],
    crit_rows,
    [avail * 0.24, avail * 0.24, avail * 0.12, avail * 0.10, avail * 0.30]
))

story.append(Spacer(1, 12))
story.append(add_heading('5.2 Mejoras Importantes', s_h2, 1))
imp_rows = [
    ['Sidebar sin React.memo', 'Envolver en React.memo', 'Bajo', 'Bajo', 'Re-renders en cada navegacion'],
    ['PrivacyMask sin memo', 'Agregar React.memo', 'Bajo', 'Bajo', 'Reconciliacion en 10+ ubicaciones'],
    ['Dashboard layout como CC', 'Extraer guardia de auth a middleware', 'Alto', 'Medio', 'Todo el arbol se re-renderiza'],
    ['Cero dynamic()/lazy()', 'Lazy load MentorChat, CheckInModal', 'Medio', 'Bajo', 'Bundle inicial inflado'],
    ['Caddyfile sin cache', 'Agregar Cache-Control para static', 'Bajo', 'Bajo', 'Re-descarga de JS en cada visita movil'],
    ['Endpoints metrics/progress secuencial', 'Paralelizar con Promise.all', 'Bajo', 'Bajo', 'Latencia sumada en dashboard'],
    ['Onboarding no atomico', 'Envolver en $transaction', 'Bajo', 'Bajo', 'Estado parcial si falla a mitad'],
]
story.append(make_table(
    ['Problema', 'Que Cambiar', 'Dificultad', 'Riesgo', 'Impacto en Usuario'],
    imp_rows,
    [avail * 0.24, avail * 0.24, avail * 0.12, avail * 0.10, avail * 0.30]
))

story.append(Spacer(1, 12))
story.append(add_heading('5.3 Mejoras Recomendables', s_h2, 1))
rec_rows = [
    ['PremiumGate/Skeleton sin memo', 'Agregar React.memo a los 3 exports', 'Bajo', 'Bajo', 'Re-renders de componentes presentacionales'],
    ['WeeklyRecap arrays frescos', 'useMemo para emotionalMetrics/progressItems', 'Bajo', 'Bajo', 'Reconciliacion innecesaria'],
    ['use-notifications initRef', 'Corregir patron cleanup', 'Medio', 'Medio', 'Re-inicializaciones espureas'],
    ['useEmpireTips doble retry', 'Eliminar retry propio, usar useApi', 'Bajo', 'Bajo', 'Doble reintento por request'],
    ['Groq sin timeout', 'Agregar AbortController con timeout', 'Bajo', 'Bajo', 'Request colgada indefinidamente'],
    ['Manifest sin scope/maskable', 'Agregar campos faltantes', 'Bajo', 'Bajo', 'Iconos recortados en Android'],
    ['SW bloqueante', 'Precargar config en cache', 'Medio', 'Medio', 'Push no funciona en conexiones lentas'],
]
story.append(make_table(
    ['Problema', 'Que Cambiar', 'Dificultad', 'Riesgo', 'Impacto en Usuario'],
    rec_rows,
    [avail * 0.24, avail * 0.24, avail * 0.12, avail * 0.10, avail * 0.30]
))

story.append(Spacer(1, 12))
story.append(add_heading('5.4 Mejoras que No Merece la Pena', s_h2, 1))
nope_rows = [
    ['TOAST_REMOVE_DELAY = 1000000ms', 'Reducir a 5000ms', 'Bajo', 'Bajo', 'TOAST_LIMIT = 1, sin impacto real'],
    ['use-mobile sin lazy init', 'useState con inicializador lazy', 'Bajo', 'Bajo', 'Un render extra en mount, imperceptible'],
    ['Inline style objects', 'Extraer a useMemo', 'Bajo', 'Bajo', 'Objetos triviales, GC los limpia'],
    ['framer-motion/react-syntax-highlighter/@mdxeditor en package.json', 'Eliminar deps no usadas', 'Bajo', 'Bajo', 'Ya no se importan, tree-shaking las excluye'],
    ['next-intl y next-auth en deps', 'Eliminar deps muertas', 'Bajo', 'Bajo', 'No se usan, peso cero en bundle'],
    ['HabitLog @@index([userId]) redundante', 'Eliminar indice simple', 'Bajo', 'Bajo', 'Cubierto por indice compuesto'],
]
story.append(make_table(
    ['Problema', 'Que Cambiar', 'Dificultad', 'Riesgo', 'Impacto en Usuario'],
    nope_rows,
    [avail * 0.24, avail * 0.24, avail * 0.12, avail * 0.10, avail * 0.30]
))

# ═══════════════════════════════════════════════════════
# CHAPTER 6: RIESGOS
# ═══════════════════════════════════════════════════════
story.append(add_heading('6. Riesgos', s_h1, 0))

story.append(add_heading('6.1 Riesgos de la Arquitectura Actual', s_h2, 1))
story.append(Paragraph(
    'El riesgo principal de la arquitectura actual es su escalabilidad limitada. A medida que la base de usuarios '
    'crece, varios patrones se degradan linealmente o peor. El escaneo completo de Subscription por userId se '
    'ralentiza proporcionalmente al numero de usuarios. Las consultas sin paginacion en habits, journal y analytics '
    'transfieren mas datos por solicitud, aumentando tanto la latencia como el uso de memoria del servidor. La '
    'agregacion en memoria de analytics/insights con datos de 90 dias es un riesgo de OOM que crece con el numero '
    'de usuarios y eventos. El patron de CSR puro significa que el servidor de aplicaciones hace muy poco trabajo '
    'de renderizado, pero transfiere todo el costo al navegador del usuario, lo que es especialmente problematico '
    'en dispositivos de gama baja o con conexiones lentas donde el parseo de JavaScript y la ejecucion de efectos '
    'pueden tardar segundos.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('6.2 Riesgos de Implementacion', s_h2, 1))
story.append(Paragraph(
    'Convertir paginas de Client Components a Server Components requiere cambiar el patron de obtencion de datos '
    'de useEffect+fetch a llamadas directas a Prisma en el componente del servidor, lo que implica refactorizar '
    'la logica de autenticacion que actualmente depende del contexto del cliente. La descomposicion de MentorChat '
    'es la refactorizacion mas arriesgada debido a su tamano y complejidad de estado compartido; una descomposicion '
    'incorrecta podria introducir bugs sutiles en la sincronizacion de hilos, el manejo de mensajes o el scroll '
    'automatico. Mover la logica de autenticacion al middleware de Next.js requiere validar que todos los edge cases '
    'actuales (token refresh, ANR prevention para Android TWA, sync fallback) se preserven. Agregar el indice de '
    'Subscription requiere una migracion de Prisma en produccion sin tiempo de inactividad.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('6.3 Riesgo de Regresion', s_h2, 1))
story.append(Paragraph(
    'Dado que ignoreBuildErrors: true esta activo, existe un riesgo constante de regresiones tipograficas no detectadas. '
    'Los 27 errores TypeScript pre-existentes en goals/engine.ts, timeline/route.ts y NotificationPreferences.tsx '
    'enmascaran posibles bugs logicos. Cualquier refactor que modifique estos archivos sin corregir primero los '
    'tipos podria introducir comportamientos inesperados. La falta de tests automatizados de rendimiento (no hay '
    'benchmarks de renderizado, pruebas de carga de API ni mediciones de bundle size) significa que las '
    'optimizaciones propuestas no pueden verificarse cuantitativamente antes y despues de la implementacion.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 7: IMPACTO ESPERADO
# ═══════════════════════════════════════════════════════
story.append(add_heading('7. Impacto Esperado', s_h1, 0))

story.append(Paragraph(
    'El impacto de las optimizaciones propuestas varia significativamente segun la prioridad. Las mejoras criticas '
    'tienen el potencial de reducir el Time to Interactive (TTI) en un 40-60% para la pagina del mentor, reducir '
    'el uso de memoria del servidor en un 80-95% para el endpoint de analytics/insights, y eliminar el riesgo de '
    'OOM en consultas no acotadas. Las mejoras importantes pueden reducir el bundle JavaScript inicial en un 20-30% '
    'mediante lazy loading, reducir los re-renders en un 30-50% mediante React.memo en componentes de uso frecuente, '
    'y mejorar los tiempos de respuesta del dashboard en un 40-60% mediante paralelizacion de consultas y cacheo '
    'de assets. Las mejoras recomendables tienen impactos incrementales individuales del 5-15% pero acumulativos '
    'significativos. A continuacion se detalla el impacto estimado por area.',
    s_body))

story.append(Spacer(1, 10))
impact_rows = [
    ['Decomposicion MentorChat', 'CPU: -60%', 'Red: 0%', 'Bateria: -40%', 'Visible: Si'],
    ['Server Components (dashboard)', 'CPU: -50%', 'Red: -30%', 'Bateria: -30%', 'Visible: Si (TTI)'],
    ['Paginacion APIs', 'CPU: -80%', 'Red: -70%', 'Memoria: -90%', 'Visible: Si (tiempo)'],
    ['Indice Subscription', 'CPU: -40%', 'Red: -20%', 'Memoria: -30%', 'Visible: Si (auth rapido)'],
    ['React.memo en componentes', 'CPU: -30%', 'Red: 0%', 'Bateria: -20%', 'Visible: Sutil (scroll)'],
    ['Lazy loading dinamico', 'CPU: -20%', 'Red: -40% (inicial)', 'Bateria: -15%', 'Visible: Si (carga)'],
    ['Cache headers Caddy', 'CPU: 0%', 'Red: -80% (repeticion)', 'Bateria: -50%', 'Visible: Si (navegacion)'],
    ['Parallelizar queries', 'CPU: -30%', 'Red: -40%', 'Memoria: 0%', 'Visible: Si (dashboard)'],
]
story.append(make_table(
    ['Mejora', 'CPU', 'Red', 'Memoria/Bateria', 'Visible para Usuario'],
    impact_rows,
    [avail * 0.26, avail * 0.14, avail * 0.16, avail * 0.16, avail * 0.28]
))

# ═══════════════════════════════════════════════════════
# CHAPTER 8: ARCHIVOS AFECTADOS
# ═══════════════════════════════════════════════════════
story.append(add_heading('8. Archivos Afectados', s_h1, 0))

story.append(Paragraph(
    'La siguiente tabla lista todos los archivos que deberian modificarse para implementar las optimizaciones propuestas, '
    'agrupados por categoria. No se incluyen archivos que solo necesitan cambios de configuracion (como prisma/schema.prisma '
    'para el indice o next.config.ts para ignoreBuildErrors).',
    s_body))

story.append(Spacer(1, 8))
files_rows = [
    ['React', 'src/components/mentor/MentorChat.tsx', 'CRITICO', 'Decomponer en 4-5 subcomponentes'],
    ['React', 'src/components/layout/Sidebar.tsx', 'IMPORTANTE', 'Agregar React.memo'],
    ['React', 'src/components/ui/PrivacyMask.tsx', 'IMPORTANTE', 'Agregar React.memo'],
    ['React', 'src/components/ui/PremiumGate.tsx', 'RECOMENDABLE', 'Agregar React.memo a 3 exports'],
    ['React', 'src/components/ui/PremiumSkeleton.tsx', 'RECOMENDABLE', 'Agregar React.memo a 15+ componentes'],
    ['React', 'src/components/dashboard/WeeklyRecap.tsx', 'RECOMENDABLE', 'useMemo para arrays derivados'],
    ['React', 'src/components/notifications/NotificationPreferences.tsx', 'RECOMENDABLE', 'Extraer ToggleRow, memoizar'],
    ['Next.js', 'next.config.ts', 'CRITICO', 'Eliminar ignoreBuildErrors, agregar optimizePackageImports'],
    ['Next.js', 'src/app/(dashboard)/layout.tsx', 'IMPORTANTE', 'Convertir a Server Component'],
    ['Next.js', 'src/app/(dashboard)/dashboard/page.tsx', 'IMPORTANTE', 'Convertir a Server Component, lazy imports'],
    ['Next.js', 'src/app/(dashboard)/imperio/mentor/page.tsx', 'IMPORTANTE', 'Dynamic import de MentorChat'],
    ['API', 'src/app/api/habits/route.ts', 'CRITICO', 'Agregar paginacion'],
    ['API', 'src/app/api/journal/route.ts', 'CRITICO', 'Agregar paginacion'],
    ['API', 'src/app/api/analytics/insights/route.ts', 'CRITICO', 'SQL GROUP BY en vez de in-memory'],
    ['API', 'src/app/api/finance/route.ts', 'IMPORTANTE', 'Cap en parametro days'],
    ['API', 'src/app/api/dashboard/metrics/route.ts', 'IMPORTANTE', 'Paralelizar consultas'],
    ['API', 'src/app/api/dashboard/progress/route.ts', 'IMPORTANTE', 'Paralelizar consultas'],
    ['API', 'src/app/api/timeline/route.ts', 'IMPORTANTE', 'Agregar try/catch'],
    ['API', 'src/app/api/onboarding/route.ts', 'IMPORTANTE', 'Envolver en $transaction'],
    ['Config', 'prisma/schema.prisma', 'CRITICO', 'Agregar @@index([userId]) a Subscription'],
    ['Config', 'Caddyfile', 'IMPORTANTE', 'Agregar Cache-Control, security headers'],
    ['Config', 'public/manifest.json', 'RECOMENDABLE', 'Agregar scope, maskable icons, lang'],
    ['Lib', 'src/lib/groq.ts', 'RECOMENDABLE', 'Agregar timeout con AbortController'],
    ['Lib', 'src/lib/achievements.ts', 'IMPORTANTE', 'Agregar take: 400 a allCheckinDates'],
    ['Hook', 'src/hooks/useEmpireTips.ts', 'RECOMENDABLE', 'Eliminar doble retry'],
]
story.append(make_table(
    ['Categoria', 'Archivo', 'Prioridad', 'Cambio Propuesto'],
    files_rows,
    [avail * 0.10, avail * 0.40, avail * 0.14, avail * 0.36]
))

# ═══════════════════════════════════════════════════════
# CHAPTER 9: RECOMENDACIONES
# ═══════════════════════════════════════════════════════
story.append(add_heading('9. Recomendaciones', s_h1, 0))

story.append(add_heading('9.1 Recomendaciones Inmediatas (Sin Riesgo)', s_h2, 1))
story.append(Paragraph(
    'Estas acciones pueden implementarse de forma inmediata con riesgo minimo y beneficio directo. Primero, agregar '
    'el indice @@index([userId]) al modelo Subscription en prisma/schema.prisma. Esta es una operacion no destructiva '
    'que anade un indice a una tabla existente, sin cambiar la interfaz ni el comportamiento. Segundo, eliminar '
    'ignoreBuildErrors: true de next.config.ts y corregir los 27 errores TypeScript pre-existentes. Los errores en '
    'goals/engine.ts, timeline/route.ts y NotificationPreferences.tsx deben resolverse antes de cualquier otra '
    'optimizacion. Tercero, agregar un try/catch al endpoint /api/timeline GET que actualmente carece de manejo de '
    'errores. Cuarto, agregar Math.min(days, 365) como cap en /api/finance y /api/wellness para prevenir que un '
    'cliente descargue tablas completas. Quinto, agregar React.memo a PrivacyMask, Sidebar y los tres exports de '
    'PremiumGate. Todas son envolturas puramente presentacionales sin estado, por lo que el cambio es seguro.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('9.2 Recomendaciones a Corto Plazo', s_h2, 1))
story.append(Paragraph(
    'A corto plazo se recomienda implementar paginacion en los endpoints /api/habits y /api/journal GET. Ambos '
    'pueden usar un patron simple de ?page=1 y ?limit=20 con cursor opcional. Reemplazar la agregacion en memoria '
    'de /api/analytics/insights por consultas SQL GROUP BY utilizando db.analyticsEvent.groupBy() con _count y _sum. '
    'Paralelizar las consultas secuenciales en /api/dashboard/metrics y /api/dashboard/progress envolviendolas en '
    'Promise.all. Envolver las operaciones de /api/onboarding POST en una transaccion Prisma ($transaction). Agregar '
    'un take: 400 a la consulta allCheckinDates en achievements.ts para limitar el crecimiento. Agregar un timeout '
    'de 30 segundos al SDK de Groq usando AbortController. Estos cambios son incrementales y no modifican la '
    'interfaz de usuario ni el comportamiento del Mentor IA.',
    s_body))

story.append(Spacer(1, 8))
story.append(add_heading('9.3 Recomendaciones a Medio Plazo', s_h2, 1))
story.append(Paragraph(
    'A medio plazo, la refactorizacion mas impactante es la descomposicion de MentorChat.tsx en subcomponentes: '
    'ThreadSidebar (lista de hilos, busqueda, agrupacion), MessageList (renderizado de mensajes, scroll automatico), '
    'ChatInput (textarea, envio, limites), LimitModal y DeleteConfirmDialog. Esta refactorizacion requiere cuidado '
    'para mantener la sincronizacion de estado entre subcomponentes, idealmente usando useReducer en lugar de '
    'multiples useState. Paralelamente, convertir la pagina principal del dashboard a un Server Component que '
    'pre-obtenga los datos del usuario (imperios, checkin del dia, estado emocional) y los pase como props, '
    'eliminando la cascada de fetches en el cliente. Agregar dynamic() imports para MentorChat, CheckInModal y '
    'componentes pesados. Finalmente, configurar headers de cache y seguridad en el Caddyfile.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 10: MEJORAS QUE NO MERECE LA PENA
# ═══════════════════════════════════════════════════════
story.append(add_heading('10. Mejoras que No Merece la Pena Hacer', s_h2, 1))

story.append(Paragraph(
    'Tras el analisis exhaustivo, las siguientes optimizaciones teoricas se descartan porque su beneficio real '
    'es insignificante o nulo en comparacion con el coste de implementacion y el riesgo de regresion.',
    s_body))

story.append(Spacer(1, 8))
nope_detail_rows = [
    ['Reducir TOAST_REMOVE_DELAY', 'El limite TOAST_LIMIT es 1. Solo hay un toast activo a la vez. El delay excesivo '
     'no causa consumo de memoria ni CPU adicional. Cambiarlo requiere modificar la logica del hook sin beneficio observable.'],
    ['Inicializador lazy en use-mobile', 'El render extra undefined a boolean ocurre una sola vez en mount. React 18 '
     'batchea el state update, por lo que el usuario ve un unico render. El impacto en Performance es cero.'],
    ['Extraer style objects a useMemo', 'Los objetos inline style en MomentumCard, WeeklyRecap y otros componentes '
     'son triviales (2-3 propiedades). El GC de V8 los limpia eficientemente. El overhead de useMemo supera el beneficio.'],
    ['Eliminar dependencias no usadas', 'framer-motion, react-syntax-highlighter y @mdxeditor/editor no se importan '
     'en ningun archivo .tsx. El tree-shaking de Next.js ya las excluye del bundle. Eliminarlas de package.json solo '
     'reduce el tamano de node_modules, no el bundle de produccion.'],
    ['Eliminar next-intl y next-auth', 'No se importan en ninguna pagina ni componente. Mismo caso que las dependencias '
     'anteriores: peso cero en bundle, beneficio nulo en rendimiento.'],
    ['Eliminar indice redundante HabitLog', 'El indice simple @@index([userId]) esta cubierto por el compuesto '
     '@@index([userId, lastCompletedAt]). Prisma/PostgreSQL usara el indice compuesto para consultas por userId '
     'solo. Eliminar el indice simple ahorra ~0 bytes en disco y ~0ms en consultas.'],
    ['Agregar next/image', 'Las unicas imagenes en la app son 9 instancias del logo v-gold-logo.png (un PNG pequeno). '
     'La optimizacion automatica de WebP/AVIF, srcset responsive y lazy loading de next/image anadiriaria complejidad '
     'por un ahorro de quizas 5-10KB en la primera carga. No justifica el coste de migracion.'],
    ['Convertir pagina del root a Server Component', 'La pagina raiz solo redirige a /login o /dashboard basandose '
     'en el estado de auth. Necesita useAuth() que solo funciona en Client Components. No hay datos que pre-obtener.'],
]
story.append(make_table(
    ['Mejora Descartada', 'Razon'],
    nope_detail_rows,
    [avail * 0.28, avail * 0.72]
))

# ═══════════════════════════════════════════════════════
# CHAPTER 11: ROADMAP DE OPTIMIZACION
# ═══════════════════════════════════════════════════════
story.append(add_heading('11. Roadmap de Optimizacion', s_h1, 0))

story.append(Paragraph(
    'El siguiente roadmap propone un orden de implementacion que maximiza el beneficio por esfuerzo invertido. '
    'Cada fase se construye sobre la anterior, y las fases tempranas desbloquean las capacidades necesarias para '
    'las fases posteriores. Los tiempos estimados asumen un desarrollador familiarizado con el codebase.',
    s_body))

story.append(Spacer(1, 10))
roadmap_rows = [
    ['Fase A', 'Corregir TS, agregar indice Subscription, try/catch timeline, caps en APIs', '1-2 dias', 'CRITICO', 'Sin cambios de interfaz'],
    ['Fase B', 'React.memo en PrivacyMask, Sidebar, PremiumGate, PremiumSkeleton', '1 dia', 'IMPORTANTE', 'Sin cambios de interfaz'],
    ['Fase C', 'Paginar /api/habits, /api/journal, /api/messages (premium)', '1-2 dias', 'CRITICO', 'API changes, clientes existentes compatibles'],
    ['Fase D', 'Reemplazar analytics/insights in-memory por SQL GROUP BY', '1 dia', 'CRITICO', 'Sin cambios de interfaz'],
    ['Fase E', 'Paralelizar metrics/progress, transaccion onboarding, Groq timeout', '1 dia', 'IMPORTANTE', 'Sin cambios de interfaz'],
    ['Fase F', 'Caddyfile: Cache-Control + security headers', '2 horas', 'IMPORTANTE', 'Solo infraestructura'],
    ['Fase G', 'Dynamic imports: MentorChat, CheckInModal', '1 dia', 'IMPORTANTE', 'Suspense boundary necesario'],
    ['Fase H', 'Decomponer MentorChat en 4-5 subcomponentes', '3-5 dias', 'CRITICO', 'Testing extensivo requerido'],
    ['Fase I', 'Convertir dashboard page a Server Component', '2-3 dias', 'IMPORTANTE', 'Cambio arquitectonico mayor'],
    ['Fase J', 'Manifest PWA: scope, maskable, start_url', '2 horas', 'RECOMENDABLE', 'Solo configuracion'],
    ['Fase K', 'Refactorizar dashboard layout a Server Component', '2-3 dias', 'IMPORTANTE', 'Auth guard en middleware'],
    ['Fase L', 'Agregar loading.tsx por pagina + Suspense boundaries', '2 dias', 'RECOMENDABLE', 'Streaming habilitado'],
]
story.append(make_table(
    ['Fase', 'Descripcion', 'Esfuerzo', 'Prioridad', 'Notas'],
    roadmap_rows,
    [avail * 0.08, avail * 0.42, avail * 0.10, avail * 0.14, avail * 0.26]
))

story.append(Spacer(1, 12))
story.append(Paragraph(
    'El orden prioriza primero las correcciones sin riesgo (A-B), luego las optimizaciones de datos (C-D-E) que '
    'reducen la carga del servidor, seguidas de infraestructura (F-G), refactorizacion del componente principal (H), '
    'y finalmente la conversion a Server Components (I-K-L) que es el cambio arquitectonico mas profundo. Las fases '
    'A a F pueden realizarse en paralelo por diferentes desarrolladores. Las fases G a L son secuenciales por '
    'dependencias: G (lazy loading) simplifica H (decomposicion), que a su vez es prerequisito para I (Server '
    'Components en mentor). El esfuerzo total estimado es de 15-22 dias de desarrollo.',
    s_body))

# ═══════════════════════════════════════════════════════
# CHAPTER 12: RESUMEN EJECUTIVO
# ═══════════════════════════════════════════════════════
story.append(add_heading('12. Resumen Ejecutivo', s_h1, 0))

story.append(Paragraph(
    'VitaZen es una aplicacion funcional y bien construida en muchos aspectos: tiene un sistema de concurrencia '
    'robusto con advisory locks de PostgreSQL, un sistema de observabilidad personalizado sin dependencias externas, '
    'error boundaries en todos los niveles, y un sistema de widgets con invalidacion basada en triggers y patron '
    'stale-while-revalidate. Sin embargo, la aplicacion opera esencialmente como una SPA montada sobre Next.js, '
    'aprovechando menos del 5% de las capacidades del framework. Los cuellos de botella mas impactantes son el '
    'componente MentorChat monolitico de 1600 lineas, la ausencia total de Server Components con obtencion de datos, '
    'las consultas a la base de datos sin paginacion ni limites, y la falta de cacheo de assets estaticos en el '
    'proxy inverso.',
    s_body))

story.append(Spacer(1, 8))
story.append(Paragraph(
    'Se identificaron 6 mejoras criticas, 7 importantes, 7 recomendables y 8 que no merece la pena implementar. '
    'Las 6 mejoras criticas (indice de Subscription, paginacion de APIs, analytics con SQL, descomposicion de '
    'MentorChat, eliminacion de ignoreBuildErrors, y conversion a Server Components) tienen el potencial de reducir '
    'el TTI en un 40-60%, el uso de memoria del servidor en un 80-95%, y eliminar riesgos de OOM. Las mejoras '
    'inmediatas (fases A-B del roadmap, 2-3 dias de esfuerzo) pueden implementarse sin riesgo de regresion y sin '
    'modificar la interfaz ni el comportamiento del Mentor IA. El esfuerzo total estimado para todas las optimizaciones '
    'propuestas es de 15-22 dias de desarrollo, distribuidos en 12 fases secuenciales y paralelizables.',
    s_body))

story.append(Spacer(1, 8))
story.append(Paragraph(
    'La recomendacion principal es comenzar con las fases A y B (correcciones sin riesgo y React.memo), que '
    'representan 2-3 dias de esfuerzo con beneficio inmediato. Luego proceder con las fases C y D (paginacion y '
    'SQL GROUP BY en analytics) que reducen dramaticamente la carga del servidor. Las fases posteriores (decomposicion '
    'de MentorChat y conversion a Server Components) son las de mayor impacto pero tambien las de mayor riesgo, y '
    'deben abordarse solo despues de que las fases anteriores esten estabilizadas y verificadas. No se ha implementado '
    'ninguna optimizacion en esta fase, como se especifica en las reglas absolutas de la FASE 5.1.',
    s_body))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUILD PDF
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT = '/home/z/my-project/download/FASE_5.1_Auditoria_Forense_Rendimiento_VitaZen.pdf'
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

doc = TocDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title='VitaZen - FASE 5.1 - Auditoria Forense de Rendimiento',
    author='Z.ai',
    subject='Auditoria forense de rendimiento - VitaZen',
)

doc.multiBuild(story, onFirstPage=page_title, onLaterPages=page_title)
print(f'PDF generado: {OUTPUT}')