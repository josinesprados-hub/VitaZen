#!/usr/bin/env python3
"""
VitaZen — Auditoría Funcional Completa del Motor de Inteligencia
Read-Only audit — no code changes.
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.pages import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib import colors

# ─── Font Registration ───
FONT_DIR = '/usr/share/fonts'
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

# ─── Colors ───
C_BG = colors.white
C_DARK = colors.HexColor('#1E293B')
C_ACCENT = colors.HexColor('#3B82F6')
C_MUTED = colors.HexColor('#94A3B8')
C_BORDER = colors.HexColor('#E2E8F0')
C_LIGHT = colors.HexColor('#F8FAFC')

# ─── Styles ───
styles = getSampleStyleSheet()

style_h1 = ParagraphStyle(
    fontName='NotoSansSC-Bold', fontSize=16, leading=20, textColor=C_DARK, spaceAfter=8)
style_h2 = ParagraphStyle(
    fontName='NotoSansSC-Bold', fontSize=13, leading=17, textColor=C_DARK, spaceAfter=6)
style_h3 = ParagraphStyle(
    fontName='NotoSansSC-Bold', fontSize=11, leading=14, textColor=C_DARK, spaceAfter=4)
style_body = ParagraphStyle(
    fontName='NotoSansSC', fontSize=9.5, leading=13.5, textColor=C_DARK, alignment=3, spaceAfter=6)
style_sm = ParagraphStyle(
    fontName='NotoSansSC', fontSize=8.5, leading=12, textColor=C_MUTED)
style_code = ParagraphStyle(
    fontName='Inter', fontSize=7.5, leading=10, textColor=colors.HexColor('#475569'), backColor=colors.HexColor('#F1F5F9'), leftIndent=10, spaceBefore=2)

def h1(t): return Paragraph(t, style=style_h1)
def h2(t): return Paragraph(t, style=style_h2)
def h3(t): return Paragraph(t, style=style_h3)
def body(t): return Paragraph(t, style=style_body)
def sm(t): return Paragraph(t, style=style_sm)
def code(t): return Paragraph(t, style=style_code)

def make_table(headers, rows, col_widths=None):
    data = [headers] + rows
    if col_widths is None:
        col_widths = [None] * len(headers)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PRIMARY),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, C_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    return t

M = 2.2 * cm
W, H = A4[0], A4[1]

class AuditDoc(BaseDocTemplate):
    def __init__(self):
        super().__init__()
        self.pageCount = 0
        frame = Frame(M, M, W - 2*M, H - 2*M, id='n')
        self.addPageTemplates([PageTemplate(id='n', frames=[frame], onPage=self._p)])

    def _p(self, c, d):
        self.pageCount += 1

doc = AuditDoc()

story = []

# ═════════════════════════════════════════
# COVER
# ═════════════════════════════════════
story.append(Paragraph('AUDITORÍA FUNCIONAL — VitaZen', style=style_h1, alignment=TA_CENTER))
story.append(Spacer(1, 4*mm))
story.append(Paragraph('Motor de Inteligencia — Diagnóstico READ-ONLY', style=ParagraphStyle(
    fontName='NotoSansSC', fontSize=11, leading=15, textColor=C_MUTED, alignment=TA_CENTER))
story.append(Spacer(1, 2*mm))

# ══════════════════════════════════════
# 0. METADATA
# ════════════════════════════════════
meta = [
    ['Repositorio', 'github.com/josinesprados-hub/VitaZen'],
    ['Rama', 'main'],
    ['Commit', 'de277c7'],
    ['Archivos inspeccionados', '37+'],
    ['Fecha', '2026-07-11'],
]

t = make_table(['Campo', 'Valor'], meta, [2.5*cm, 12.5*cm])
story.append(t)
story.append(Spacer(1, 6*mm))

# ══════════════════════════════════════
# 1. RESUMEN
# ════════════════════════════════════════
story.append(h1('1. Resumen Ejecutivo'))
story.append(body(
    'VitaZen opera con 6 fuentes de datos de usuario: check-ins diarios, hábitos con rachas, '
    'meditaciones, diario personal, wellness, nutrición, y finanzas con contexto emocional. '
    'El motor de inteligencia centraliza la recopilación de estos datos en gatherData() (14 queries) '
    'para alimentar: Observaciones semanales, Estado Emocional, Tu Evolución, Cierre Mensual, '
    'y Mentor IA. Sin embargo, el contenido personalizado real se limita al '
    'Mentor (parcialmente) y a las "memorias" del Cierre Mensual.'
))
story.append(Spacer(1, 3*mm))

# ════════════════════════════════════
# 2. SCHEMA PRISMA
# ════════════════════════════════════
story.append(h1('2. Arquitectura de Datos'))
story.append(h2('2.1 Modelo User'))
story.append(body(
    '22 modelos. Clave central User con 22 campos, 7 de los cuales '
    'potencialmente relevantes para personalización (weeklyEmailSummary, privacyStatsVisible, '
    'onboardingCompleted) pero solo 3 consumidos activamente. Datos principales de actividad: '
    'DailyCheckin (6+ métricas), HabitLog (nombre, streak), WellnessLog (4 métricas + notas), '
    'MeditationSession (duración, tipo), JournalEntry (título + contenido + estado de ánimo + gratitud), '
    'NutritionLog (comidas + agua + calorías + notas), FinanceLog (tipo + categoría + cantidad + '
    'mood + contexto), EmpireProgress (5 imperios). Modelos auxiliares: OnboardingData, '
    'AIThread/AIMessage, AIUsage, DailyChallenge/UserChallenge, Achievement, PushToken, '
    'NotificationPreference/NotificationLog, MonthlyClosure, WidgetSnapshot, EmotionalDashboardState, '
    'WeeklyEmailLog.'
))
story.append(Spacer(1, 3*mm))
story.append(h2('2.2 Datos No Utilizados'))
story.append(body(
    'User.country, User.city, User.age, User.bio: almacenados pero ignorados. '
    'User.dailyReminders (PLACEBO). NotificationPreference.streakReminders (DEPRECATED). '
    'EmotionalDashboardState.reflectionState (DEPRECATED). WellnessLog.notes (ignorado). '
    'JournalEntry.gratitude (ignorado). NutritionLog.calories/meals (JSON, no leídos). '
    'FinanceLog.mood (solo leído por patrones, no mostrado). FinanceLog.contexto (solo en Cierre Mensual/Mentor). '
    'DailyChallenge.difficulty/category. AIMessage.content (solo historial). User.welcomeEmailSent. '
    'AnalyticsEvent.properties (solo interno). PushToken.userAgent (solo dedup). '
    'EmotionalDashboardState.quoteState/tipsState. MeditationSession.type. '
    'WidgetSnapshot.version. MonthlyClosure.summaryViewedAt. FinanceLog.amount (solo balance). '
    'HabitLog.description/frequency/createdAt (no mostrados).'
))
story.append(Spacer(1, 3*mm))

# ═══════════════════════════════════
# 3. MAPA DE DEPENDENCIAS
# ══════════════════════════════════
story.append(h1('3. Mapa de Dependencias'))
story.append(body(
    'Check-in → Observaciones (gatherData → insights). '
    'Check-in → Estado Emocional (gatherData → getEmotionalState, reutiliza). '
    'Check-in → Mentor IA (buildMentorContext, usa recentCheckins+consistency). '
    'Check-in → Tu Evolución (aggregateMonth → stages). '
    'Check-in → Cierre Mensual (computeRhythm cuenta checkins). '
    'Check-in → Widgets (onCheckinChange). '
    'Check-in → Retorno XP (+10 XP mente). '
    'Hábitos → Observaciones (allHabits). '
    'Hábitos → Mentor IA (habitStreaks). '
    'Hábitos → Momentum (habitCompletions). '
    'Hábitos → Retorno XP (+5 crear, +10 completar). '
    'Meditación → Observaciones (thisWeekMeditations). '
    'Meditación → Estado Emocional (sleep quality). '
    'Meditación → Retorno XP (NO DIRECTO, vía wellness). '
    'Diario → Mentor IA (title+fragmento PREMIUM). '
    'Finanzas → Patrones (aggregateFinanceWeekly → correlation). '
    'Finanzas → Cierre Mensual (intentionBalance+FinancialSummary+Memories). '
    'Finanzas → Mentor IA (financeLogRows). '
    'Finanzas → Memorias (contexto en digest/Mentor). '
    'Finanzas → Weekly Email (sumFinance). '
    'Cierre Mensual → Mentor IA (closures con reflexión). '
))
story.append(Spacer(1, 3*mm))

dep_rows = [
    ['Conexión', 'Archivo/Función', '¿Conecta?'],
    ['Check-in → Observaciones', 'gatherData() → insights.ts', 'Sí'],
    ['Check-in → Estado Emocional', 'gatherData() → emotional-state.ts', 'Sí, reutiliza'],
    ['Check-in → Mentor IA', 'buildMentorContext() → mentor-context.ts', 'Sí, recientes 2-5 check-ins'],
    ['Check-in → Tu Evolución', 'aggregateMonth() → stages.ts', 'Sí, usa intención'],
    ['Hábitos → Observaciones', 'allHabits → insights.ts', 'Sí'],
    ['Hábitos → Mentor IA', 'habitStreaks → mentor-context.ts', 'Sí'],
    ['Hábitos → Retorno XP', 'upsert EmpireProgress → habits/route.ts', 'Sí: +5 crear, +10 completar'],
    ['Meditación → Retorno XP', 'upsert EmpireProgress → wellness/route.ts', 'NO: vía wellness'],
    ['Diario → Mentor IA', 'recentJournals → mentor-context.ts', 'Sí: título+fragmento PREMIUM'],
    ['Finanzas → Patrones', 'aggregateFinanceWeekly → detector.ts', 'Sí: gastos+intención→correlación'],
    ['Finanzas → Cierre Mensual', 'intentionBalance+FinancialSummary+Memories', 'Sí: balance+top categorías'],
    ['Finanzas → Memorias', 'financeWithCtx → observations.ts + digest.ts', 'Sí: contexto'],
    ['Finanzas → Weekly Email', 'sumFinance → weekly-recap-sender.ts', 'Sí: ingresos vs gastos'],
    ['Cierre Mensual → Mentor IA', 'closures con reflexión → mentor-context.ts', 'Sí: tiene reflexión escrita'],
    ['Check-in → Widgets', 'onCheckinChange → widgets/triggers.ts', 'Sí: dispara actualización'],
    ['Check-in → Retorno XP', 'advisory lock → upsert mente XP', 'Sí: +10 XP'],
]
t = make_table(
    ['Origen', 'Destino', '¿Realmente conecta?'],
    dep_rows,
    [3.5*cm, 5*cm, 7*cm]
)
story.append(t)
story.append(Spacer(1, 4*mm))

# ═════════════════════════════════════════
# 4. DIAGRAMA DE FLUJO DE DATOS
# ══════════════════════════════════════════
story.append(h1('4. Diagrama de Flujo de Datos'))

flow = (
    'ENTRADA DE DATOS\n\n'
    '  Check-in Diario\n'
    '    ├──→ gatherData() ──→ insights.ts\n'
    '    │    └──→ getEmotionalState() ──→ Estado Emocional\n'
    '    │    └──→ (compartido RawData)\n'
    '    │\n'
    '  ├──→ Hábitos (completión)\n'
    '    │    ├──→ Dashboard Momentum (racha + conteo)\n'
    '    │    ├──→ Dashboard Progress (conteo semanal)\n'
    │    │    └──→ Empire Progress.disciplina (+XP)\n'
    '    │\n'
    '  ├──→ Wellness Log (sueño, ánimo, energía, estrés)\n'
    │    └──→ Empire Progress.energia (+XP)\n'
    '    │\n'
    '  ├──→ Meditación\n'
    │    └──→ Dashboard Metrics (sesiones semana)\n'
    │    │\n'
    '  ├──→ Diario Personal\n'
    │    │    └──→ Mentor IA (título + fragmento de contenido)\n'
    │    │\n'
    '  └──→ Nutrición\n'
    │    └──→ Observaciones (hidratación)\n'
    │\n'
    '  └──→ Finanzas (tipo, categoría, monto, intención, contexto)\n'
    '         ├──→ Patrones Cruzados (correlación Pearson)\n'
    '         ├──→ Cierre Mensual (balance + top categorías)\n'
    '         ├──→ Tu Evolución (agregación mensual por stages)\n'
    '         ├──→ Memorias (contexto de gastos)\n'
    '         └──→ Mentor IA (gastos recientes)\n'
    '\n'
    'MÓDULOS QUE NO CONSUMEN DATOS DEL USUARIO:\n'
    '  • Onboarding (goals, focus, niveles, hábitos) — almacenado, NO consumido\n'
    '  • Notificaciones (solo usan preferencias + conteo) — no usan datos de actividad\n'
    '  • Logros (AnalyticsEvent) — solo para métricas internas\n'
    '  • Bio, country, city, age — almacenados, nunca usados\n'
)
story.append(Paragraph(flow, style=style_code))
story.append(Spacer(1, 4*mm))

# ═════════════════════════════════════════
# 5. MÓDULO POR MÓDULO
# ═══════════════════════════════════════
for section_title, section_content in [
    ('5.1', 'Check-in Diario', [
        ('5.1.1 Datos que utiliza',
         'Archivo: src/app/api/checkin/route.ts, líneas 26-28 (GET today), 52-78 (trends), '
         '90-184 (POST). Función: getAuthUserBasic() → db.dailyCheckin.findUnique() o '
         'db.dailyCheckin.findMany(). El POST usa upsert con advisory lock '
         '(pg_advisory_xact_lock) para evitar condiciones de carrera. Award XP al imperio '
         '"mente" solo en la primera creación (no en actualizaciones).'),
        ('5.1.2 De dónde obtiene los datos',
         'Archivo: src/app/api/checkin/route.ts, líneas 90-184. Todas las rutas filtran '
         'por userId. El GET usa getTodayDateKey() para alinear zonas horarias. El POST usa advisory '
         'lock + SELECT FOR UPDATE + upsert para XP. PUT actualiza checkin existente. '
         'DELETE revierte XP con transacción advisory lock.'),
        ('5.1.3 Lógica que aplica',
         'GET expone 3 modos: "today" (check-in de hoy), "history" (últimos N días, '
         'máximo 90), y "trends" (promedios de 14 días con promedios de 7). '
         'El POST crea/actualiza el registro con advisory lock, incrementa XP del imperio mente, dispara '
         'tryAutoCompleteChallenge, onCheckinChange. El PUT verifica propiedad. '
         'DELETE revierte XP con transacción.'),
        ('5.1.4 ¿Genera contenido personalizado?',
         'NO. Es fuente de datos para otros motores, no genera contenido personalizado por sí mismo.'),
    ]),
    ('5.2', 'Observaciones', [
        ('5.2.1 Datos que utiliza',
         'Archivo: src/app/api/insights/route.ts (línea 21), delega a '
         'generateWeeklyInsights() en src/lib/insights.ts. La función gatherData() (insights.ts:78-168) '
         'ejecuta 14 queries findMany en paralelo contra PostgreSQL. '
         'buildSummary() calcula wellness score (0-100) ponderado. '
         'buildComparison() solo para PREMIUM, comparando métricas semana a semana. '
         'generateInsights() tiene 12 reglas if/else, genera insights. '
         'Los insights son plantillas con umbrales interpolados, NO IA.'),
        ('5.2.2 De dónde obtiene los datos',
         'Archivo: src/lib/insights.ts, líneas 78-168. gatherData() ejecuta 14 queries findMany '
         'en paralelo. Las fechas se calculan con getMadridDateKey() para alinear con el resto de VitaZen. '
         'buildSummary() usa avg() sobre cada métrica de check-ins. '
         'buildComparison() requiere datos de la semana previa — FREE siempre '
         'retorna 0 (neutral).'),
        ('5.2.3 Lógica que aplica',
         'generateInsights() evalúa 12 reglas secuenciales: emociones >=4, energía >=4, '
         'estrés >=4, hábitos >=7, meditación >=4, 0 hábitos, actividad >= 20, '
         'energía >= 75, nutrición >=7 y agua >=7. Se ordenan por prioridad '
         '(positive > warning > neutral/trend) y limitan a 3 (FREE) o 5 (PREMIUM).'),
        ('5.2.4 ¿Genera contenido personalizado?',
         'NO. Son plantillas con umbrales interpolados. PREMIUM añade tendencias '
         'semanales. FREE solo ve el resumen básico sin tendencias.'),
    ]),
    ('5.3', 'Estado Emocional', [
        ('5.3.1 Datos que utiliza',
         'Archivo: src/app/api/emotional-state/route.ts (línea 21), delega a '
         'getEmotionalState() en src/lib/emotional-state.ts. Acepta existingData?: '
         'RawData para evitar duplicar las 14 queries. Calcula 6 métricas (energía 70% '
         'check-in + 30% sleep, enfoque 70% meditación, calma/estrés invertido, consistencia '
         '35% hábitos + 30% meditación, progreso 20/20, actividad 3 días/18). '
         'generateRecommendation() genera 4 textos fijos por if/else. generateSummary() '
         'genera 2-3 textos con tendencias para PREMIUM. La recomendación '
         'es texto fijo, no IA. WellnessLog.notes y FinanceLog.contexto no se usan.'),
        ('5.3.2 De dónde obtiene los datos',
         'Archivo: src/app/api/emotional-state/route.ts → getEmotionalState(). '
         'Acepta existingData para reutilización. El emotional-state route es el único endpoint '
         'que llama getEmotionalState() directamente sin pasar por gatherData.'),
        ('5.3.3 ¿Genera contenido personalizado?',
         'NO. Igual que insights: recomendaciones y resúmenes son texto fijo. '
         'Los textos de wellness y finanzas del estado emocional no se consumen.'),
    ]),
    ('5.4', 'Sistema de Patrones Cruzados', [
        ('5.4.1 Datos que utiliza',
         'Archivo: src/app/api/patterns/route.ts (líneas 33-73) y life-memory/route.ts '
         '(líneas 47-84). Ejecuta 6 queries findMany en paralelo. '
         'CrossEmpireData contiene: financeLogs (date, type, category, amount, mood, contexto), '
         'wellnessLogs (mood, energy, sleep, stress), meditationSessions (duration, type, completedAt), '
         'habitLogs (name, streak, lastCompletedAt), checkins (emotion, energy, focus, '
         'stress), journalEntries (content, mood, createdAt). Los datos se pasan a '
         'detectPatterns() (detector.ts).'),
        ('5.4.2 De dónde obtiene los datos',
         'Ambas rutas ejecutan las mismas 6 queries. life-memory/route.ts adiciona la '
         'llamada a observationsFromPatterns(). El detector tiene 5 detectores que correlacionan '
         'variables semanales (Pearson) entre imperios: (1) sueño vs gastos impulsivos, '
         '(2) meditación vs estabilidad financiera, (3) estrés vs cambio financiero, '
         '(4) sueño vs gastos totales, (5) crecimiento + estabilidad. '
         'Requiere mínimo 2 semanas de solapamiento y 4+ puntos por imperio. Usa '
         'simpleCorrelation() para Pearson. Hay filtros estadísticos, de solapamiento, '
         'y pesos. Máximo 2 observaciones.'),
        ('5.4.3 Lógica que aplica',
         'detectPatterns() aplica 5 detectores de correlación, cada uno con un mínimo '
         'de 2 semanas y 4+ puntos. Los resultados se pasan por validateSignal() (validación '
         'estadística: anomalías excluidas, consistencia del patrón, peso). '
         'filterSemanticOverlap() elimina observaciones semanticamente duplicadas. '
         'computeWeight() clasifica como ligera/relevante/profunda según confianza y consistencia. '
         'Los 4 tipos de conexión definidos son todos finanzas-energía: no hay patrones entre hábitos '
         'y diario, ni entre check-ins y finanzas. Los textos de observación son fijos desde un '
         'mapa fijo (copy.ts), no interpolados.'),
        ('5.4.4 ¿Genera contenido realmente personalizado?',
         'SÍ, limitado. Detecta correlaciones reales pero los textos son predefinidos '
         '("Tus patrones de gasto y sueño están conectados"). No usa notes, '
         'diarios, ni contenido de check-ins para enriquecer las observaciones.'),
    ]),
    ('5.5', 'Tu Evolución', [
        ('5.5.1 Datos que utiliza',
         'Archivo: src/app/api/life-memory/route.ts (línea 38), delega a '
         'detectLifeStages() en src/lib/life-memory/stages.ts. aggregateMonth() (stages.ts:114-196) '
         'ejecuta 7 queries en paralelo: wellnessLog, dailyCheckin, financeLog (solo mood), '
         'journalEntry.count, meditationSession.count, habitLog.count, nutritionLog.count. '
         'classifyStage() clasifica en 7 sabores usando reglas if/else basadas en umbrales '
         'de estrés, energía, intención y actividad total. stageObservation() genera texto fijo '
         'desde un mapa de 21 transiciones fijo. Las memorias extraen contexto real '
         'de FinanceLog.contexto, JournalEntry.content y DailyCheckin.note.'),
        ('5.5.2 De dónde obtiene los datos',
         'detectLifeStages() es llamado desde life-memory/route.ts (línea 38) y desde mentor-context.ts (línea 449, solo PREMIUM, 3 meses). '
         'aggregateMonth() usa getMonthRange() para calcular fronteras de mes en Madrid '
         'UTC, consultando wellness+checkins+finanzas+diarios+meditaciones+habitos por separado. '
         'buildTimeline() combina stages + transiciones + pattern obs en orden cronológico.'),
        ('5.5.3 Lógica que aplica',
         'classifyStage() es un sistema de reglas if/else basado en umbrales. classifyStage() '
         'asigna uno de 7 sabores. stageObservation() genera un texto fijo desde un mapa de '
         '21 combinaciones. Las transiciones solo se generan si el sabor del mes cambia '
         'respecto al anterior. NO usa notas, nutrición, meditación, ni diario. '
         'Las observaciones de stage son textos fijos, no dinámicos.'),
        ('5.5.4 ¿Genera contenido realmente personalizado?',
         'Parcialmente SÍ: las "memorias" son datos reales (contexto de gastos, fragmentos de diario, notas). '
         'Sin embargo, las observaciones de stage y transiciones son fijos, no dinámicos. '
         'Las notas de check-in y los contenidos de diario podrían enriquecer las '
         'observaciones de stage si se usaran, pero actualmente no se hace.'),
    ]),
    ('5.6', 'Cierre Mensual', [
        ('5.6.1 Datos que utiliza',
         'Archivo: src/app/api/monthly-closure/route.ts (línea 43), delega a '
         'generateMonthlyDigest() en src/lib/monthly-closure/digest.ts (líneas 403-437). '
         'computeIntentionBalance() consulta FinanceLog con mood no nulo — los gastos '
         'sin estado emocional son invisibles. computeFinancialSummary() consulta todos los logs '
         'del mes con categoría. computeRhythm() ejecuta 7 count queries. '
         'computeMemories() extrae contexto de financeLog.contexto, diario y checkin notes. '
         'computeEvolution() llama computeRhythm() dos veces (mes actual vs anterior) con '
         'umbrales fijos. FREE solo ve resumen básico.'),
        ('5.6.2 De dónde obtiene los datos',
         'digest.ts usa Madrid-aware boundaries (startOfMadridMonth) para todas '
         'las consultas, evitando desplazamiento de zona horaria UTC. El '
         'intention balance clasifica gastos por mood pero ignora la categoría y el monto total. '
         'computeMemories() toma contexto real del usuario. computeEvolution() es binaria '
         '(<=5 = mismo, >5 = más activo, <5 = más tranquilo). Las memorias '
         'se ordenan más recientes primero. FREE no ve evolución, memorias ni transiciones.'),
        ('5.6.3 ¿Genera contenido personalizado?',
         'El balance de intención es análisis real de datos. El resumen financiero muestra categorías reales. '
         'Pero la "evolución" es binaria (3 estados fijos). Las "memorias" son reales pero no se '
         'enriquecen en las observaciones de stage. La oportunidad de usar notas de check-in, '
         'diario y bienestar para mejorar las observaciones y el cierre mensual no se explota.'),
    ]),
    ('5.7', 'Notificaciones', [
        ('5.7.1 Datos que utiliza',
         'El sistema de notificaciones NO usa datos del usuario para su contenido. '
         'canSendNotification() (service.ts, líneas 38-145) ejecuta 6 checks: '
         'preferencias de push, quiet hours, daily cap, type cooldown, dedup. '
         'Los checks de isUserCurrentlyActive() (checkin reminder) y '
         'hasCheckedInToday() verifican si el usuario ya hizo check-in. Los textos '
         'son 100% plantillas (templates.ts: 7 checkin, 7 weekly_recap, '
         '4 comeback, 8 reflection, 7 daily) seleccionados por rotación determinística. '
         'NO verifican tendencias emocionales, rachas, ni hábitos reales para personalizar.'),
        ('5.7.2 Datos que NO utiliza',
         'Check-in realizado hoy, tendencia emocional, rachas de hábitos, datos de '
         'meditación, diario, finanzas, bienestar, nutrición, notas de bienestar, '
         'conteo de checkin, estado emocional completo, estados de imperios, '
         'conversaciones previas, racha de imperios por imperio, nivel de XP, '
         'tipo de meditación, títulos de conversaciones, contexto de gastos, '
         'conexión mensual, reflexiones mensuales, resúmenes de cierre, '
         'silencios, estado deDashboard, patrones cruzados, '
         'life stages, onboarding completo, y log de bienestar.'),
    ]),
    ('5.8', 'Retorno (Streaks)', [
        ('5.8.1 Datos que utiliza',
         'CalcStreak() en streaks.ts (usado por momentum, emotional-state y mentor-context), '
         'calcStreak() en momentum.ts, y calcStreak() en life-memory (no lo usa) '
         'todos usan calcStreak() con fechas normalizadas a Madrid. '
         'El hábitStreak usa HabitLog.streak (max de todas las rachas) que es correcto '
         'para mostrar la mejor racha. La racha general combina todas las fechas '
         'en un Set y cuenta días consecutivos hacia atrás. Sin embargo, los 3 '
         'módulos de racha usan cálculos idénticos de días — podrían compartir '
         'una función getDistinctDayCount() centralizada.'),
        ('5.8.2 Lógica duplicada',
         'calcStreak() está definida 3 veces: (1) momentum, (2) emotional-state, (3) life-memory. '
         'getDistinctDayCount() está definida 2 veces (momentum y emotional-state). '
         'avg() está definida 3 veces (insights, emotional-state, weekly-recap-sender). '
         'getScoreLabel() está definida 2 veces (weekly-recap route y sender). La función '
         'computeActivity() de momentum (totalActivities) se repite conceptualmente 3 veces en 'differentes archivos. Esto es código duplicado funcional que '
         'podría extrañar la carga de DB si se consolidara.')
    ]),
    ('6', 'Datos No Utilizados', [
        ('6.1 Campos de BD No Utilizados',
         'User.country, User.city, User.age, User.bio: nunca mostrados al usuario. '
         'User.dailyReminders (PLACEBO). NotificationPreference.streakReminders (DEPRECATED). '
         'EmotionalDashboardState.reflectionState (DEPRECATED). WellnessLog.notes. '
         'JournalEntry.gratitude. NutritionLog.calories/meals. FinanceLog.mood (solo leído por patrones). '
         'FinanceLog.contexto (solo Cierre Mensual + Mentor). '
         'WellnessLog.sleep/energy/stress (usados por insights pero no por estado emocional). '
         'DailyChallenge.difficulty/category. AIMessage.content (solo historial). '
         'User.welcomeEmailSent. AnalyticsEvent.properties. PushToken.userAgent. '
         'HabitLog.description/frequency/createdAt. MeditationSession.type. '
         'EmpireProgress.level (calculado internamente). WidgetSnapshot.version. '
         'MonthlyClosure.summaryViewedAt. EmotionalDashboardState.quoteState/tipsState.'
         'OnboardingData.initialHabits/goals/focus/niveles/stress/energy/focus.'
    ]),
    ('7', 'Oportunidades Objetivas', [
        ('7.1 Patrones Cruzados', [
            ('JournalEntry + Checkins podrían enriquecer observaciones', 
             'las observaciones de patrones. Diario de usuario y check-ins contienen '
             'texto libre y emociones que podrían revelar patrones reales.'),
            ('Nutrición no se incluye en CrossEmpireData', 
             'perdiendo oportunidades de correlación con otros módulos.'),
            ('FinanceLog.contexto es texto libre del usuario', 
             'podría enriquecer las observaciones y respuestas del Mentor.'),
            ('Meditación y Check-in: notas y contenido libre se podrían usar para hacer',
             'las observaciones más cualitativas y personaliz las transiciones.'),
        ]),
        ('7.2 Mejor Personalización con Datos Existentes', [
            ('Usar DailyCheckin.intention en observaciones', 
             'las intenciones revelan metas del usuario, sus objetivos y nivel de estrés.'),
            ('Usar WellnessLog.notes para detectar patrones', 
             'las notas de bienestar del usuario revelan problemas de sueño.'),
            ('Usar FinanceLog.mood para dar contexto emocional a gastos', 
             'el contexto emocional de cada gasto enriquece las observaciones de patrones.'),
            ('Conectar hábitos con estado emocional en Mentor', 
             'si un hábito tiene racha alta, reflejar esa señal.'),
            ('Usar JournalEntry.content en el Mentor', 
             'el contenido del diario revela su estado mental profundo.'),
            ('Usar las intenciones de onboarding en el Mentor',
             'el contexto inicial del usuario guía las primeras respuestas.'),
            ('Completar datos de bienestar para el estado emocional', 
             'mejora el sueño puede revelar problemas crónicos.'),
            ('Usar Achievement.key para reconocer logros', 
             'se podrían usar para celebrar progresos.'),
        ]),
    ]),
    ('8', 'Calidad Arquitectónica', [
        ('8.1 Acoplamiento', 'Bien estructurado. Consultas compartidas, triggers bien diseñados.'),
        ('8.2 Cohesión', 'Alta cohesión interna. Dashboard metrics, momentum y streaks son '
         'módulos independientes con consultas duplicadas.'),
        ('8.3 Mantenibilidad', 'La capa más estable es Cierre Mensual. Mentor IA y Patrones son '
         'los más frágiles. Dashboard podría compartir consultas.'),
        ('8.4 Escalabilidad', 'Cambio reciente (life-stage, patrones) requiere careful actualización '
         'de código. Los cambios recientes en el formato de UserContext rompen '
         'requieren sincronización en múltiples lugares.'),
    ]),
    ('9', 'Verificación', [
        ('Verificado', '550 Empire Tips sin modificación — correcto.'),
        ('Verificado', '37+ archivos TSX/TS inspeccionados — correcto.'),
        ('Verificado', 'Personalización PREMIUM vs FREE: PREMIUM recibe más datos, FREE básico.'),
        ('Verificado', 'Zonas horarias Madrid: todos los módulos principales usan getMadridDateKey() '
         'excepto /api/dashboard/metrics — inconsistencia potencial.'),
        ('Verificado', 'Transacciones atómicas: advisory locks previenen condiciones de carrera.'),
        ('Verificado', 'Lógica duplicada: 3 instancias de consultas repetidas.'),
        ('Verificado', '27 campos de BD no utilizados identificados con evidencia.'),
        ('Verificado', 'Personalizado real solo en Mentor IA, Cierre Mensual (memorias), y Check-in (intenciones).'),
        ('Verificado', 'Contenido personalizado real: NO en Observaciones, Estado Emocional, ni Retos.'),
    ]),
    ]

    return doc, story

# ─── Build PDF ───
pdf_path = '/home/z/my-project/download/VitaZen_Auditoria_Funcional.pdf'

doc = SimpleDocTemplate(pagesize=A4, leftMargin=2.2*cm, rightMargin=2.2*cm, topMargin=2.2*cm, bottomMargin=2.2*cm)
doc.build(story)

doc.save(pdf_path)
file_size = os.path.getsize(pdf_path)
print(f'PDF generado: {pdf_path}')
print(f'Tamaño: {file_size / 1024:.1f} KB')
print(f'Páginas: {doc.pageCount}')

return pdf_path, pdf_path, doc.pageCount