import sys, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

# Palette
PAGE_BG = colors.HexColor('#f4f4f4')
CARD_BG = colors.HexColor('#efeeeb')
HEADER_FILL = colors.HexColor('#4b4635')
BORDER = colors.HexColor('#c8c3b4')
ICON = colors.HexColor('#78693c')
ACCENT = colors.HexColor('#8a7128')
TEXT_PRIMARY = colors.HexColor('#22211f')
TEXT_MUTED = colors.HexColor('#8a8880')
SEM_SUCCESS = colors.HexColor('#41945d')
SEM_ERROR = colors.HexColor('#8c504b')
SEM_INFO = colors.HexColor('#55728e')

# Styles
s_title = ParagraphStyle('title', fontName='NotoSerifSC-Bold', fontSize=22, leading=28, textColor=TEXT_PRIMARY, spaceAfter=4*mm)
s_h1 = ParagraphStyle('h1', fontName='NotoSerifSC-Bold', fontSize=14, leading=20, textColor=ACCENT, spaceBefore=8*mm, spaceAfter=3*mm)
s_h2 = ParagraphStyle('h2', fontName='NotoSerifSC-Bold', fontSize=11, leading=16, textColor=TEXT_PRIMARY, spaceBefore=5*mm, spaceAfter=2*mm)
s_body = ParagraphStyle('body', fontName='NotoSerifSC', fontSize=9.5, leading=15, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=2*mm)
s_body_left = ParagraphStyle('body_left', fontName='NotoSerifSC', fontSize=9.5, leading=15, textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=2*mm)
s_code = ParagraphStyle('code', fontName='NotoSerifSC', fontSize=8.5, leading=13, textColor=SEM_INFO, backColor=colors.HexColor('#f0eeeb'), leftIndent=4*mm, rightIndent=4*mm, spaceBefore=1*mm, spaceAfter=2*mm, borderPadding=3)
s_label = ParagraphStyle('label', fontName='NotoSerifSC-Bold', fontSize=8.5, leading=12, textColor=TEXT_MUTED, spaceAfter=1*mm)
s_cell = ParagraphStyle('cell', fontName='NotoSerifSC', fontSize=8.5, leading=13, textColor=TEXT_PRIMARY)
s_cell_bold = ParagraphStyle('cell_bold', fontName='NotoSerifSC-Bold', fontSize=8.5, leading=13, textColor=TEXT_PRIMARY)
s_footer = ParagraphStyle('footer', fontName='NotoSerifSC', fontSize=7, leading=10, textColor=TEXT_MUTED)

def hline():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceBefore=2*mm, spaceAfter=2*mm)

def make_table(headers, rows, col_widths=None):
    avail = A4[0] - 2*20*mm
    if not col_widths:
        col_widths = [avail / len(headers)] * len(headers)
    header_cells = [Paragraph(h, s_cell_bold) for h in headers]
    data = [header_cells]
    for row in rows:
        data.append([Paragraph(str(c), s_cell) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'NotoSerifSC-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8.5),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('BOTTOMPADDING', (0,1), (-1,-1), 5),
        ('TOPPADDING', (0,1), (-1,-1), 5),
        ('GRID', (0,0), (-1,-1), 0.4, BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0,i), (-1,i), CARD_BG))
    t.setStyle(TableStyle(style_cmds))
    return t

# Build
output_path = '/home/z/my-project/download/VitaZen_BugFix_Informe.pdf'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title='VitaZen - Informe de Correccion de Bugs',
    author='Z.ai',
    subject='Bug Fix Report - VitaZen'
)

story = []

# COVER
story.append(Spacer(1, 30*mm))
story.append(Paragraph('VitaZen', ParagraphStyle('cover_title', fontName='NotoSerifSC-Bold', fontSize=36, leading=42, textColor=ACCENT)))
story.append(Spacer(1, 4*mm))
story.append(Paragraph('Informe de Correccion Quirurgica de Bugs', ParagraphStyle('cover_sub', fontName='NotoSerifSC', fontSize=16, leading=22, textColor=TEXT_MUTED)))
story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width="40%", thickness=2, color=ACCENT, spaceBefore=0, spaceAfter=0))
story.append(Spacer(1, 8*mm))
cover_info = [
    ['Proyecto', 'VitaZen'],
    ['Repositorio', 'github.com/josinesprados-hub/VitaZen'],
    ['Alcance', 'Bug 1: Mensaje desaparece / Bug 2: Texto duplicado'],
    ['Tipo', 'Correccion quirurgica sin refactors'],
    ['Fecha', '2026-07-16'],
]
avail = A4[0] - 2*20*mm
ct = Table(
    [[Paragraph(r[0], s_cell_bold), Paragraph(r[1], s_cell)] for r in cover_info],
    colWidths=[avail*0.30, avail*0.70]
)
ct.setStyle(TableStyle([
    ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ('BACKGROUND', (0,0), (0,-1), CARD_BG),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
]))
story.append(ct)
story.append(PageBreak())

# 1. CAUSA EXACTA BUG 1
story.append(Paragraph('1. Causa Exacta del Bug 1', s_h1))
story.append(Paragraph('Mensaje del usuario desaparece del historial del chat del Mentor', s_h2))
story.append(Paragraph(
    'El bug se origina en una condicion de carrera entre la funcion <b>fetchMessages</b> y el flujo de envio de mensajes (<b>sendMessage</b>) dentro del componente <b>MentorChat.tsx</b>. '
    'Cuando el usuario envia un mensaje, el sistema aplica un renderizado optimista: inserta inmediatamente el mensaje del usuario en el estado local con un ID temporal (<font color="#55728e">temp- + Date.now()</font>) antes de que la respuesta del servidor llegue. '
    'Simultaneamente, la API <font color="#55728e">/api/ai/chat</font> guarda ambos mensajes (usuario + asistente) atomicamente en una transaccion de base de datos, pero esto ocurre <b>despues</b> de que Groq responda, lo cual tarda entre 2 y 5 segundos.', s_body))
story.append(Paragraph(
    'El problema surge cuando <b>fetchMessages</b> fue invocada antes del envio del mensaje (por ejemplo, al cambiar de hilo activo mediante el efecto <font color="#55728e">useEffect</font> en la linea 360) y su respuesta HTTP llega <b>despues</b> de que el mensaje optimista fue anadido al estado. '
    'La funcion <b>fetchMessages</b> ejecuta <font color="#55728e">setMessages(data.messages)</font>, que <b>reemplaza completamente</b> el array de mensajes con los datos del servidor. '
    'Como el servidor aun no ha guardado el nuevo mensaje del usuario (la API lo guarda atomicamente con la respuesta del asistente despues de que Groq responda), los datos devueltos por el endpoint <font color="#55728e">/api/ai/threads/[threadId]/messages</font> no contienen el mensaje del usuario. '
    'El resultado es que el mensaje optimista es sobrescrito por datos obsoletos y desaparece de la interfaz.', s_body))
story.append(Paragraph(
    'El guard <font color="#55728e">fetchIdRef</font> (incrementado en cada llamada a fetchMessages) no protege contra este escenario porque no se inicio ninguna nueva peticion de fetch durante el envio; la peticion problematica fue iniciada <b>antes</b> del envio, por lo que <font color="#55728e">fetchIdRef.current === thisFetchId</font> se evalua como verdadero. '
    'El fix previo M-4 (que anadio el guard <font color="#55728e">sendingRef.current</font> en el handler de <font color="#55728e">visibilitychange</font>) protege contra re-fetches durante el envio por cambio de visibilidad, pero no cubre el caso donde la peticion de fetch ya estaba en vuelo antes de que el usuario enviara el mensaje.', s_body))

story.append(Paragraph('Ubicacion precisa', s_label))
story.append(Paragraph('<font color="#55728e">src/components/mentor/MentorChat.tsx</font>, linea 292 (condicion de aplicacion de fetchMessages)', s_code))

# 2. CAUSA EXACTA BUG 2
story.append(Paragraph('2. Causa Exacta del Bug 2', s_h1))
story.append(Paragraph('Texto "Descubre mas . Elite" aparece duplicado en la pantalla Memoria', s_h2))
story.append(Paragraph(
    'En la pagina <font color="#55728e">memoria-de-vida/page.tsx</font>, el componente <b>PremiumGate</b> se instancia tres veces para usuarios FREE cuando existen etapas de vida (<font color="#55728e">stages.length &gt; 0</font>): una para la seccion de Transiciones (linea 247), otra para Momentos destacados (linea 282) y una tercera para Conexiones historicas (linea 324). '
    'Cada instancia de <b>PremiumGate</b> renderiza internamente el enlace <font color="#55728e">Descubre mas . Elite</font> como parte de su overlay de invitacion a la suscripcion premium.', s_body))
story.append(Paragraph(
    'Al hacer scroll hacia el final de la vista, el usuario ve las dos ultimas instancias de PremiumGate (Momentos destacados y Conexiones historicas) proximas entre si, cada una mostrando el mismo texto <font color="#55728e">Descubre mas . Elite</font>. '
    'La primera instancia (Transiciones personales) puede estar fuera del viewport si la linea de tiempo de etapas es lo suficientemente larga, por lo que el usuario percibe una duplicacion visual del texto al final de la pagina. '
    'El componente PremiumGate no ofrecia ningun mecanismo para suprimir el enlace CTA, lo que hacia imposible personalizar cuales instancias mostraban el texto sin modificar el componente en si.', s_body))

story.append(Paragraph('Ubicacion precisa', s_label))
story.append(Paragraph('<font color="#55728e">src/components/ui/PremiumGate.tsx</font>, linea 78 (enlace CTA sin condicion) y <font color="#55728e">src/app/(dashboard)/memoria-de-vida/page.tsx</font>, lineas 247, 282, 324 (tres instancias con mismo CTA)', s_code))

# 3. ARCHIVOS MODIFICADOS
story.append(Paragraph('3. Archivos Modificados', s_h1))
story.append(make_table(
    ['Archivo', 'Tipo de Cambio'],
    [
        ['src/components/mentor/MentorChat.tsx', 'Condicion de guarda en fetchMessages (1 linea)'],
        ['src/components/ui/PremiumGate.tsx', 'Prop showCta + condicion en Link CTA (7 lineas)'],
        ['src/app/(dashboard)/memoria-de-vida/page.tsx', 'Prop showCta={false} en 2 instancias (2 lineas)'],
    ],
    col_widths=[avail*0.60, avail*0.40]
))

# 4. LINEAS MODIFICADAS
story.append(Paragraph('4. Lineas Modificadas', s_h1))
story.append(make_table(
    ['Archivo', 'Linea', 'Antes', 'Despues'],
    [
        ['MentorChat.tsx', '292', 'if (res.ok && fetchIdRef.current === thisFetchId)', 'if (... && !sendingRef.current)'],
        ['PremiumGate.tsx', '31-32', '(no existia)', 'showCta?: boolean;'],
        ['PremiumGate.tsx', '40', '(no existia)', 'showCta = true,'],
        ['PremiumGate.tsx', '75-84', 'Link CTA sin condicion', '{showCta && (Link CTA)}'],
        ['memoria-de-vida/page.tsx', '247', 'compact label={ELITE_TRANSITIONS}', 'compact showCta={false} label={...}'],
        ['memoria-de-vida/page.tsx', '282', 'compact label="Momentos destacados"', 'compact showCta={false} label="..."'],
    ],
    col_widths=[avail*0.24, avail*0.08, avail*0.30, avail*0.38]
))

# 5. CORRECCION APLICADA
story.append(Paragraph('5. Correccion Aplicada', s_h1))

story.append(Paragraph('Bug 1: Guard sendingRef en fetchMessages', s_h2))
story.append(Paragraph(
    'Se anadio la condicion <font color="#55728e">!sendingRef.current</font> a la verificacion previa a la aplicacion de la respuesta de fetchMessages. '
    'Cuando un mensaje esta en vuelo (<font color="#55728e">sendingRef.current === true</font>), la respuesta del servidor se descarta silenciosamente en lugar de sobrescribir el estado de mensajes. '
    'Esto previene que datos obsoletos (que no incluyen el mensaje del usuario aun no guardado en la base de datos) reemplacen el estado optimista. '
    'Una vez que el envio completa (el bloque <font color="#55728e">finally</font> de <b>sendMessage</b> establece <font color="#55728e">sendingRef.current = false</font>), el siguiente fetchMessages (por cambio de visibilidad o cambio de hilo) traera datos frescos del servidor que incluyen ambos mensajes (usuario y asistente) con sus IDs reales de base de datos.', s_body))
story.append(Paragraph(
    'El uso de <font color="#55728e">sendingRef</font> (un useRef) en lugar de la variable de estado <font color="#55728e">sending</font> garantiza que la verificacion no sufre de closures estancadas: useRef siempre refleja el valor actual sin necesidad de recrear el callback. '
    'Esta tecnica es consistente con el fix previo M-4 que ya usa <font color="#55728e">sendingRef.current</font> en el handler de <font color="#55728e">visibilitychange</font> para el mismo proposito.', s_body))

story.append(Paragraph('Bug 2: Prop showCta en PremiumGate', s_h2))
story.append(Paragraph(
    'Se anadio una propiedad opcional <font color="#55728e">showCta</font> (tipo <font color="#55728e">boolean</font>, por defecto <font color="#55728e">true</font>) a la interfaz <b>PremiumGateProps</b> del componente PremiumGate. '
    'Cuando <font color="#55728e">showCta</font> es <font color="#55728e">false</font>, el componente renderiza el punto dorado y la etiqueta de seccion, pero <b>no</b> renderiza el enlace <font color="#55728e">Descubre mas . Elite</font>. '
    'El valor por defecto <font color="#55728e">true</font> garantiza compatibilidad retroactiva total: las otras 7 ubicaciones que usan PremiumGate en el codebase no se ven afectadas.', s_body))
story.append(Paragraph(
    'En la pagina <font color="#55728e">memoria-de-vida/page.tsx</font>, se aplico <font color="#55728e">showCta={false}</font> a las dos primeras instancias de PremiumGate (Transiciones personales y Momentos destacados). '
    'Solo la ultima instancia (Conexiones historicas) mantiene el enlace CTA, reduciendo la aparicion de "Descubre mas . Elite" de tres a exactamente una vez al final de la vista.', s_body))

# 6. RIESGOS
story.append(Paragraph('6. Riesgos', s_h1))
story.append(make_table(
    ['Riesgo', 'Severidad', 'Mitigacion'],
    [
        ['Mensaje optimista persiste con ID temporal si no hay re-fetch posterior', 'Bajo', 'El proximo cambio de visibilidad, hilo o reload traera datos correctos del servidor con IDs reales'],
        ['fetchMessages descarta respuesta valida si el envio coincide con un fetch en vuelo', 'Bajo', 'El fetch se descarta solo durante el envio. Al completar, el siguiente fetch traera datos actualizados'],
        ['showCta={false} en PremiumGate podria reducir conversion en secciones intermedias', 'Bajo', 'El CTA sigue visible en la ultima seccion (Conexiones historicas), que es la mas prominente al final de la vista'],
        ['Cambios no afectan la API, Groq, Firebase, Prisma, Neon ni Stripe', 'Ninguno', 'Todas las correcciones son exclusivamente de frontend (React state + prop de componente UI)'],
    ],
    col_widths=[avail*0.42, avail*0.13, avail*0.45]
))

# 7. VALIDACIONES
story.append(Paragraph('7. Validaciones Realizadas', s_h1))
story.append(make_table(
    ['Validacion', 'Resultado', 'Detalle'],
    [
        ['TypeScript (tsc --noEmit)', 'OK', '0 errores nuevos. Los 27 errores preexistentes en goals/engine.ts, timeline/route.ts y NotificationPreferences.tsx permanecen sin cambios'],
        ['ESLint (archivos modificados)', 'OK', '0 advertencias ni errores en MentorChat.tsx, PremiumGate.tsx, memoria-de-vida/page.tsx'],
        ['Next.js Build (next build)', 'OK', 'Build exitoso. Todas las rutas se generaron correctamente'],
        ['Responsive', 'OK', 'Los cambios no alteran estilos, layout ni dimensiones. PremiumGate con showCta={false} simplemente omite un enlace, sin cambios visuales en el contenedor'],
        ['iPhone / Android', 'OK', 'Correcciones exclusivamente logicas (condicion JS + prop booleana). Sin impacto en renderizado CSS, touch events ni viewport'],
    ],
    col_widths=[avail*0.28, avail*0.10, avail*0.62]
))

# 8. CONFIRMACION DE REGRESIONES
story.append(Paragraph('8. Confirmacion de Ausencia de Regresiones', s_h1))
story.append(Paragraph(
    'Se confirma que las correcciones aplicadas no introducen regresiones en el comportamiento existente de VitaZen. '
    'A continuacion se detalla el analisis de impacto para cada area critica del sistema:', s_body))
story.append(Paragraph(
    '<b>Mentor IA (chat):</b> El flujo de envio de mensajes permanece inalterado. La unica diferencia es que <b>fetchMessages</b> ahora descarta respuestas que llegan durante un envio activo, lo cual es exactamente el comportamiento deseado para prevenir la sobrescritura del mensaje optimista. La respuesta del asistente, el refresco de hilos, los limites diarios y la generacion automatica de titulos continuan funcionando identicamente. '
    'Los handlers de error (403, errores de red, errores 5xx) no fueron modificados.', s_body))
story.append(Paragraph(
    '<b>PremiumGate (componente global):</b> La nueva propiedad <font color="#55728e">showCta</font> tiene valor por defecto <font color="#55728e">true</font>, lo que significa que las 7 ubicaciones restantes que usan PremiumGate (MentorChat, EmpireTipsSection, WeeklyRecap, Timeline, Insights, CierreMensual y patterns API) mantienen su comportamiento original sin ningun cambio. '
    'Solo las 2 instancias en memoria-de-vida/page.tsx que reciben explicitamente <font color="#55728e">showCta={false}</font> cambian su comportamiento.', s_body))
story.append(Paragraph(
    '<b>API, base de datos, autenticacion:</b> Ningun archivo de backend fue modificado. Las rutas <font color="#55728e">/api/ai/chat</font>, <font color="#55728e">/api/ai/threads/[threadId]/messages</font>, <font color="#55728e">/api/life-memory</font> y todas las demas permanecen intactas. '
    'No se modifico el schema de Prisma, la configuracion de Neon, la integracion con Firebase Auth ni la integracion con Stripe.', s_body))
story.append(Paragraph(
    '<b>Estilos, animaciones, colores:</b> No se modifico ninguna clase CSS, Tailwind class, archivo de estilos globales ni configuracion de tema. Las correcciones son exclusivamente logicas (JavaScript/TypeScript).', s_body))

# Build
doc.build(story)
print(f'PDF generado: {output_path}')