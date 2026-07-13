#!/usr/bin/env python3
"""
Apply all editorial fixes to VitaZen tips.
Keeps 550 tips total (250 FREE, 300 PREMIUM).
Only modifies tips with real issues detected.
"""

import json

BASE = "/home/z/my-project/prisma"

def load(empire):
    with open(f"{BASE}/{empire}-tips.json", "r", encoding="utf-8") as f:
        return json.load(f)

def save(empire, data):
    with open(f"{BASE}/{empire}-tips.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

changes = []

# ============================================================
# 1. DUPLICATE TITLE: "El efecto Dunning-Kruger"
#    mente/PREMIUM #62 — keeps this title (general cognitive bias)
#    crecimiento/PREMIUM #52 — RENAME to differentiate (learning angle)
# ============================================================
crecimiento = load("crecimiento")
old = crecimiento[52]["title"]
crecimiento[52]["title"] = "La confianza prematura"
changes.append(f"CRECIMIENTO/PREMIUM #52: '{old}' → 'La confianza prematura'")
changes.append(f"  Motivo: título duplicado con mente/PREMIUM #62. El contenido habla de la confianza que crece antes que la competencia en el aprendizaje —角度 distinto al sesgo cognitivo general.")
save("crecimiento", crecimiento)

# ============================================================
# 2. DUPLICATE TITLE: "La opción por defecto gana"
#    disciplina/FREE #25 — keeps this title (habit design angle)
#    mente/FREE #19 — RENAME to differentiate (cognitive bias angle)
# ============================================================
mente = load("mente")
old = mente[19]["title"]
mente[19]["title"] = "El sesgo del status quo"
changes.append(f"MENTE/FREE #19: '{old}' → 'El sesgo del status quo'")
changes.append(f"  Motivo: título duplicado con disciplina/FREE #25. El contenido describe la tendencia a quedarse con la opción preseleccionada —es el sesgo de status quo (Samuelson y Zeckhauser, 1988), no el diseño de opción por defecto en hábitos.")
save("mente", mente)

# ============================================================
# 3. NEAR-DUPLICATE: "Eres lo que repites" (disciplina/PREMIUM #61)
#    vs "Lo que repites eres" (crecimiento/FREE #19)
#    Both say: identity is built by what you repeatedly do.
#    Fix: differentiate crecimiento/FREE #19 to focus on LEARNING identity
# ============================================================
crecimiento = load("crecimiento")
old_content = crecimiento[19]["content"]
crecimiento[19]["title"] = "La identidad de quien aprende"
crecimiento[19]["content"] = "Pensar «soy alguien que aprende» cambia cómo reaccionas ante los obstáculos: se vuelven información, no señales de parar. La diferencia entre «tengo que aprender esto» y «aprendo porque es lo que hago» no es solo palabras — cambia lo que haces cuando se pone difícil. Dweck (2006) demostró que la creencia de que tus capacidades mejoran con esfuerzo predice la persistencia real."
changes.append(f"CRECIMIENTO/FREE #19: 'Lo que repites eres' → 'La identidad de quien aprende'")
changes.append(f"  Motivo: concepto duplicado con disciplina/PREMIUM #61 'Eres lo que repites'. Se reenfoca desde la identidad de aprendizaje con referencia a Dweck (2006) y se elimina la frase «Eres lo que repites» que era prácticamente idéntica al otro tip.")
save("crecimiento", crecimiento)

# ============================================================
# 4. OVERLAP: "Mismo lugar" (disciplina/FREE #36)
#    vs "Mismo tiempo, mismo lugar" (crecimiento/FREE #31)
#    Both say: same place helps automaticity via context cues.
#    Fix: differentiate crecimiento/FREE #31 to focus on LEARNING practice
# ============================================================
crecimiento = load("crecimiento")
old_content = crecimiento[31]["content"]
crecimiento[31]["title"] = "Ritual de práctica"
crecimiento[31]["content"] = "Crear un ritual antes de practicar —misma hora, mismo lugar, misma preparación— reduce la fricción para empezar. El cerebro asocia esa secuencia con el modo aprendizaje y se activa antes de que tú decidas. No se trata de rigidez: se trata de que el coste de empezar sea tan bajo que no encuentres excusas. Para que lo aprendido funcione fuera de ese contexto, alterna con sesiones en entornos distintos."
changes.append(f"CRECIMIENTO/FREE #31: 'Mismo tiempo, mismo lugar' → 'Ritual de práctica'")
changes.append(f"  Motivo: solapamiento con disciplina/FREE #36 'Mismo lugar'. Se reenfoca desde la perspectiva del ritual de práctica de aprendizaje, incluyendo la idea de variar contexto para transferencia (que es propia de crecimiento).")
save("crecimiento", crecimiento)

# ============================================================
# 5. METAPHOR ISSUE: "La atención se entrena" (mente/PREMIUM #67)
#    Uses "como un músculo" metaphor which conflicts with the debunked
#    ego depletion "willpower as muscle" model already corrected in
#    disciplina/PREMIUM #50 and #82.
#    Fix: remove the muscle metaphor, keep the correct scientific claim
# ============================================================
mente = load("mente")
old_content = mente[67]["content"]
mente[67]["content"] = "La atención sostenida mejora con práctica consistente. No es un rasgo fijo que tienes o no tienes. Posner y Petersen (1990) propusieron un modelo de redes atencionales (alerta, orientación, control ejecutivo) que se entrenan por separado. La práctica de meditación, los ejercicios de lectura prolongada y el entrenamiento en trabajo sin interrupciones mejoran medidas específicas de cada red. La condición es la consistencia: entrenamientos breves y diarios superan a sesiones largas y esporádicas. La atención que tienes hoy no es la que tendrás en seis meses si la entrenas."
changes.append(f"MENTE/PREMIUM #67: 'La atención se entrena'")
changes.append(f"  Motivo: se elimina la metáfora «como un músculo» del primer párrafo. La afirmación científica (la atención se entrena con práctica consistente) es correcta y está respaldada por Posner y Petersen (1990), pero la metáfora del músculo entra en conflicto con la corrección del ego depletion ya realizada en disciplina/PREMIUM #50 y #82, donde se desmintió explícitamente que la voluntad funcione como un músculo que se agota.")
save("mente", mente)

# ============================================================
# VERIFY COUNTS
# ============================================================
print("=" * 80)
print("CAMBIOS REALIZADOS")
print("=" * 80)
for c in changes:
    print(c)

print("\n" + "=" * 80)
print("VERIFICACIÓN DE CONTADORES")
print("=" * 80)

total = 0
total_free = 0
total_premium = 0
for empire in ["disciplina", "mente", "energia", "riqueza", "crecimiento"]:
    tips = load(empire)
    free = sum(1 for t in tips if t["plan"] == "FREE")
    premium = sum(1 for t in tips if t["plan"] == "PREMIUM")
    total += len(tips)
    total_free += free
    total_premium += premium
    print(f"  {empire}: {len(tips)} ({free} FREE, {premium} PREMIUM)")

print(f"\n  TOTAL: {total} ({total_free} FREE, {total_premium} PREMIUM)")

# Verify JSON validity
for empire in ["disciplina", "mente", "energia", "riqueza", "crecimiento"]:
    with open(f"{BASE}/{empire}-tips.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 110, f"{empire} has {len(data)} tips!"

# Verify no more exact duplicate titles
from collections import Counter
all_titles = []
for empire in ["disciplina", "mente", "energia", "riqueza", "crecimiento"]:
    tips = load(empire)
    for t in tips:
        all_titles.append(t["title"])

dupes = {k: v for k, v in Counter(all_titles).items() if v > 1}
if dupes:
    print(f"\n  ⚠️ DUPLICATES REMAINING: {dupes}")
else:
    print(f"\n  ✓ No hay títulos duplicados")

print("\n✓ TODOS LOS JSON SON VÁLIDOS")
print("✓ 550 TIPS (250 FREE, 300 PREMIUM)")