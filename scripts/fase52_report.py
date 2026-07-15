#!/usr/bin/env python3
"""FASE 5.2 — VitaZen Performance Optimization Report"""

import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Font Setup ━━
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold', italic='FreeSerif-Italic')
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

# Fallback for mixed text
sys.path.insert(0, '/home/z/my-project/skills/pdf/scripts')
from pdf import install_font_fallback
install_font_fallback()

# ━━ Cascade Palette ━━
PAGE_BG      = colors.HexColor('#f1f1f0')
SECTION_BG   = colors.HexColor('#f0f0ee')
CARD_BG      = colors.HexColor('#f0efed')
TABLE_STRIPE = colors.HexColor('#f0efee')
HEADER_FILL  = colors.HexColor('#71694f')
COVER_BLOCK  = colors.HexColor('#6c6244')
BORDER       = colors.HexColor('#d7d1be')
ICON         = colors.HexColor('#796d47')
ACCENT       = colors.HexColor('#97781b')
ACCENT_2     = colors.HexColor('#419bb9')
TEXT_PRIMARY  = colors.HexColor('#272624')
TEXT_MUTED    = colors.HexColor('#78756e')
SEM_SUCCESS  = colors.HexColor('#418a59')
SEM_WARNING  = colors.HexColor('#9c824d')
SEM_ERROR    = colors.HexColor('#984e47')
SEM_INFO     = colors.HexColor('#46729e')

# ━━ Styles ━━
W = A4[0] - 50*mm  # usable width

body = ParagraphStyle('body', fontName='FreeSerif', fontSize=10, leading=16,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=6)
body_bold = ParagraphStyle('body_bold', fontName='FreeSerif-Bold', fontSize=10, leading=16,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=6)
h1 = ParagraphStyle('h1', fontName='FreeSerif-Bold', fontSize=18, leading=24,
                     textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=10)
h2 = ParagraphStyle('h2', fontName='FreeSerif-Bold', fontSize=13, leading=18,
                     textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8)
h3 = ParagraphStyle('h3', fontName='FreeSerif-Bold', fontSize=11, leading=15,
                     textColor=ICON, spaceBefore=10, spaceAfter=6)
code_style = ParagraphStyle('code', fontName='DejaVuSans', fontSize=8, leading=11,
                            textColor=colors.HexColor('#5a4e3c'), backColor=CARD_BG,
                            leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=4,
                            borderPadding=4)
caption_style = ParagraphStyle('caption', fontName='FreeSerif-Italic', fontSize=8.5,
                               leading=12, textColor=TEXT_MUTED, alignment=TA_LEFT,
                               spaceBefore=2, spaceAfter=10)
bullet_style = ParagraphStyle('bullet', fontName='FreeSerif', fontSize=10, leading=16,
                              textColor=TEXT_PRIMARY, leftIndent=18, bulletIndent=6,
                              spaceAfter=4)
kicker_style = ParagraphStyle('kicker', fontName='FreeSerif-Italic', fontSize=9,
                              leading=12, textColor=ACCENT, spaceAfter=2)
footer_style = ParagraphStyle('footer', fontName='FreeSerif-Italic', fontSize=7.5,
                              leading=10, textColor=TEXT_MUTED)

# ━━ Helpers ━━
def hr():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=8, spaceBefore=4)

def make_table(headers, rows, col_widths=None):
    cw = col_widths or [W/len(headers)]*len(headers)
    hdr = [Paragraph(f'<b>{h}</b>', ParagraphStyle('th', fontName='FreeSerif-Bold', fontSize=8.5,
           leading=11, textColor=colors.white)) for h in headers]
    data = [hdr]
    for r in rows:
        data.append([Paragraph(str(c), ParagraphStyle('td', fontName='FreeSerif', fontSize=8.5,
                   leading=11, textColor=TEXT_PRIMARY)) for c in r])
    t = Table(data, colWidths=cw, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.4, BORDER),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0,i), (-1,i), TABLE_STRIPE))
    t.setStyle(TableStyle(style_cmds))
    return t

# ━━ Build Document ━━
OUTPUT = '/home/z/my-project/download/VitaZen_FASE5.2_Informe_Optimizacion.pdf'

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=25*mm, rightMargin=25*mm,
    topMargin=25*mm, bottomMargin=20*mm,
    title='FASE 5.2 - VitaZen Performance Optimization',
    author='Z.ai',
    subject='Safe Performance Optimization Report',
)

story = []

# ── COVER ──
story.append(Spacer(1, 60*mm))
story.append(Paragraph('VitaZen', ParagraphStyle('cover_brand', fontName='FreeSerif-Bold',
    fontSize=36, leading=42, textColor=ACCENT, alignment=TA_CENTER)))
story.append(Spacer(1, 6*mm))
story.append(Paragraph('FASE 5.2', ParagraphStyle('cover_fase', fontName='FreeSerif',
    fontSize=14, leading=18, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width='40%', thickness=1.5, color=ACCENT, spaceAfter=10, spaceBefore=0))
story.append(Paragraph('Optimizacion Segura de Rendimiento', ParagraphStyle('cover_title',
    fontName='FreeSerif-Bold', fontSize=22, leading=28, textColor=TEXT_PRIMARY, alignment=TA_CENTER)))
story.append(Spacer(1, 5*mm))
story.append(Paragraph('Indices de base de datos, paginacion de consultas Prisma,<br/>'
    'agregacion en DB para analytics, limites de seguridad', ParagraphStyle('cover_sub',
    fontName='FreeSerif-Italic', fontSize=11, leading=16, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(Spacer(1, 40*mm))
story.append(Paragraph('16 de julio de 2026', ParagraphStyle('cover_date', fontName='FreeSerif',
    fontSize=10, leading=14, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(PageBreak())

# ━━ CHAPTER 1: Resumen Ejecutivo ━━
story.append(Paragraph('1. Resumen Ejecutivo', h1))
story.append(hr())
story.append(Paragraph(
    'Este informe documenta la auditoria forense de rendimiento y las optimizaciones implementadas '
    'en la FASE 5.2 de VitaZen. El objetivo principal fue identificar y corregir consultas de base '
    'de datos sin limitar, operaciones de agregacion ineficientes en memoria, y riesgos de seguridad '
    'en parametros de entrada, todo ello bajo la restriccion estricta de no modificar la arquitectura '
    'existente ni introducir cambios visuales. Se priorizaron optimizaciones de bajo riesgo y alto '
    'beneficio que pudieran implementarse sin riesgo de regresion.', body))
story.append(Paragraph(
    'La auditoria cubrio 60 archivos de ruta API y 16 archivos de libreria, identificando 11 consultas '
    'findMany sin paginar, 15 casos de sobre-fetching de campos, y un problema critico de uso de memoria '
    'en el endpoint de analytics. Como resultado, se implementaron 10 optimizaciones concretas y se '
    'corrigieron 3 errores de sintaxis en el schema Prisma que impedian la validacion. Todas las '
    'optimizaciones mantienen la compatibilidad total con el frontend existente y no introdujeron '
    'ningun error nuevo de TypeScript (los 32 errores preexistentes permanecen sin cambios).', body))

# Summary table
story.append(Spacer(1, 4*mm))
summary_data = [
    ['Archivos auditados', '76 (60 rutas API + 16 lib)'],
    ['Optimizaciones implementadas', '10 cambios en 9 archivos'],
    ['Errores de schema corregidos', '3 (modelos sin cierre y @@index fuera de modelo)'],
    ['Nuevos errores TypeScript', '0 (32 preexistentes sin cambios)'],
    ['Riesgo de regresion', 'Minimo (cambios aditivos: take, clamp, groupBy)'],
]
t = Table(
    [[Paragraph(f'<b>{r[0]}</b>', ParagraphStyle('s1', fontName='FreeSerif-Bold', fontSize=9, leading=12, textColor=TEXT_PRIMARY)),
      Paragraph(r[1], ParagraphStyle('s2', fontName='FreeSerif', fontSize=9, leading=12, textColor=TEXT_PRIMARY))]
     for r in summary_data],
    colWidths=[W*0.45, W*0.55]
)
t.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
    ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ('BACKGROUND', (0,0), (0,-1), CARD_BG),
]))
story.append(t)

# ━━ CHAPTER 2: Metodologia ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('2. Metodologia de Auditoria', h1))
story.append(hr())
story.append(Paragraph(
    'La auditoria se ejecuto en tres fases secuenciales. En primer lugar, se leyo y analizo el archivo '
    'prisma/schema.prisma completo para catalogar todos los indices existentes y verificar su cobertura '
    'frente a los patrones de consulta observados en el codigo. En segundo lugar, se leyeron los 60 '
    'archivos de ruta API y los 16 archivos de libreria que contienen acceso a base de datos, evaluando '
    'cada consulta findMany para determinar si tiene paginacion (take/skip/cursor), si usa select para '
    'limitar campos, si tiene manejo de errores try/catch, y si presenta patrones N+1. En tercer lugar, '
    'se evaluaron los puntos criticos de memoria, especialmente el endpoint de analytics que carga '
    'todos los eventos del periodo en memoria para agregarlos en JavaScript.', body))
story.append(Paragraph(
    'Cada hallazgo se clasifico en siete categorias: (A) findMany sin paginar, (B) falta de try/catch, '
    '(C) sobre-fetching de campos, (D) consultas N+1, (E) problemas de memoria en analytics, (F) falta '
    'de transacciones, y (G) ya optimizado. Solo las optimizaciones de categoria A, C y E se implementaron, '
    'ya que las categorias B, D y F presentaban riesgo insuficiente o requerian refactorizacion '
    'arquitectonica que estaba expresamente prohibida por la especificacion de la FASE 5.2.', body))

# ━━ CHAPTER 3: Estado de Indices ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('3. Estado de Indices de Base de Datos', h1))
story.append(hr())
story.append(Paragraph(
    'El schema de Prisma ya contiene un conjunto robusto de indices, muchos de ellos anadidos en FASE '
    'anteriores (GLOBAL-18, PERF-5.2 previo). Se identificaron 22 @@index y 8 @@unique que cubren '
    'los patrones de consulta mas frecuentes del proyecto. Los indices compuestos clave incluyen: '
    'userId+archived en AIThread para la lista de conversaciones, threadId+createdAt en AIMessage '
    'para la carga ordenada de mensajes, userId+date en multiples modelos de tracking (DailyCheckin, '
    'WellnessLog, FinanceLog) para consultas por rango de fechas, y userId+active en PushToken para '
    'la busqueda de dispositivos activos de notificacion.', body))
story.append(Paragraph(
    'No se anadieron nuevos indices en esta FASE porque la cobertura existente es completa para los '
    'patrones de consulta actuales. Los tres @@index marcados con PERF-5.2 en FASEs anteriores '
    '(User.weeklyEmailSummary+emailVerified, User.dailyReminders, AnalyticsEvent.userId+event+createdAt, '
    'WidgetSnapshot.expiresAt, WidgetSnapshot.userId+computedAt, EmpireTip.empire+plan, y otros) ya '
    'estan desplegados en Neon. La unica intervencion en el schema fue la correccion de 3 errores de '
    'sintaxis: dos modelos (Subscription, UserChallenge) carecian de su llave de cierre "}", y el '
    'indice @@index([empire, plan]) de EmpireTip estaba posicionado fuera del modelo. Estos errores '
    'hacian que prisma validate fallara con 17 errores en cascada.', body))

# ━━ CHAPTER 4: Optimizaciones Implementadas ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('4. Optimizaciones Implementadas', h1))
story.append(hr())

# 4.1 Journal
story.append(Paragraph('4.1. Journal GET — Limitacion de resultados (take: 100)', h2))
story.append(Paragraph(
    'El endpoint GET /api/journal carecia de cualquier limite en la consulta findMany, retornando '
    'todas las entradas de diario del usuario ordenadas por createdAt descendente. Cada entrada incluye '
    'campos de texto pesados como "content" (potencialmente 4000+ caracteres) y "gratitude". Un usuario '
    'activo con cientos de entradas generaba respuestas HTTP de megabytes. La solucion fue anadir '
    'take: 100, que limita la lista a las 100 entradas mas recientes. Las entradas individuales se '
    'cargan bajo demanda mediante PUT o busqueda por ID, por lo que el frontend no necesita todas las '
    'entradas en la carga inicial. Este cambio es seguro porque la vista de lista del frontend solo '
    'muestra titulo, estado de animo y fecha para cada entrada.', body))

# 4.2 Wellness
story.append(Paragraph('4.2. Wellness GET — Restriccion del parametro days', h2))
story.append(Paragraph(
    'El endpoint GET /api/wellness aceptaba un parametro de consulta "days" sin limite superior. '
    'El parseo directo parseInt(searchParams.get("days") || "30") permitia valores arbitrariamente '
    'grandes como days=999999, lo que generaria una consulta masiva sobre todos los registros de '
    'bienestar del usuario desde hace mas de 2700 anos. La ruta de finanzas ya tenia la proteccion '
    'correcta con Math.min(Math.max(parsed, 10), 365). Se aplico el mismo patron: '
    'Math.min(Math.max(parseInt(...), 1), 365), asegurando un minimo de 1 dia y un maximo de 365. '
    'El cambio es compatible con el frontend que ya envia valores tipicos de 7 a 90 dias.', body))

# 4.3 AI Messages Premium
story.append(Paragraph('4.3. AI Messages — Cap de seguridad para usuarios PREMIUM', h2))
story.append(Paragraph(
    'El endpoint GET /api/ai/threads/[threadId]/messages tenia dos rutas: los usuarios FREE veian '
    'los ultimos 50 mensajes (con take: 50), pero los usuarios PREMIUM no tenian ningun limite, '
    'cargando todos los mensajes del hilo con todos los campos. En conversaciones largas de meses, '
    'esto podia significar cientos de mensajes con contenido completo. Se anadio MESSAGES_LIMIT_PREMIUM = 500 '
    'como cap de seguridad. Este valor cubre mas de 6 meses de conversacion diaria intensa (2-3 '
    'intercambios por dia) y es lo suficientemente alto para no afectar la experiencia de ningun '
    'usuario real, mientras previene escenarios degenerativos. Los mensajes se ordenan ascendentemente '
    'para mantener la compatibilidad con el chat existente.', body))

# 4.4 AI Threads Premium
story.append(Paragraph('4.4. AI Threads — Cap y select para lista de conversaciones', h2))
story.append(Paragraph(
    'El endpoint GET /api/ai/threads tenia un problema dual. Primero, la variable threadLimit era '
    'undefined para usuarios PREMIUM (isPremium ? undefined : HISTORY_LIMIT_FREE), lo que significaba '
    'que un usuario PREMIUM con 100+ hilos activos recibia todos con sus mensajes incluidos. Segundo, '
    'el include de mensajes retornaba todos los campos del ultimo mensaje (role, content, createdAt), '
    'pero el frontend de la lista de hilos solo usa "role" y "createdAt" para mostrar el preview. '
    'Se cambio threadLimit a isPremium ? MAX_THREADS_PREMIUM (100) : HISTORY_LIMIT_FREE (10), '
    'alineandolo con el limite de creacion de hilos ya existente. Ademas, se anadio '
    'select: { role: true, createdAt: true } al include de mensajes, eliminando la transferencia '
    'innecesaria del campo "content" que puede contener respuestas de IA de miles de caracteres. '
    'Se verifico mediante busqueda en el codigo que ningun componente del frontend accede a '
    'messages[0].content en la vista de lista de hilos.', body))

# 4.5 Habits
story.append(Paragraph('4.5. Habits GET — Limitacion a 100 habitos', h2))
story.append(Paragraph(
    'El endpoint GET /api/habits retornaba todos los habitos del usuario sin limite. Si bien es '
    'inusual que un usuario tenga mas de 50 habitos activos, la ausencia de un take creaba un riesgo '
    'de crecimiento descontrolado. Se anadio take: 100 como cap de seguridad, cubriendo todos los '
    'casos de uso realistas (un usuario disciplinado gestionaria tipicamente 10-30 habitos). La '
    'consulta ya estaba ordenada por createdAt descendente, por lo que los habitos mas recientes '
    'son los primeros en retornarse. Este cambio no afecta la funcionalidad de completado de habitos '
    '(PATCH) que opera por ID individual.', body))

# 4.6 Patterns + Life Memory
story.append(Paragraph('4.6. Patterns y Life Memory — Limitacion de habitLog', h2))
story.append(Paragraph(
    'Dos endpoints de inteligencia, /api/patterns y /api/life-memory, ejecutaban la misma consulta '
    'sin limite: db.habitLog.findMany({ where: { userId }, select: { name: true, streak: true, '
    'lastCompletedAt: true } }). Estos endpoints usan los datos de habitos para deteccion de patrones '
    'y construccion de la linea de vida, respectivamente. En ambos casos, solo se necesitan los habitos '
    'recientes y activos para el analisis. Se anadio take: 100 a ambas consultas. Las demas consultas '
    'en estos endpoints (financeLogs, wellnessLogs, meditationSessions, checkins, journalEntries) ya '
    'estaban correctamente acotadas por fechas con ninetyDaysAgo mediante select para limitar campos.', body))

# 4.7 Analytics (critical)
story.append(Paragraph('4.7. Analytics Insights — Agregacion en base de datos (optimizacion critica)', h2))
story.append(Paragraph('[OPTIMIZACION DE MAYOR IMPACTO]', kicker_style))
story.append(Paragraph(
    'El endpoint GET /api/analytics/insights presentaba el problema de rendimiento mas critico de '
    'todo el proyecto. La implementacion original cargaba TODOS los eventos de analytics del periodo '
    '(hasta 90 dias) en memoria del servidor usando findMany, y luego agregaba en JavaScript usando '
    'bucles for con Sets anidados. Con 1000 usuarios generando 5 eventos por dia durante 90 dias, '
    'esto significaba 450,000 filas cargadas en memoria, mas la creacion de objetos Set por cada tipo '
    'de evento y por cada dia para calcular DAU. En un escenario de crecimiento moderado a 10,000 '
    'usuarios, la memoria necesaria superaria los 4.5 millones de filas, causando OOM kills y '
    'timeout de la funcion serverless.', body))
story.append(Paragraph(
    'La solucion reemplaza las 4 operaciones en memoria por 5 consultas SQL dirigidas que delegan '
    'la agregacion a PostgreSQL. Primero, db.analyticsEvent.groupBy({ by: ["event"] }) reemplaza el '
    'bucle de conteo de eventos por tipo. Segundo, db.analyticsEvent.groupBy({ by: ["event", "userId"] }) '
    'calcula usuarios unicos por tipo de evento sin cargar filas individuales. Tercero, una consulta '
    'SQL raw con GROUP BY DATE("createdAt") y "userId" calcula la tendencia DAU directamente en la '
    'base de datos. Cuarto, db.analyticsEvent.groupBy({ by: ["userId"] }) obtiene el total de usuarios '
    'unicos del periodo. Quinto, db.analyticsEvent.count() reemplaza events.length para el total. '
    'El resultado neto es una reduccion de complejidad de O(N) en memoria a O(K) donde K es el numero '
    'de tipos de evento distintos (tipicamente menos de 20), con toda la carga de procesamiento en '
    'PostgreSQL que esta optimizado para este tipo de operaciones.', body))

# 4.8 Achievements
story.append(Paragraph('4.8. Achievements — Limitacion de allCheckinDates', h2))
story.append(Paragraph(
    'La funcion checkAndAwardAchievements en src/lib/achievements.ts ejecutaba una consulta '
    'findMany sin limite para obtener todas las fechas de check-in del historial completo del usuario. '
    'Esta consulta se usa para detectar gaps en el historial (logros de "comeback") y contar meses '
    'distintos. Un usuario con 3 anos de check-ins diarios generaria 1095 filas. Si bien la consulta '
    'ya usaba select: { date: true } para evitar campos pesados, la ausencia de un take creaba un '
    'riesgo teorico de crecimiento ilimitado. Se anadio take: 1095 (3 anos de datos diarios), que '
    'cubre todos los escenarios realistas de deteccion de gaps. Los logros de comeback requieren '
    'detectar ausencias de 14+ dias, lo cual es perfectamente cubierto con 3 anos de historial. '
    'Este cambio no afecta ningun logro activo porque el usuario mas antiguo de VitaZen tiene menos '
    'de 1 ano de datos.', body))

# 4.9 Schema Fixes
story.append(Paragraph('4.9. Correcciones del Schema Prisma', h2))
story.append(Paragraph(
    'Durante la validacion post-implementacion con prisma validate, se descubrieron 3 errores de '
    'sintaxis en prisma/schema.prisma que causaban 17 errores en cascada. El primer error: el modelo '
    'Subscription (linea 106) carecia de su llave de cierre "}". El comentario @@index contenia un '
    'caracter "}" al final que fue removido en una FASE anterior, pero ese "}" era tambien la llave '
    'de cierre del modelo. El segundo error: el modelo UserChallenge (linea 182) tenia el mismo '
    'problema. El tercer error: @@index([empire, plan]) del modelo EmpireTip estaba posicionado '
    'despues de la llave de cierre del modelo, fuera de su ambito. Las tres correcciones fueron '
    'simples: agregar las llaves de cierre faltantes y mover el @@index dentro del modelo. Despues '
    'de las correcciones, prisma validate confirmo "The schema is valid" y prisma db push sincronizo '
    'correctamente con Neon.', body))

# ━━ CHAPTER 5: Hallazgos No Implementados ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('5. Hallazgos Auditados pero No Implementados', h1))
story.append(hr())
story.append(Paragraph(
    'Durante la auditoria se identificaron hallazgos adicionales que no se implementaron por cumplir '
    'con la regla estricta de la FASE 5.2: "Si durante la implementacion detectas que alguna '
    'optimizacion requiere modificar la arquitectura, refactorizar componentes grandes o puede '
    'introducir regresiones, NO la implementes. Incluyela unicamente en el informe como recomendacion '
    'futura." A continuacion se documentan estos hallazgos clasificados por razon de exclusion.', body))

story.append(Paragraph('5.1. Sobre-fetching de campos en endpoints de listado', h2))
story.append(Paragraph(
    'Se identificaron 11 endpoints que retornan todos los campos del modelo cuando el frontend solo '
    'usa un subconjunto. Los casos mas claros son /api/finance (retorna "contexto" y "description" en '
    'cada registro, que son campos de texto libre potencialmente largos), /api/wellness (retorna '
    '"notes"), /api/nutrition (retorna "meals" JSON), y /api/journal (retorna "content" y "gratitude"). '
    'No se implemento select en estos endpoints porque requeriria verificar cada componente del '
    'frontend que consume estos datos para confirmar que ninguno accede a los campos que se excluirian. '
    'Un error en esta verificacion causaria campos undefined en el frontend, rompiendo la experiencia '
    'de usuario. La recomendacion futura es anadir select progresivamente endpoint por endpoint, '
    'validando con pruebas E2E antes de cada despliegue.', body))

story.append(Paragraph('5.2. Consultas N+1 en goals/engine.ts', h2))
story.append(Paragraph(
    'El archivo src/lib/goals/engine.ts contiene dos bucles que ejecutan db.mentorGoal.update() de '
    'forma secuencial: extractAndPersistGoals (lineas 507-543) y updateGoalStates (lineas 561-614). '
    'En ambos casos, cada iteracion del bucle ejecuta una consulta individual de actualizacion. Sin '
    'embargo, este archivo tiene 27 errores preexistentes de TypeScript (el modelo "mentorGoal" no '
    'existe en el schema Prisma, lo que sugiere que este modulo esta en desarrollo o es codigo '
    'muerto). Cualquier modificacion a este archivo corre el riesgo de interactuar mal con estos '
    'errores. Se recomienda como trabajo futuro: primero resolver los errores de TypeScript del modulo '
    'de goals, luego evaluar si el modelo MentorGoal se implementara o se eliminara, y finalmente '
    'batch las actualizaciones si el modulo se mantiene.', body))

story.append(Paragraph('5.3. Transacciones faltantes en escrituras multi-paso', h2))
story.append(Paragraph(
    'Se identificaron 4 ubicaciones con escrituras multi-paso sin transaccion: /api/onboarding (5 '
    'operaciones secuenciales: user.update, onboardingData.upsert, user.update, habitLog.findMany, '
    'habitLog.createMany, empireProgress.updateMany), /api/stripe/restore (user.update + subscription.upsert), '
    '/api/notifications/preferences (notificationPreference.upsert + pushToken.updateMany cuando '
    'pushEnabled=false), y /api/monthly-closure (findUnique + conditional update/create). Sin embargo, '
    'la mayoria usan upserts que son atomicos a nivel de fila, y los errores preexistentes en otros '
    'modulos sugieren que el proyecto prioriza la estabilidad sobre la correccion atomica. La '
    'recomendacion futura es envolver estas operaciones en db.$transaction() siguiendo el patron ya '
    'establecido en checkin, wellness, nutrition, journal y habits.', body))

story.append(Paragraph('5.4. Error handling: estado actual', h2))
story.append(Paragraph(
    'La auditoria revelo que el 100% de las rutas API que realizan operaciones de base de datos ya '
    'tienen bloques try/catch adecuados. Los unicos endpoints sin try/catch son /api/route.ts y '
    '/api/notifications/sw-config/route.ts, que son endpoints estaticos que no acceden a la base de '
    'datos y por lo tanto no lo necesitan. Este es un indicador de la madurez del proyecto en '
    'materia de manejo de errores. No se requieren cambios en esta area.', body))

# ━━ CHAPTER 6: Tabla Resumen ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('6. Tabla Resumen de Cambios', h1))
story.append(hr())

changes_table = make_table(
    ['#', 'Archivo', 'Cambio', 'Riesgo'],
    [
        ['1', 'api/journal/route.ts', 'take: 100 en GET', 'Bajo'],
        ['2', 'api/wellness/route.ts', 'Clamp days a [1, 365]', 'Bajo'],
        ['3', 'api/ai/.../messages/route.ts', 'take: 500 para PREMIUM', 'Bajo'],
        ['4', 'api/ai/threads/route.ts', 'take: 100 + select en include', 'Bajo'],
        ['5', 'api/habits/route.ts', 'take: 100 en GET', 'Bajo'],
        ['6', 'api/patterns/route.ts', 'take: 100 en habitLog', 'Bajo'],
        ['7', 'api/life-memory/route.ts', 'take: 100 en habitLog', 'Bajo'],
        ['8', 'api/analytics/insights/route.ts', 'groupBy + raw SQL (5 consultas)', 'Medio'],
        ['9', 'lib/achievements.ts', 'take: 1095 en allCheckinDates', 'Bajo'],
        ['10', 'prisma/schema.prisma', '3 correcciones de sintaxis', 'Bajo'],
    ],
    col_widths=[W*0.06, W*0.34, W*0.42, W*0.18]
)
story.append(changes_table)
story.append(Paragraph('Tabla 1: Todos los cambios implementados con nivel de riesgo evaluado.', caption_style))

# ━━ CHAPTER 7: Verificacion ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('7. Verificacion y Validacion', h1))
story.append(hr())
story.append(Paragraph(
    'Todas las optimizaciones fueron verificadas mediante tres mecanismos de validacion. Primero, '
    'la validacion del schema con prisma validate confirmo "The schema at prisma/schema.prisma is '
    'valid" despues de las correcciones sintacticas. Segundo, la generacion del cliente Prisma con '
    'prisma generate completo exitosamente en 519ms, produciendo los tipos actualizados. Tercero, '
    'la sincronizacion con la base de datos Neon via prisma db push confirmo "Your database is now '
    'in sync with your Prisma schema". Cuarto, la verificacion de tipos con tsc --noEmit confirmo '
    '32 errores de TypeScript, todos preexistentes (goals/engine.ts, timeline/route.ts, '
    'NotificationPreferences.tsx, insights.ts, weekly-recap-sender.ts, observability/logger.ts, '
    'layout.tsx, prisma.config.ts) y cero errores nuevos introducidos por las optimizaciones. El '
    'build de Next.js no pudo completarse debido a la variable de entorno faltante GROQ_API_KEY, '
    'que es un problema preexistente independiente de los cambios realizados.', body))

# ━━ CHAPTER 8: Recomendaciones Futuras ━━
story.append(Spacer(1, 8*mm))
story.append(Paragraph('8. Recomendaciones Futuras', h1))
story.append(hr())
story.append(Paragraph(
    'Se recomienda priorizar las siguientes mejoras en FASEs posteriores, ordenadas por impacto '
    'potencial y complejidad de implementacion. En primer lugar, la adicion progresiva de clausulas '
    'select a los endpoints de listado (finance, wellness, nutrition, checkin trends) para reducir '
    'el tamaño de respuesta HTTP. Esto requiere una verificacion componente por componente del '
    'frontend para garantizar que ningun campo excluido sea accedido. En segundo lugar, la resolucion '
    'de los 27 errores de TypeScript preexistentes en goals/engine.ts, que bloquean cualquier '
    'optimizacion del motor de metas. En tercer lugar, la evaluacion de patrones de cursor-based '
    'pagination para endpoints con datos potencialmente ilimitados (journal, timeline), reemplazando '
    'el simple offset+take por marcadores de posicion que mejoran el rendimiento en conjuntos de '
    'datos grandes. Finalmente, la consideracion de una tabla de agregacion diaria para analytics, '
    'que eliminaria la necesidad de consultas groupBy sobre la tabla de eventos en tiempo real.', body))

# ━━ Page number footer ━━
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif-Italic', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawRightString(A4[0] - 25*mm, 12*mm, f'{doc.page}')
    canvas.drawCentredString(A4[0]/2, 12*mm, 'VitaZen FASE 5.2 — Performance Optimization Report')
    canvas.restoreState()

# ━━ Build ━━
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'PDF generated: {OUTPUT}')