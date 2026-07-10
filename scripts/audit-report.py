#!/usr/bin/env python3
"""
VitaZen — Auditoría Funcional del Motor Inteligente
Genera un PDF profesional del informe técnico de auditoría.
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, ListFlowable, ListItem, Preformatted,
    Flowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Font Registration ──────────────────────────────────────────────
FONT_DIR = "/usr/share/fonts/truetype/liberation"
pdfmetrics.registerFont(TTFont("LibSans", os.path.join(FONT_DIR, "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("LibSans-Bold", os.path.join(FONT_DIR, "LiberationSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("LibSans-Italic", os.path.join(FONT_DIR, "LiberationSans-Italic.ttf")))
pdfmetrics.registerFont(TTFont("LibSans-BoldItalic", os.path.join(FONT_DIR, "LiberationSans-BoldItalic.ttf")))
pdfmetrics.registerFont(TTFont("LibMono", os.path.join(FONT_DIR, "LiberationMono-Regular.ttf")))
pdfmetrics.registerFont(TTFont("LibMono-Bold", os.path.join(FONT_DIR, "LiberationMono-Bold.ttf")))

from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily(
    "LibSans",
    normal="LibSans", bold="LibSans-Bold",
    italic="LibSans-Italic", boldItalic="LibSans-BoldItalic"
)

# ── Colors ─────────────────────────────────────────────────────────
C_DARK = colors.HexColor("#1a1a2e")
C_PRIMARY = colors.HexColor("#16213e")
C_ACCENT = colors.HexColor("#0f3460")
C_LIGHT_BG = colors.HexColor("#f0f0f5")
C_WHITE = colors.white
C_BLACK = colors.black
C_GRAY = colors.HexColor("#555555")
C_LIGHT_GRAY = colors.HexColor("#999999")
C_LINE = colors.HexColor("#cccccc")
C_SEV_HIGH = colors.HexColor("#c0392b")
C_SEV_MED = colors.HexColor("#d4a017")
C_SEV_LOW = colors.HexColor("#27ae60")
C_PREMIUM = colors.HexColor("#8e44ad")
C_FREE = colors.HexColor("#2980b9")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm

# ── Severity Badge Flowable ───────────────────────────────────────
class SeverityBadge(Flowable):
    def __init__(self, level, width=18*mm, height=5*mm):
        Flowable.__init__(self)
        self.level = level.upper()
        self.width = width
        self.height = height
        self._col = {
            "ALTA": C_SEV_HIGH, "MEDIA": C_SEV_MED, "BAJA": C_SEV_LOW
        }.get(self.level, C_GRAY)

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        self.canv.setFillColor(self._col)
        self.canv.roundRect(0, 0, self.width, self.height, 1.5*mm, fill=1, stroke=0)
        self.canv.setFillColor(C_WHITE)
        self.canv.setFont("LibSans-Bold", 7)
        tw = self.canv.stringWidth(self.level, "LibSans-Bold", 7)
        self.canv.drawString((self.width - tw) / 2, 1.5*mm, self.level)

# ── Styles ─────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

S_TITLE = ParagraphStyle("Title", fontName="LibSans-Bold", fontSize=24, leading=30,
    textColor=C_WHITE, alignment=TA_CENTER, spaceAfter=6*mm)

S_SUBTITLE = ParagraphStyle("Subtitle", fontName="LibSans", fontSize=13, leading=18,
    textColor=colors.HexColor("#b0b0d0"), alignment=TA_CENTER, spaceAfter=4*mm)

S_META = ParagraphStyle("Meta", fontName="LibSans", fontSize=10, leading=14,
    textColor=colors.HexColor("#8888aa"), alignment=TA_CENTER)

S_H1 = ParagraphStyle("H1", fontName="LibSans-Bold", fontSize=18, leading=24,
    textColor=C_PRIMARY, spaceBefore=8*mm, spaceAfter=4*mm,
    borderWidth=0, borderPadding=0)

S_H2 = ParagraphStyle("H2", fontName="LibSans-Bold", fontSize=14, leading=18,
    textColor=C_ACCENT, spaceBefore=6*mm, spaceAfter=3*mm)

S_H3 = ParagraphStyle("H3", fontName="LibSans-Bold", fontSize=11.5, leading=15,
    textColor=C_DARK, spaceBefore=4*mm, spaceAfter=2*mm)

S_BODY = ParagraphStyle("Body", fontName="LibSans", fontSize=9.5, leading=14,
    textColor=C_BLACK, alignment=TA_JUSTIFY, spaceAfter=2*mm)

S_BODY_INDENT = ParagraphStyle("BodyIndent", parent=S_BODY, leftIndent=8*mm,
    spaceAfter=1.5*mm)

S_CODE = ParagraphStyle("Code", fontName="LibMono", fontSize=8, leading=11,
    textColor=C_DARK, backColor=C_LIGHT_BG, borderWidth=0.5, borderColor=C_LINE,
    borderPadding=4, leftIndent=4*mm, spaceAfter=2*mm, spaceBefore=1*mm)

S_SMALL = ParagraphStyle("Small", fontName="LibSans", fontSize=8, leading=11,
    textColor=C_GRAY, spaceAfter=1*mm)

S_TABLE_HEADER = ParagraphStyle("TH", fontName="LibSans-Bold", fontSize=8.5, leading=11,
    textColor=C_WHITE, alignment=TA_LEFT)

S_TABLE_CELL = ParagraphStyle("TC", fontName="LibSans", fontSize=8, leading=11,
    textColor=C_BLACK)

S_FOOTER = ParagraphStyle("Footer", fontName="LibSans", fontSize=7.5, leading=10,
    textColor=C_LIGHT_GRAY, alignment=TA_CENTER)

S_TOC = ParagraphStyle("TOC", fontName="LibSans", fontSize=10, leading=16,
    textColor=C_DARK, leftIndent=5*mm, spaceAfter=1*mm)

S_TOC_H = ParagraphStyle("TOCH", fontName="LibSans-Bold", fontSize=10.5, leading=18,
    textColor=C_PRIMARY, spaceBefore=2*mm, spaceAfter=1*mm)

S_DIAGRAM = ParagraphStyle("Diagram", fontName="LibMono", fontSize=7.5, leading=11,
    textColor=C_DARK, backColor=colors.HexColor("#f8f8fc"), borderWidth=0.5,
    borderColor=C_LINE, borderPadding=6, leftIndent=4*mm, rightIndent=4*mm,
    spaceAfter=2*mm, spaceBefore=1*mm)

# ── Helper Functions ───────────────────────────────────────────────
def h1(text):
    return Paragraph(text, S_H1)

def h2(text):
    return Paragraph(text, S_H2)

def h3(text):
    return Paragraph(text, S_H3)

def body(text):
    return Paragraph(text, S_BODY)

def body_indent(text):
    return Paragraph(text, S_BODY_INDENT)

def code(text):
    return Paragraph(text.replace("<", "&lt;").replace(">", "&gt;"), S_CODE)

def small(text):
    return Paragraph(text, S_SMALL)

def spacer(h=3*mm):
    return Spacer(1, h)

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=C_LINE, spaceBefore=2*mm, spaceAfter=2*mm)

def severity_row(level, description, file_info):
    """Return a table row with severity badge."""
    badge = SeverityBadge(level)
    desc_p = Paragraph(description, ParagraphStyle("fd", fontName="LibSans", fontSize=8.5,
        leading=12, textColor=C_BLACK))
    file_p = Paragraph(file_info, ParagraphStyle("ff", fontName="LibMono", fontSize=7.5,
        leading=10, textColor=C_GRAY))
    t = Table(
        [[badge, desc_p, file_p]],
        colWidths=[20*mm, 100*mm, 66*mm],
        rowHeights=[None]
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (0, 0), 2),
        ("RIGHTPADDING", (1, 1), (1, 1), 2),
    ]))
    return t

def finding_block(findings):
    """Create a styled block of findings with severity badges."""
    elements = []
    for f in findings:
        elements.append(severity_row(f["sev"], f["desc"], f["file"]))
        elements.append(spacer(1.5*mm))
    return elements

def module_header(number, name):
    """Module header with number badge."""
    t = Table(
        [[Paragraph(f"<b>MODULO {number}</b>", ParagraphStyle("mn", fontName="LibSans-Bold",
            fontSize=9, textColor=C_WHITE)),
          Paragraph(f"<b>{name}</b>", ParagraphStyle("md", fontName="LibSans-Bold",
            fontSize=13, textColor=C_WHITE))]],
        colWidths=[28*mm, 158*mm]
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), C_ACCENT),
        ("BACKGROUND", (1, 0), (1, 0), C_PRIMARY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (0, 0), 6),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("ROUNDEDCORNERS", [3, 3, 0, 0]),
    ]))
    return t

def meta_table(rows):
    """Simple key-value meta table."""
    data = []
    for k, v in rows:
        data.append([
            Paragraph(f"<b>{k}</b>", S_TABLE_CELL),
            Paragraph(v, S_TABLE_CELL)
        ])
    t = Table(data, colWidths=[48*mm, 138*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), C_LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.3, C_LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t

# ── Page Number Callback ───────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("LibSans", 7.5)
    canvas.setFillColor(C_LIGHT_GRAY)
    page_num = canvas.getPageNumber()
    text = f"VitaZen — Auditoría Funcional del Motor Inteligente  |  Commit 6cf24f7  |  Pág. {page_num}"
    canvas.drawCentredString(PAGE_W / 2, 10 * mm, text)
    canvas.restoreState()

def add_cover_footer(canvas, doc):
    pass  # No footer on cover

# ── Build Document ─────────────────────────────────────────────────
OUTPUT_DIR = "/home/z/my-project/download"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "vitazen-auditoria-motor-inteligente.pdf")

doc = SimpleDocTemplate(
    OUTPUT_FILE,
    pagesize=A4,
    leftMargin=MARGIN,
    rightMargin=MARGIN,
    topMargin=MARGIN,
    bottomMargin=20*mm,
    title="VitaZen — Auditoría Funcional del Motor Inteligente",
    author="Auditoría Técnica READ-ONLY",
    subject="Análisis del motor de personalización inteligente"
)

story = []

# ════════════════════════════════════════════════════════════════════
# 1. PORTADA
# ════════════════════════════════════════════════════════════════════
# Dark cover background
cover_bg = Table([[""]], colWidths=[PAGE_W], rowHeights=[PAGE_H])
cover_bg.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), C_PRIMARY),
]))

story.append(Spacer(1, 60*mm))
story.append(Paragraph("VitaZen", ParagraphStyle("cv", fontName="LibSans-Bold",
    fontSize=36, leading=42, textColor=C_ACCENT, alignment=TA_CENTER)))
story.append(spacer(4*mm))
story.append(HRFlowable(width="40%", thickness=1, color=C_ACCENT, spaceBefore=0, spaceAfter=0))
story.append(spacer(6*mm))
story.append(Paragraph("Auditoría Funcional del Motor Inteligente",
    ParagraphStyle("ct", fontName="LibSans-Bold", fontSize=22, leading=28,
        textColor=C_WHITE, alignment=TA_CENTER)))
story.append(spacer(4*mm))
story.append(Paragraph("Análisis READ-ONLY de datos, personalización e integración entre módulos",
    S_SUBTITLE))
story.append(spacer(20*mm))

meta_data = [
    ["Fecha", "2026-07-11"],
    ["Commit", "6cf24f7"],
    ["Alcance", "13 módulos del motor inteligente"],
    ["Archivos fuente", "255 TypeScript/TSX"],
    ["Base de datos", "PostgreSQL via Prisma ORM"],
    ["Metodología", "READ-ONLY — auditoría funcional sin modificaciones"],
]
mt = Table(
    [[Paragraph(f"<b>{r[0]}</b>", ParagraphStyle("mk", fontName="LibSans-Bold",
        fontSize=9, textColor=colors.HexColor("#8899bb"))),
      Paragraph(r[1], ParagraphStyle("mv", fontName="LibSans", fontSize=9,
        textColor=colors.HexColor("#c0c8e0")))] for r in meta_data],
    colWidths=[50*mm, 100*mm]
)
mt.setStyle(TableStyle([
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#2a3a5e")),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
]))
story.append(mt)

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 2. RESUMEN EJECUTIVO
# ════════════════════════════════════════════════════════════════════
story.append(h1("2. Resumen Ejecutivo"))

story.append(body(
    "Esta auditoría evalúa el motor de personalización de VitaZen (commit <b>6cf24f7</b>) "
    "analizando el flujo de datos a través de sus 13 módulos principales. El hallazgo "
    "fundamental es que el denominado «motor inteligente» es predominantemente <b>basado en "
    "reglas determinísticas</b>, no en inteligencia artificial. De los 13 módulos, solo "
    "<b>Mentor IA</b> emplea un modelo de lenguaje (Groq llama-3.3-70b-versatile); los 12 "
    "restantes utilizan umbrales hardcodeados, consultas SQL directas y texto estático "
    "en español."
))
story.append(body(
    "Se identificaron <b>5 inconsistencias de zona horaria</b> donde endpoints del mismo "
    "subsistema (Dashboard) usan <font face='LibMono'>new Date()</font> en lugar de "
    "conversión a hora de Madrid, causando ventanas de 7 días desplazadas. El sistema de "
    "notificaciones carece por completo de personalización: las plantillas son frases estáticas "
    "rotadas por hash determinista, sin nombre de usuario ni métricas. Se detectó "
    "<b>código muerto</b> significativo (OnboardingRecommendations, incrementAIUsage, "
    "reflectionState) y un campo <b>placebo</b> en el schema (User.dailyReminders). "
    "La diferenciación FREE vs PREMIUM existe y es funcional, pero la mayor parte opera como "
    "gating de cantidad (3 vs 5 insights) más que como diferencia cualitativa en la "
    "inteligencia del motor. El módulo de patrones requiere obligatoriamente datos financieros "
    "(FinanceLog), lo que lo hace inútil para usuarios sin actividad financiera. Se concluye que "
    "la arquitectura es sólida en términos de protección de concurrencia (advisory locks, "
    "SELECT FOR UPDATE) pero la «inteligencia» es en su mayor parte cosmética."
))
story.append(spacer(4*mm))

# ════════════════════════════════════════════════════════════════════
# 3. METADATOS DE LA AUDITORÍA
# ════════════════════════════════════════════════════════════════════
story.append(h1("3. Metadatos de la Auditoría"))

story.append(meta_table([
    ("Commit hash", "6cf24f7"),
    ("Archivos fuente totales", "255 archivos TypeScript/TSX"),
    ("Archivos analizados", "~47 archivos directos del motor inteligente + librerías compartidas"),
    ("Framework", "Next.js 16 + Prisma ORM + PostgreSQL"),
    ("Motor de IA", "Groq llama-3.3-70b-versatile (únicamente en Mentor IA)"),
    ("Zona horaria de diseño", "Europa/Madrid (hardcodeada)"),
]))

story.append(spacer(3*mm))
story.append(h2("3.1 Modelos Prisma involucrados"))

prisma_models = [
    "User", "DailyCheckin", "Habit", "HabitLog", "MeditationSession",
    "JournalEntry", "WellnessLog", "NutritionLog", "FinanceLog",
    "EmpireProgress", "Challenge", "ChallengeCompletion",
    "AIThread", "AIMessage", "Achievement", "NotificationPreference",
    "NotificationLog", "LifeMemory", "OnboardingData",
    "EmotionalDashboardState"
]
story.append(body(", ".join(prisma_models)))

story.append(spacer(3*mm))
story.append(h2("3.2 Módulos auditados"))

modules_list = [
    "1. Observaciones (Insights)", "2. Tu Evolución (Dashboard)",
    "3. Memoria de Vida", "4. Cierre Mensual", "5. Mentor IA",
    "6. Check-in Diario", "7. Hábitos", "8. Estados Emocionales",
    "9. Notificaciones", "10. Recomendaciones", "11. Sistema de Patrones",
    "12. Motor de Insights (motor compartido)", "13. Silent Memories"
]
for m in modules_list:
    story.append(body_indent(f"• {m}"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 4. MAPA DE DEPENDENCIAS
# ════════════════════════════════════════════════════════════════════
story.append(h1("4. Mapa de Dependencias"))

story.append(body(
    "El siguiente diagrama muestra las relaciones entre los archivos <font face='LibMono'>"
    "src/lib/</font>, las rutas API (<font face='LibMono'>/api/</font>) y los modelos "
    "Prisma consumidos por cada módulo."
))

story.append(spacer(2*mm))
dep_map = """
┌─────────────────────────────────────────────────────────────────────────┐
│                        src/lib/ (Capa de Lógica)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  insights.ts ─────────┬─── /api/insights ────── InsightsPage             │
│  (gatherData,         ├─── /api/emotional-state ─ EmotionalStatePage     │
│   computeWellness,    ├─── /api/weekly-recap ──── WeeklyRecap (email)    │
│   12 reglas)          └─── Motor compartido: módulos 1, 8, 12          │
│       │                                                                │
│       ├── lee: DailyCheckin, HabitLog, MeditationSession,               │
│       │        JournalEntry, WellnessLog, NutritionLog,                 │
│       │        FinanceLog, EmpireProgress                              │
│       └── escribe: NINGUNO (lectura pura)                              │
│                                                                         │
│  emotional-state.ts ──── /api/emotional-state                           │
│       ├── lee: mismo RawData que insights.ts (reutilizado)              │
│       └── 4 estados: enfocado, en_progreso, sobrecargado, estable       │
│                                                                         │
│  life-memory/stages.ts ── /api/life-memory                              │
│       ├── lee: 6 tablas (mismo conjunto que gatherData)                │
│       └── 7 sabores: calm, growth, intensity, dispersion,               │
│           exhaustion, quiet, stability                                 │
│                                                                         │
│  life-memory/observations.ts (timezone bug)                             │
│       └── usa new Date(year, month-1, 1) — SERVIDOR LOCAL              │
│                                                                         │
│  mentor-context.ts ──── /api/ai/chat                                   │
│       ├── consume: insights, life-memory, patterns, silent-memories     │
│       └── 5 capas (PREMIUM) vs contexto básico (FREE)                   │
│                                                                         │
│  groq.ts ─────────────── /api/ai/chat                                   │
│       └── llama-3.3-70b-versatile via API Groq                         │
│                                                                         │
│  patterns/detector.ts ─ /api/patterns                                   │
│       ├── lee: FinanceLog (OBLIGATORIO, min 4 puntos)                  │
│       └── correlación Pearson sobre agregados semanales                 │
│                                                                         │
│  monthly-closure/digest.ts ── /api/monthly-closure                      │
│       ├── 5 sub-motores: IntentionBalance, FinancialSummary,            │
│       │   Rhythm, Memories, Evolution                                   │
│       └── sin IA — "silence is the design"                             │
│                                                                         │
│  notifications/ ─────── /api/cron/* (3 rutas idénticas)                │
│       ├── service.ts, scheduler.ts, templates.ts                       │
│       └── BATCH_SIZE=100 sin paginación                                │
│                                                                         │
│  challenge-auto-complete.ts ── /api/habits (lado del servidor)         │
│       └── detecta auto-completar retos al marcar hábitos               │
│                                                                         │
│  limits.ts ────────────── /api/ai/chat                                  │
│       └── FREE: 15 msg/día | PREMIUM: ilimitado                        │
│                                                                         │
│  server/silent-memories.ts ── consumido por mentor-context.ts          │
│       └── max 2 memorias inyectadas en contexto del mentor              │
└─────────────────────────────────────────────────────────────────────────┘"""
story.append(Paragraph(dep_map.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>"), S_DIAGRAM))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 5. DIAGRAMA DE FLUJO DE DATOS
# ════════════════════════════════════════════════════════════════════
story.append(h1("5. Diagrama de Flujo de Datos"))

story.append(body(
    "El <b>DailyCheckin</b> es el punto de entrada primario de datos del sistema. "
    "Cada check-in genera datos que son consumidos por hasta 9 módulos downstream. "
    "A continuación se muestra la propagación:"
))

story.append(spacer(2*mm))
flow_diagram = """
                    ┌──────────────┐
                    │  POST /api/  │
                    │   checkin    │
                    │ (5 campos +  │
                    │  XP +10)     │
                    └──────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  DailyCheckin   │  ← Modelo Prisma (escritura)
                  │  (emotion,      │
                  │  energy, focus, │
                  │  stress, note)  │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────────────────────┐
              │            │                            │
              ▼            ▼                            ▼
     ┌────────────┐  ┌──────────┐  ┌──────────────────────┐
     │ gatherData │  │  Estados │  │  Mentor IA            │
     │ (insights) │  │Emocional │  │  (mentor-context.ts)  │
     │ 14 queries │  │ (6       │  │  Lee: checkin + 6     │
     │ en paralelo│  │ métricas)│  │  tablas + memorias    │
     └─────┬──────┘  └────┬─────┘  └──────────┬───────────┘
           │              │                   │
     ┌─────┼──────┐      │            ┌──────┴──────┐
     ▼     ▼      ▼      ▼            ▼             ▼
  Insights Dashboard Memoria  Silent   Groq        Límites
  (12    (Mom.)   de Vida  Memories  LLM         FREE/PREMIUM
  reglas) (Mome.) (7 etapa.)
                    │
              ┌─────┼──────┐
              ▼     ▼      ▼
          Cierre  Patrones Recomend.
          Mensual (requiere (hardcoded
          (5 sub- FinanceLog) frases)
           motores)

  ── Consumidores adicionales ──
  • Hábitos: usa checkin para trigger de retos
  • Notificaciones: NO consume checkin (plantillas estáticas)
  • Logros: usa checkin para desbloqueo de achievements"""
story.append(Paragraph(flow_diagram.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>"), S_DIAGRAM))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 6. ANÁLISIS POR MÓDULO
# ════════════════════════════════════════════════════════════════════
story.append(h1("6. Análisis por Módulo"))
story.append(small("Cada módulo se analiza con sus archivos clave, fuentes de datos, "
    "uso de datos reales, diferenciación FREE/PREMIUM y hallazgos con severidad."))

# ── MÓDULO 1: Observaciones (Insights) ─────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("01", "Observaciones (Insights)"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/insights.ts, src/app/api/insights/route.ts, "
        "src/app/(dashboard)/insights/page.tsx"),
    ("Fuente de datos", "DailyCheckin, HabitLog, MeditationSession, JournalEntry, "
        "WellnessLog, NutritionLog, FinanceLog, EmpireProgress"),
    ("¿Usa datos reales?", "SÍ — gatherData() ejecuta 14 consultas Prisma en paralelo "
        "con datos auténticos del usuario"),
    ("FREE vs PREMIUM", "FREE: máx. 3 insights, sin WeeklyComparison. "
        "PREMIUM: máx. 5 insights + WeeklyComparison (tendencias semana sobre semana)"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "Sin IA real: Los 12 insights son reglas hardcodeadas basadas en umbrales "
            "(ej: consistencia > 80%, estrés promedio > 3). No existe modelo de ML ni NLP. "
            "La «inteligencia» es un conjunto de if/else con frases estáticas en español.",
        "file": "src/lib/insights.ts — función generateInsights(), bloques de threshold"
    },
    {
        "sev": "ALTA",
        "desc": "Inconsistencia de zona horaria: /api/dashboard/metrics usa new Date() "
            "para la ventana de 7 días, sin conversión a Madrid. Esto causa que la ventana "
            "de datos sea diferente según la ubicación del servidor, inconsistente con "
            "otros endpoints del Dashboard que sí usan Madrid.",
        "file": "src/app/api/dashboard/metrics/route.ts — función handler(), cálculo de fecha"
    },
    {
        "sev": "MEDIA",
        "desc": "Fórmula de Wellness Score arbitraria: La puntuación de 0-100 asigna pesos "
            "fijos (checkin=20, emocional=20, hábitos=20, meditación=20, journal=10, "
            "wellness=10) sin justificación estadística ni marco de tuning.",
        "file": "src/lib/insights.ts — función computeWellnessScore()"
    },
    {
        "sev": "MEDIA",
        "desc": "No hay persistencia de insights: Los insights se generan on-demand cada "
            "vez, sin caché ni historial. Un usuario que consulta la página dos veces "
            "en el mismo día ve los mismos datos recalculados desde cero (14 queries).",
        "file": "src/app/api/insights/route.ts — handler GET completo"
    },
    {
        "sev": "BAJA",
        "desc": "WeeklyComparison es null para usuarios FREE, pero la estructura del "
            "response JSON siempre incluye el campo, lo que genera payloads innecesarios.",
        "file": "src/app/api/insights/route.ts — construcción del response"
    },
]))

story.append(PageBreak())

# ── MÓDULO 2: Tu Evolución (Dashboard) ─────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("02", "Tu Evolución (Dashboard)"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/app/(dashboard)/dashboard/page.tsx, "
        "src/app/api/dashboard/metrics/route.ts, momentum/route.ts, "
        "progress/route.ts, streaks/route.ts"),
    ("Fuente de datos", "DailyCheckin, HabitLog, MeditationSession, JournalEntry, "
        "WellnessLog, NutritionLog, EmpireProgress, ChallengeCompletion"),
    ("¿Usa datos reales?", "SÍ — Todos los endpoints leen datos reales del usuario"),
    ("FREE vs PREMIUM", "Sin gating explícito en endpoints de Dashboard. "
        "La diferenciación se aplica en componentes frontend (PremiumGate)"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "Inconsistencia de zona horaria entre 4 endpoints del mismo subsistema: "
            "Momentum usa Madrid, Progress usa Madrid, Streaks usa Madrid, pero Metrics "
            "usa new Date() crudo. Un usuario puede ver métricas de 7 días diferentes "
            "en la misma página del Dashboard.",
        "file": "src/app/api/dashboard/metrics/route.ts vs momentum/route.ts vs "
            "progress/route.ts — funciones handler() en cada archivo"
    },
    {
        "sev": "ALTA",
        "desc": "OnboardingRecommendations es código muerto: El componente existe en "
            "src/components/dashboard/OnboardingRecommendations.tsx pero NO se importa "
            "ni se renderiza en dashboard/page.tsx. Nunca se muestra al usuario.",
        "file": "src/components/dashboard/OnboardingRecommendations.tsx — componente completo "
            "(no importado en dashboard/page.tsx)"
    },
    {
        "sev": "MEDIA",
        "desc": "Momentum score con ponderaciones hardcodeadas: 7 factores con puntos "
            "fijos (activity days, habits, checkins, meditation, journal, challenges, "
            "streak bonus). No hay marco de calibración ni A/B testing.",
        "file": "src/app/api/dashboard/momentum/route.ts — función calculateMomentum()"
    },
    {
        "sev": "MEDIA",
        "desc": "Streaks usa max(HabitLog.streak) en lugar de calcStreak para el racha "
            "de hábitos. Esto lee un campo almacenado que podría estar desactualizado "
            "si hubo fallos en la actualización.",
        "file": "src/app/api/dashboard/streaks/route.ts — consulta habitStreak"
    },
    {
        "sev": "BAJA",
        "desc": "El componente EmotionalHero (mostrado en Dashboard) no tiene puerta de "
            "PREMIUM, a pesar de que la API de estados emocionales envía datos de tendencia "
            "solo a PREMIUM.",
        "file": "src/components/dashboard/EmotionalHero.tsx — render sin PremiumGate"
    },
]))

story.append(PageBreak())

# ── MÓDULO 3: Memoria de Vida ─────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("03", "Memoria de Vida"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/life-memory/stages.ts, src/lib/life-memory/observations.ts, "
        "src/app/api/life-memory/route.ts, src/lib/life-memory/copy.ts"),
    ("Fuente de datos", "DailyCheckin, HabitLog, MeditationSession, JournalEntry, "
        "WellnessLog, NutritionLog (mismas 6 tablas que gatherData)"),
    ("¿Usa datos reales?", "SÍ — detectLifeStages() procesa datos mensuales reales"),
    ("FREE vs PREMIUM", "FREE: solo etapas (stages). PREMIUM: transiciones + memorias "
        "+ conexiones de patrones"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "Bug de zona horaria en observations.ts: new Date(year, month-1, 1) "
            "crea la fecha en la zona horaria local del servidor, no en Madrid. "
            "Para un servidor en UTC, esto puede generar un día incorrecto al inicio/final "
            "del mes.",
        "file": "src/lib/life-memory/observations.ts — función getMonthData(), "
            "construcción de fecha de inicio de mes"
    },
    {
        "sev": "MEDIA",
        "desc": "Duplicación de consultas: observations.ts re-consulta las mismas 6 tablas "
            "que /api/patterns (detector.ts). Para un usuario con datos, esto duplica "
            "la carga de BD sin reutilizar el resultado.",
        "file": "src/lib/life-memory/observations.ts — consultas mensuales vs "
            "src/lib/patterns/detector.ts — consultas semanales"
    },
    {
        "sev": "MEDIA",
        "desc": "Clasificación de etapas con umbrales mágicos: totalActivity < 3 → quiet, "
            "avgStress > 3.5 → exhaustion. Los 7 sabores (calm, growth, intensity, "
            "dispersion, exhaustion, quiet, stability) dependen enteramente de estos "
            "números sin documentación de su origen.",
        "file": "src/lib/life-memory/stages.ts — función detectLifeStages(), "
            "bloques de clasificación"
    },
    {
        "sev": "BAJA",
        "desc": "getMadridOffsetMs() tiene el offset de Madrid hardcodeado (+1h/+2h) "
            "en lugar de usar una librería de zonas horarias. Esto fallará con cambios "
            "de horario de verano/invierno si el cálculo del offset no se actualiza.",
        "file": "src/lib/life-memory/stages.ts — función getMadridOffsetMs()"
    },
]))

# ── MÓDULO 4: Cierre Mensual ──────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("04", "Cierre Mensual"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/monthly-closure/digest.ts, src/lib/monthly-closure/copy.ts, "
        "src/app/api/monthly-closure/route.ts"),
    ("Fuente de datos", "DailyCheckin, FinanceLog, HabitLog, JournalEntry, "
        "MeditationSession, WellnessLog, NutritionLog"),
    ("¿Usa datos reales?", "SÍ — los 5 sub-motores leen datos reales del mes"),
    ("FREE vs PREMIUM", "FREE: resumen básico. PREMIUM: evolución + memorias "
        "(sub-motores Evolution + Memories)"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "Sin IA: El módulo usa 5 sub-motores deterministas. La reflexión "
            "NUNCA se envía a IA (documentado explícitamente: 'silence is the design'). "
            "El cierre mensual es un resumen estadístico, no una síntesis inteligente.",
        "file": "src/lib/monthly-closure/digest.ts — comentarios del archivo, "
            "funciones de cada sub-motor"
    },
    {
        "sev": "MEDIA",
        "desc": "Etiquetas de ritmo hardcodeadas: quiet (<10), steady (10-25), "
            "variable (25-50), active (>50). Estos umbrales no tienen base empírica "
            "ni se exponen para ajuste.",
        "file": "src/lib/monthly-closure/digest.ts — función Rhythm, clasificación de ritmo"
    },
    {
        "sev": "BAJA",
        "desc": "Memorias con límites arbitrarios: máx. 5 finance contexto + 3 journal "
            "+ 3 checkin notes, ordenados por fecha. No hay priorización por relevancia.",
        "file": "src/lib/monthly-closure/digest.ts — sub-motor Memories, "
            "consultas con take(5), take(3), take(3)"
    },
]))

story.append(PageBreak())

# ── MÓDULO 5: Mentor IA ───────────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("05", "Mentor IA"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/app/api/ai/chat/route.ts, src/lib/mentor-context.ts, "
        "src/lib/groq.ts, src/lib/limits.ts"),
    ("Fuente de datos", "DailyCheckin, HabitLog, MeditationSession, JournalEntry, "
        "WellnessLog, NutritionLog, FinanceLog, EmotionalDashboardState, "
        "LifeMemory, AIMessages"),
    ("¿Usa datos reales?", "SÍ — El contexto del mentor se construye con datos reales "
        "de 6+ tablas + estado emocional + etapas de vida + patrones"),
    ("FREE vs PREMIUM", "FREE: 15 msg/día, 10 mensajes de historial, temp=0.5, "
        "max 800 tokens, contexto básico. PREMIUM: ilimitado, 30 mensajes, "
        "temp=0.8, max 2048 tokens, 5 capas de contexto"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "Inconsistencia de zona horaria en buildMentorContext(): usa new Date() "
            "crudo para las ventanas de 7/14/30/90 días en lugar de conversión a Madrid. "
            "El contexto enviado al LLM puede contener datos de ventanas temporales "
            "incorrectas para usuarios en Madrid.",
        "file": "src/lib/mentor-context.ts — líneas ~131-132, cálculo de "
            "dateRanges (now - N days)"
    },
    {
        "sev": "MEDIA",
        "desc": "Prompt del sistema: ~40 líneas idénticas entre FREE y PREMIUM; solo ~6 "
            "líneas difieren. La diferencia cualitativa real entre planes es mínima en "
            "términos de instrucciones al modelo.",
        "file": "src/app/api/ai/chat/route.ts — construcción de systemPrompt, "
            "bloques FREE vs PREMIUM"
    },
    {
        "sev": "MEDIA",
        "desc": "incrementAIUsage() en limits.ts es un no-op deprecado: la función existe "
            "pero no ejecuta ninguna operación. El control de límites depende de otro "
            "mecanismo (conteo de mensajes del día).",
        "file": "src/lib/limits.ts — función incrementAIUsage()"
    },
    {
        "sev": "BAJA",
        "desc": "Rollback de límite de IA en fallo de Groq (fix T-2): Si la llamada al "
            "LLM falla, se revierte el conteo de uso del día. Esto es correcto pero "
            "genera una consulta extra a BD en cada fallo.",
        "file": "src/app/api/ai/chat/route.ts — bloque catch, rollback de límites"
    },
    {
        "sev": "BAJA",
        "desc": "Advisory locks para serialización de threads: La protección contra "
            "condiciones de carrera es correcta (checkin XP, AI limit, thread serialization) "
            "pero genera contention en alta concurrencia.",
        "file": "src/app/api/ai/chat/route.ts — pg_advisory_lock calls"
    },
]))

story.append(PageBreak())

# ── MÓDULO 6: Check-in Diario ─────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("06", "Check-in Diario"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/app/api/checkin/route.ts, src/app/(dashboard)/checkin/page.tsx, "
        "src/components/checkin/CheckInModal.tsx"),
    ("Fuente de datos", "Escribe en: DailyCheckin, EmpireProgress. Lee de: User, Challenge"),
    ("¿Usa datos reales?", "SÍ — Es el punto de entrada primario de datos del sistema"),
    ("FREE vs PREMIUM", "Sin diferenciación — completamente disponible para todos los usuarios"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "XP otorgado solo en la primera creación: El checkin otorga +10 XP al "
            "imperio 'mente' solo en POST (creación), no en PATCH (actualización). "
            "Un usuario que actualice su checkin no recibe XP adicional, lo cual es "
            "correcto pero no está documentado en la UI.",
        "file": "src/app/api/checkin/route.ts — handler POST, lógica de awardXP"
    },
    {
        "sev": "MEDIA",
        "desc": "Advisory lock en POST previene condición de carrera (fix M-3): "
            "Correcto para evitar doble otorgamiento de XP en requests concurrentes. "
            "DELETE revierte XP en transacción (fix M-5).",
        "file": "src/app/api/checkin/route.ts — handler POST (advisory lock), "
            "handler DELETE (transacción de reversión)"
    },
    {
        "sev": "BAJA",
        "desc": "No hay validación de rango estricto para los campos numéricos (1-5). "
            "Si el cliente envía valores fuera de rango, el servidor los acepta "
            "(depende de la validación del frontend).",
        "file": "src/app/api/checkin/route.ts — handler POST, desestructuración del body"
    },
]))

# ── MÓDULO 7: Hábitos ─────────────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("07", "Hábitos"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/app/api/habits/route.ts, src/lib/challenge-auto-complete.ts"),
    ("Fuente de datos", "Escribe en: Habit, HabitLog, EmpireProgress, ChallengeCompletion. "
        "Lee de: DailyCheckin, Challenge"),
    ("¿Usa datos reales?", "SÍ — Gestiona hábitos reales con tracking de rachas"),
    ("FREE vs PREMIUM", "Sin gating explícito en la API de hábitos"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "SELECT FOR UPDATE previene inflación de rachas (fix H-3): Correcto "
            "para evitar que dos requests concurrentes incrementen la racha dos veces. "
            "Sin embargo, esto bloquea la fila durante toda la transacción.",
        "file": "src/app/api/habits/route.ts — handler PATCH, SELECT FOR UPDATE"
    },
    {
        "sev": "MEDIA",
        "desc": "Guardia de frecuencia-aware: daily=1, weekly=7, monthly=30 días umbral (H-7). "
            "Impide completar un hábito mensual el día 1 y reclamar racha completa. "
            "Ventana de continuación: diffDays < threshold*2 (H-8).",
        "file": "src/app/api/habits/route.ts — handler PATCH, lógica de frecuencia y racha"
    },
    {
        "sev": "BAJA",
        "desc": "Cambio de frecuencia resetea racha a 0 (H-9): Si un usuario cambia un "
            "hábito de diario a semanal, pierde toda su racha. Esto puede ser frustrante "
            "y no tiene confirmación en la UI.",
        "file": "src/app/api/habits/route.ts — handler PATCH, detección de cambio de frecuencia"
    },
    {
        "sev": "BAJA",
        "desc": "DELETE revierte XP y decrementa racha si el hábito eliminado era el "
            "trigger del día (H-12): Lógica correcta pero compleja, con dependencia "
            "del estado del EmpireProgress.",
        "file": "src/app/api/habits/route.ts — handler DELETE, lógica de reversión"
    },
    {
        "sev": "BAJA",
        "desc": "Racha de imperio se incrementa solo una vez por día activo Madrid (H-10, H-11): "
            "Usa la técnica 'noon UTC' para determinar el día Madrid. Correcto pero "
            "depende de que el servidor tenga reloj sincronizado.",
        "file": "src/app/api/habits/route.ts — lógica de empire streak, getMadridDateKey()"
    },
]))

story.append(PageBreak())

# ── MÓDULO 8: Estados Emocionales ─────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("08", "Estados Emocionales"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/app/api/emotional-state/route.ts, src/lib/emotional-state.ts, "
        "src/components/dashboard/EmotionalHero.tsx"),
    ("Fuente de datos", "Reutiliza RawData de insights.ts (DailyCheckin, HabitLog, "
        "MeditationSession, JournalEntry, WellnessLog, NutritionLog, FinanceLog)"),
    ("¿Usa datos reales?", "SÍ — Calcula 6 métricas desde datos reales del usuario"),
    ("FREE vs PREMIUM", "PREMIUM: dirección de tendencia (up/down/stable). "
        "FREE: sin tendencia. Recomendaciones: PREMIUM gets trend-aware variants"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "Motor de recomendaciones con ~10 frases hardcodeadas en español basadas "
            "en umbrales. No hay IA ni personalización contextual. Las frases se "
            "seleccionan por rangos numéricos (energy >= 65 + focus >= 65 + stress >= 60 "
            "→ 'enfocado').",
        "file": "src/lib/emotional-state.ts — funciones getRecommendation() y getSummary()"
    },
    {
        "sev": "MEDIA",
        "desc": "4 estados con umbrales rígidos: enfocado, en_progreso, sobrecargado, "
        "estable. Un usuario con energy=64 y focus=64 se clasifica diferente a uno "
        "con 65/65, sin zona de transición.",
        "file": "src/lib/emotional-state.ts — función computeStatus(), "
            "umbrales de clasificación"
    },
    {
        "sev": "BAJA",
        "desc": "EmotionalHero en Dashboard muestra el estado sin puerta PREMIUM: "
            "Cualquier usuario ve su estado emocional completo, incluyendo la "
            "recomendación (que en FREE es la versión genérica sin tendencia).",
        "file": "src/components/dashboard/EmotionalHero.tsx — render del componente"
    },
]))

# ── MÓDULO 9: Notificaciones ──────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("09", "Notificaciones"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/notifications/service.ts, scheduler.ts, templates.ts, "
        "types.ts, src/lib/notifications/reminders/checkin.ts, daily.ts, reflection.ts, "
        "src/app/api/cron/checkin-reminder/route.ts, daily-reminder/route.ts, "
        "reflection-reminder/route.ts"),
    ("Fuente de datos", "Lee: User, NotificationPreference, NotificationLog, "
        "DailyCheckin (último checkin). Escribe: NotificationLog"),
    ("¿Usa datos reales?", "PARCIALMENTE — Lee si el usuario hizo checkin hoy, "
        "pero las plantillas NO contienen datos del usuario"),
    ("FREE vs PREMIUM", "Sin diferenciación en notificaciones"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "BATCH_SIZE = 100 sin paginación: Los 3 cron jobs de notificaciones "
            "procesan máximo 100 usuarios por ejecución. Usuarios más allá del puesto "
            "100 son silenciosamente ignorados. Para >100 usuarios activos, las "
            "notificaciones nunca llegan a todos.",
        "file": "src/lib/notifications/service.ts — constante BATCH_SIZE = 100; "
            "src/lib/notifications/scheduler.ts — lógica de procesamiento por lotes"
    },
    {
        "sev": "ALTA",
        "desc": "Cero personalización en plantillas: 7 checkin + 7 reflection + 3 "
            "weekly_recap + 4 comeback + 7 daily = 28 plantillas, TODAS en español "
            "estático. No incluyen nombre de usuario, métricas, ni contexto. La "
            "selección es por hash determinista de la fecha Madrid, no por perfil.",
        "file": "src/lib/notifications/templates.ts — todas las funciones de plantilla"
    },
    {
        "sev": "ALTA",
        "desc": "Notificaciones diferidas NO se entregan: La infraestructura para "
            "entregar notificaciones pospuestas (quiet hours) no está implementada. "
            "Las notificaciones diferidas se pierden permanentemente.",
        "file": "src/lib/notifications/scheduler.ts — manejo de deferred, "
            "comentario: 'infrastructure not implemented'"
    },
    {
        "sev": "MEDIA",
        "desc": "Quiet hours con defer bruto de 10 horas: En lugar de calcular la "
            "próxima ventana activa, las notificaciones se posponen 10 horas fijas. "
            "Documentado como deuda técnica.",
        "file": "src/lib/notifications/scheduler.ts — lógica de quiet hours"
    },
    {
        "sev": "MEDIA",
        "desc": "Toggle de tipo 'daily' hardcodeado a true en scheduler: La opción "
            "de desactivar notificaciones diarias no funciona porque el scheduler "
            "fuerza el tipo a true.",
        "file": "src/lib/notifications/scheduler.ts — variable daily toggle"
    },
    {
        "sev": "MEDIA",
        "desc": "3 rutas cron estructuralmente idénticas (copy-paste): "
            "checkin-reminder, daily-reminder y reflection-reminder comparten la misma "
            "estructura con diferencias mínimas. Patrón de duplicación.",
        "file": "src/app/api/cron/checkin-reminder/route.ts, daily-reminder/route.ts, "
            "reflection-reminder/route.ts — estructura completa de cada archivo"
    },
    {
        "sev": "BAJA",
        "desc": "NotificationPreference.streakReminders está deprecado: El campo "
            "existe en el schema pero está marcado como 'DEPRECATED: removed from UI "
            "and API'. Las notificaciones de racha fueron eliminadas por decisión de diseño.",
        "file": "prisma/schema.prisma — modelo NotificationPreference, campo streakReminders"
    },
]))

story.append(PageBreak())

# ── MÓDULO 10: Recomendaciones ────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("10", "Recomendaciones"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/components/dashboard/WeeklyRecap.tsx, "
        "src/components/dashboard/OnboardingRecommendations.tsx, "
        "src/lib/emails/weekly-recap.ts"),
    ("Fuente de datos", "Lee: datos pasados vía props desde el Dashboard. "
        "OnboardingRecommendations lee de OnboardingData"),
    ("¿Usa datos reales?", "PARCIALMENTE — WeeklyRecap usa datos de tendencia. "
        "OnboardingRecommendations usa datos de onboarding (no datos vivos)"),
    ("FREE vs PREMIUM", "PREMIUM: variantes con tendencia (stress up, energy+emotion "
        "improved, activity change). FREE: versiones genéricas sin tendencia"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "OnboardingRecommendations es código muerto: El componente existe pero "
            "NO se renderiza en ninguna página. Importado en ningún lugar del Dashboard. "
            "Contiene datos de onboarding (primaryFocus, stress/energy/focus) que nunca "
            "se muestran al usuario.",
        "file": "src/components/dashboard/OnboardingRecommendations.tsx — componente completo; "
            "src/app/(dashboard)/dashboard/page.tsx — sin importación del componente"
    },
    {
        "sev": "MEDIA",
        "desc": "generateMentorRecommendation retorna 1 de ~8 frases hardcodeadas en "
            "español. No hay IA involucrada. La recomendación semanal es un selección "
            "determinista por condición de umbral.",
        "file": "src/components/dashboard/WeeklyRecap.tsx — función "
            "generateMentorRecommendation()"
    },
    {
        "sev": "MEDIA",
        "desc": "Parámetro 'plan' aceptado pero NUNCA usado en recomendaciones por email: "
            "La función de email acepta un parámetro plan pero no lo utiliza para "
            "personalizar el contenido.",
        "file": "src/lib/emails/weekly-recap.ts — firma de función con parámetro plan"
    },
]))

# ── MÓDULO 11: Sistema de Patrones ────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("11", "Sistema de Patrones"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/patterns/detector.ts, src/lib/patterns/validation.ts, "
        "src/lib/patterns/copy.ts, src/lib/patterns/types.ts, "
        "src/app/api/patterns/route.ts"),
    ("Fuente de datos", "FinanceLog (OBLIGATORIO, min 4 puntos), WellnessLog, "
        "DailyCheckin, HabitLog, NutritionLog"),
    ("¿Usa datos reales?", "SÍ — Usa datos reales con correlación de Pearson"),
    ("FREE vs PREMIUM", "FREE: solo PremiumPreview (35% opacidad). "
        "PREMIUM: patrones completos con peso y cache por localStorage"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "REQUIERE datos financieros obligatoriamente: Ningún patrón se detecta "
            "sin al menos 4 puntos de FinanceLog. Usuarios sin actividad financiera "
            "no ven NINGÚN patrón, incluso si tienen datos ricos en meditación, "
            "journal, hábitos y emociones.",
        "file": "src/lib/patterns/detector.ts — MIN_DATA_POINTS_PER_EMPIRE = 4, "
            "requerimiento de FinanceLog"
    },
    {
        "sev": "ALTA",
        "desc": "Solo 4 tipos de conexión: finanzas-energia, finanzas-mente, "
            "finanzas-estres, finanzas-sueño. No existen patrones que conecten "
            "meditación+journal, hábitos+sueño, journal+emociones. El detector "
            "está limitado a correlaciones financieras.",
        "file": "src/lib/patterns/detector.ts — definición de los 5 detectores, "
            "tipos de conexión en PATTERN_CONNECTIONS"
    },
    {
        "sev": "MEDIA",
        "desc": "Pull de 90 días con take(200) finance y take(90) wellness sin "
            "paginación: Para usuarios con datos densos, se pierden registros "
            "antiguos y la correlación puede ser incompleta.",
        "file": "src/lib/patterns/detector.ts — consultas Prisma con take limits"
    },
    {
        "sev": "MEDIA",
        "desc": "Filtro filosófico 'Si hay duda, NO mostrar nada': MIN_CONFIDENCE = 0.55. "
            "Este umbral es conservador pero no está justificado con datos empíricos. "
            "El filtro de solapamiento semántico previene patrones redundantes.",
        "file": "src/lib/patterns/validation.ts — constantes MIN_CONFIDENCE, "
            "función de validación"
    },
    {
        "sev": "BAJA",
        "desc": "Cache en localStorage con peso: profunda=4 semanas, relevante=2 "
            "semanas, ligera=1 semana. Cache puramente client-side, se pierde al "
            "cambiar de dispositivo o limpiar datos del navegador.",
        "file": "src/lib/patterns/types.ts — definición de PatternWeight; "
            "componente LifePatternsSection.tsx — lógica de cache"
    },
]))

story.append(PageBreak())

# ── MÓDULO 12: Motor de Insights (compartido) ─────────────────────
story.append(spacer(4*mm))
story.append(module_header("12", "Motor de Insights (motor compartido)"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/insights.ts (mismo archivo que Módulo 1)"),
    ("Fuente de datos", "DailyCheckin, HabitLog, MeditationSession, JournalEntry, "
        "WellnessLog, NutritionLog, FinanceLog, EmpireProgress"),
    ("¿Usa datos reales?", "SÍ — gatherData() es el origen único de datos para "
        "Observaciones, Estados Emocionales y Weekly Recap"),
    ("FREE vs PREMIUM", "Comparte la misma diferenciación del Módulo 1 y Módulo 8"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "gatherData() es un punto singular de fallo: Si una de las 14 consultas "
            "en paralelo falla, toda la función falla. No hay fallback parcial ni "
            "graceful degradation. Sin embargo, la optimización de compartir datos "
            "entre weekly-recap e insights (14 queries en vez de 28) es correcta.",
        "file": "src/lib/insights.ts — función gatherData(), Promise.all con 14 consultas"
    },
    {
        "sev": "BAJA",
        "desc": "El Weekly Recap API reutiliza gatherData() correctamente: 14 queries "
        "en vez de 28. Esto es una optimización válida que evita duplicar la carga "
        "en la base de datos.",
        "file": "src/app/api/weekly-recap/route.ts — uso compartido de gatherData()"
    },
]))

# ── MÓDULO 13: Silent Memories ────────────────────────────────────
story.append(spacer(4*mm))
story.append(module_header("13", "Silent Memories"))
story.append(spacer(3*mm))

story.append(meta_table([
    ("Archivo(s) clave", "src/lib/server/silent-memories.ts, src/lib/server/silent-memory-state.ts, "
        "src/lib/silent-memories/shared.ts, src/lib/client/silent-memories.ts, "
        "src/app/api/silent-memories/route.ts"),
    ("Fuente de datos", "Lee: EmotionalDashboardState.memoryState. Escribe: "
        "EmotionalDashboardState (estado silencioso)"),
    ("¿Usa datos reales?", "SÍ — Se construye desde datos de estado emocional y "
        "observaciones de vida"),
    ("FREE vs PREMIUM", "Consumido por Mentor IA — la diferenciación se aplica "
        "en el contexto del mentor (módulo 5)"),
]))

story.append(spacer(2*mm))
story.append(h3("Hallazgos"))

story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "No es una página independiente ni una API accesible: Silent Memories "
            "es un subsistema consumido exclusivamente por mentor-context.ts. No tiene "
            "interfaz propia ni endpoint de consulta directa para el usuario.",
        "file": "src/lib/mentor-context.ts — sección de Silent Memories en buildMentorContext()"
    },
    {
        "sev": "MEDIA",
        "desc": "Deduplicación: las observaciones de cambio (shift) se omiten cuando "
            "el Estado Emocional Establecido (ESE) está activo. Prioridad: temporal(5) "
            "> presencia(4) > retorno(3) > recurrencia(2) > cambio(1).",
        "file": "src/lib/server/silent-memories.ts — lógica de deduplicación y prioridad"
    },
    {
        "sev": "BAJA",
        "desc": "Máximo 2 memorias inyectadas en contexto del mentor: Límite arbitrario "
            "que puede omitir memorias relevantes si hay más de 2 candidatas.",
        "file": "src/lib/mentor-context.ts — sección de Silent Memories, "
            "slice(0, 2) o equivalente"
    },
    {
        "sev": "BAJA",
        "desc": "EmotionalDashboardState.reflectionState es campo muerto: Documentado como "
            "'reflections system has been removed... no code reads or writes it'. El campo "
            "existe en el estado pero nunca se utiliza.",
        "file": "src/lib/server/silent-memory-state.ts — tipo EmotionalDashboardState, "
            "campo reflectionState"
    },
]))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 7. HALLAZGOS TRANSVERSALES
# ════════════════════════════════════════════════════════════════════
story.append(h1("7. Hallazgos Transversales"))

# 7.1 Placebo fields
story.append(h2("7.1 Campos placebo en el schema"))
story.append(body(
    "Se identificó un campo documentado explícitamente como placebo en el esquema Prisma:"
))
story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "User.dailyReminders está documentado como 'PLACEBO: stored but never "
            "consumed by any backend logic'. El campo se almacena en BD pero ningún "
            "módulo lo lee ni procesa. Ocupa espacio y genera confusión en el schema.",
        "file": "prisma/schema.prisma — modelo User, línea ~24, campo dailyReminders"
    },
]))

# 7.2 Dead code
story.append(h2("7.2 Código muerto"))
story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "OnboardingRecommendations: componente completo importado en ningún lugar "
            "del dashboard. Nunca se renderiza.",
        "file": "src/components/dashboard/OnboardingRecommendations.tsx"
    },
    {
        "sev": "MEDIA",
        "desc": "POST_CHECKIN_BUFFER_MS y MIN_CRON_INTERVAL_MS en reflection.ts: "
            "constantes definidas pero nunca referenciadas en ninguna función.",
        "file": "src/lib/notifications/reminders/reflection.ts — definición de constantes"
    },
    {
        "sev": "BAJA",
        "desc": "incrementAIUsage() en limits.ts: función deprecada que no ejecuta "
            "ninguna operación (no-op).",
        "file": "src/lib/limits.ts — función incrementAIUsage()"
    },
    {
        "sev": "BAJA",
        "desc": "NotificationPreference.streakReminders: campo deprecado, eliminado de "
            "la UI y la API. Todavía existe en el schema.",
        "file": "prisma/schema.prisma — modelo NotificationPreference"
    },
    {
        "sev": "BAJA",
        "desc": "EmotionalDashboardState.reflectionState: 'reflections system has been "
            "removed... no code reads or writes it'. Campo huérfano en el tipo.",
        "file": "src/lib/server/silent-memory-state.ts — tipo EmotionalDashboardState"
    },
]))

# 7.3 Timezone inconsistencies
story.append(h2("7.3 Inconsistencias de zona horaria"))
story.append(body(
    "El sistema está diseñado para zona horaria Europa/Madrid, pero existen 4 puntos "
    "donde se usa <font face='LibMono'>new Date()</font> sin conversión:"
))
story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "/api/dashboard/metrics usa new Date() para ventana de 7 días — "
            "inconsistente con momentum, progress y streaks que sí usan Madrid.",
        "file": "src/app/api/dashboard/metrics/route.ts — handler(), cálculo de fecha"
    },
    {
        "sev": "ALTA",
        "desc": "life-memory/observations.ts usa new Date(year, month-1, 1) — "
            "genera fecha en zona del servidor, no Madrid.",
        "file": "src/lib/life-memory/observations.ts — getMonthData()"
    },
    {
        "sev": "ALTA",
        "desc": "buildMentorContext() usa new Date() para ventanas 7/14/30/90 días — "
            "el contexto del mentor puede contener datos de ventanas incorrectas.",
        "file": "src/lib/mentor-context.ts — líneas ~131-132, dateRanges"
    },
    {
        "sev": "MEDIA",
        "desc": "weekly-recap-sender.ts asume Madrid para todos los usuarios — no hay "
            "soporte para zonas horarias personalizadas.",
        "file": "src/lib/weekly-recap-sender.ts — lógica de fecha"
    },
]))

# 7.4 Hardcoded thresholds
story.append(h2("7.4 Umbrales hardcodeados sin marco de tuning"))
story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "Clasificación de etapas de vida: totalActivity < 3 → quiet, "
            "avgStress > 3.5 → exhaustion. 7 sabores dependen de números mágicos.",
        "file": "src/lib/life-memory/stages.ts — detectLifeStages()"
    },
    {
        "sev": "MEDIA",
        "desc": "Estado emocional: energy >= 65 + focus >= 65 + stress >= 60 → enfocado. "
            "4 estados con umbrales rígidos sin zonas de transición.",
        "file": "src/lib/emotional-state.ts — computeStatus()"
    },
    {
        "sev": "MEDIA",
        "desc": "Detección de patrones: MIN_CONFIDENCE = 0.55, MIN_DATA_POINTS_PER_EMPIRE = 4. "
            "Sin justificación empírica para estos valores.",
        "file": "src/lib/patterns/validation.ts — constantes"
    },
    {
        "sev": "BAJA",
        "desc": "Etiquetas de ritmo en cierre mensual: <10 quiet, 10-25 steady, "
            "25-50 variable, >50 active.",
        "file": "src/lib/monthly-closure/digest.ts — Rhythm"
    },
    {
        "sev": "BAJA",
        "desc": "Puntuación de momentum: allocations de puntos fijas por factor "
            "(activity days, habits, checkins, meditation, journal, challenges, streak).",
        "file": "src/app/api/dashboard/momentum/route.ts — calculateMomentum()"
    },
]))

# 7.5 Missing personalization
story.append(h2("7.5 Ausencia de personalización"))
story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "Plantillas de notificaciones: 28 plantillas en español estático, "
            "sin nombre de usuario, métricas ni datos contextuales. Selección por "
            "hash determinista de fecha, no por perfil de usuario.",
        "file": "src/lib/notifications/templates.ts — todas las funciones de plantilla"
    },
    {
        "sev": "MEDIA",
        "desc": "Recomendaciones por email: parámetro 'plan' aceptado pero NUNCA "
            "utilizado para personalizar el contenido del email semanal.",
        "file": "src/lib/emails/weekly-recap.ts — firma con parámetro plan sin uso"
    },
    {
        "sev": "MEDIA",
        "desc": "ReturnTrigger: puramente localStorage en el cliente, sin API, "
            "sin personalización. El componente detecta ausencia del usuario pero "
            "no usa datos del backend para personalizar el mensaje.",
        "file": "src/components/dashboard/ReturnTrigger.tsx — lógica completa"
    },
]))

# 7.6 Scalability concerns
story.append(h2("7.6 Preocupaciones de escalabilidad"))
story.extend(finding_block([
    {
        "sev": "ALTA",
        "desc": "BATCH_SIZE = 100 en todos los cron jobs de notificaciones sin cursor "
            "ni paginación. Para >100 usuarios activos, las notificaciones no llegan "
            "a todos los destinatarios.",
        "file": "src/lib/notifications/service.ts — BATCH_SIZE = 100; "
            "src/lib/notifications/scheduler.ts — procesamiento por lotes"
    },
    {
        "sev": "MEDIA",
        "desc": "weekly-recap-sender no tiene límite de usuarios (a diferencia de los "
            "crons de notificaciones que sí tienen BATCH_SIZE). Para bases de datos "
            "grandes, esto puede causar OOM o timeout.",
        "file": "src/lib/weekly-recap-sender.ts — consulta de todos los usuarios sin paginación"
    },
    {
        "sev": "MEDIA",
        "desc": "Detección de patrones: pull de 90 días con take(200) finance y take(90) "
            "wellness sin paginación. Datos densos pueden truncar resultados.",
        "file": "src/lib/patterns/detector.ts — consultas con take limits"
    },
]))

# 7.7 Screenshot data inconsistencies
story.append(h2("7.7 Inconsistencias en datos de captura de pantalla"))
story.extend(finding_block([
    {
        "sev": "MEDIA",
        "desc": "Estadísticas de logros: dice 14 desbloqueados pero el array tiene 13. "
            "Total de logros: las estadísticas dicen 45 pero el array tiene 30.",
        "file": "src/lib/screenshot-data.ts — datos de achievements"
    },
    {
        "sev": "BAJA",
        "desc": "SCREENSHOT_REFLECTION === SCREENSHOT_PREMIUM_REFLECTION: los datos de "
            "captura para reflejos FREE y PREMIUM son idénticos (duplicados).",
        "file": "src/lib/screenshot-data.ts — constantes de screenshot"
    },
    {
        "sev": "BAJA",
        "desc": "Solo existe variante PREMIUM de datos de captura. No hay datos de "
            "captura específicos para usuarios FREE.",
        "file": "src/lib/screenshot-data.ts — estructura de datos"
    },
]))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 8. CONCLUSIÓN
# ════════════════════════════════════════════════════════════════════
story.append(h1("8. Conclusión"))

story.append(body(
    "El «motor inteligente» de VitaZen es, en su estado actual (commit <b>6cf24f7</b>), "
    "un sistema <b>predominantemente basado en reglas determinísticas</b> con una capa "
    "de IA limitada a un único punto de contacto: el Mentor IA (Groq llama-3.3-70b-versatile). "
    "De los 13 módulos auditados, 12 operan exclusivamente mediante umbrales numéricos "
    "hardcodeados, consultas SQL directas y texto estático en español."
))
story.append(body(
    "La <b>personalización es real pero superficial</b>. El sistema sí utiliza datos "
    "auténticos del usuario: el check-in diario alimenta 9 de 13 módulos, y la función "
    "gatherData() ejecuta 14 consultas en paralelo para construir una vista integral. "
    "Sin embargo, la inteligencia aplicada a esos datos se reduce a comparaciones contra "
    "umbrales fijos y selección de frases pre-escritas. No existe aprendizaje, adaptación "
    "ni modelo predictivo."
))
story.append(body(
    "La <b>diferenciación FREE vs PREMIUM es principalmente cuantitativa</b>: más insights "
    "(3→5), más historial de chat (10→30), tendencias adicionales. La única diferencia "
    "cualitativa significativa es la arquitectura de 5 capas de contexto en el Mentor IA "
    "PREMIUM, que proporciona información substancialmente más rica al LLM."
))
story.append(body(
    "Los <b>hallazgos más críticos</b> son:"
))

critical_findings = [
    "4 inconsistencias de zona horaria que causan ventanas de datos incorrectas",
    "Sistema de notificaciones con BATCH_SIZE=100 que silenciosamente ignora usuarios excedentes",
    "0 personalización en plantillas de notificaciones (texto estático puro)",
    "Detector de patrones inútil sin datos financieros (obligatorio FinanceLog)",
    "5 elementos de código muerto identificados incluyendo un campo placebo en el schema",
    "Notificaciones diferidas que nunca se entregan (infraestructura no implementada)",
]
for i, f in enumerate(critical_findings, 1):
    story.append(body_indent(f"<b>{i}.</b> {f}"))

story.append(spacer(4*mm))
story.append(body(
    "La <b>arquitectura de concurrencia es sólida</b>: advisory locks en check-in, SELECT FOR "
    "UPDATE en hábitos, y serialización de threads de IA protegen contra condiciones de "
    "carrera. Los fixes documentados (M-3, M-5, H-3, H-7, H-8, H-9, H-10, H-11, H-12, T-2) "
    "demuestran un proceso de maduración activo."
))
story.append(body(
    "En resumen: VitaZen tiene una base de datos bien estructurada y un flujo de datos "
    "genuino entre módulos, pero el «motor inteligente» es mayormente <b>cosmético</b>. "
    "La verdadera inteligencia se limita a un wrapper de LLM con contexto rico. Para "
    "transformar esto en un sistema genuinamente inteligente, se requeriría: (1) eliminar "
    "las 4 inconsistencias de zona horaria, (2) implementar personalización en notificaciones, "
    "(3) añadir un marco de tuning para los umbrales hardcodeados, (4) eliminar código muerto "
    "y campos placebo, (5) expandir el detector de patrones más allá de finanzas, y "
    "(6) añadir paginación a los cron jobs de notificaciones."
))

story.append(spacer(8*mm))
story.append(hr())
story.append(spacer(2*mm))
story.append(Paragraph(
    "Fin del informe — Auditoría READ-ONLY completada el 2026-07-11 — Commit 6cf24f7",
    ParagraphStyle("end", fontName="LibSans-Italic", fontSize=9, textColor=C_LIGHT_GRAY,
        alignment=TA_CENTER)
))

# ── Build PDF ──────────────────────────────────────────────────────
doc.build(story, onFirstPage=add_cover_footer, onLaterPages=add_page_number)
print(f"PDF generado exitosamente: {OUTPUT_FILE}")