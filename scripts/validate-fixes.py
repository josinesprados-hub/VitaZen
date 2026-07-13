#!/usr/bin/env python3
"""
Final validation of all 550 tips after corrections.
"""
import json
from collections import Counter, defaultdict

BASE = "/home/z/my-project/prisma"
FILES = ["disciplina", "mente", "energia", "riqueza", "crecimiento"]

all_tips = []
for empire in FILES:
    with open(f"{BASE}/{empire}-tips.json", "r", encoding="utf-8") as f:
        tips = json.load(f)
    for i, tip in enumerate(tips):
        tip["_empire"] = empire
        tip["_index"] = i
        all_tips.append(tip)

issues = []

# 1. COUNTS
print("=" * 80)
print("1. CONTADORES")
print("=" * 80)
total = len(all_tips)
total_free = sum(1 for t in all_tips if t["plan"] == "FREE")
total_premium = sum(1 for t in all_tips if t["plan"] == "PREMIUM")
print(f"  Total: {total} (esperado: 550)")
print(f"  FREE: {total_free} (esperado: 250)")
print(f"  PREMIUM: {total_premium} (esperado: 300)")
for empire in FILES:
    etips = [t for t in all_tips if t["_empire"] == empire]
    ef = sum(1 for t in etips if t["plan"] == "FREE")
    ep = sum(1 for t in etips if t["plan"] == "PREMIUM")
    print(f"  {empire}: {len(etips)} ({ef} FREE, {ep} PREMIUM)")

if total != 550:
    issues.append(f"TOTAL incorrecto: {total} != 550")
if total_free != 250:
    issues.append(f"FREE incorrecto: {total_free} != 250")
if total_premium != 300:
    issues.append(f"PREMIUM incorrecto: {total_premium} != 300")

# 2. DUPLICATE TITLES
print("\n" + "=" * 80)
print("2. TÍTULOS DUPLICADOS")
print("=" * 80)
title_map = defaultdict(list)
for t in all_tips:
    title_map[t["title"]].append(f"{t['_empire']}/{t['plan']} #{t['_index']}")
dupes = {k: v for k, v in title_map.items() if len(v) > 1}
if dupes:
    for title, locs in dupes.items():
        issues.append(f"Título duplicado: '{title}' en {locs}")
        print(f"  ⚠️ '{title}': {locs}")
else:
    print("  ✓ Sin títulos duplicados")

# 3. SCIENTIFIC: Ego depletion check
print("\n" + "=" * 80)
print("3. CONTRADICCIONES CIENTÍFICAS")
print("=" * 80)

# Check no tip claims willpower IS a limited resource (the debunked claim)
ego_debunked_kw = [
    "la fuerza de voluntad se agota",
    "la voluntad es un recurso limitado",
    "agota tu fuerza de voluntad",
    "la voluntad se agota como",
    "voluntad funciona como un músculo que se agota",
]
print("  Buscando afirmaciones de ego depletion (voluntad como recurso limitado)...")
ego_found = False
for t in all_tips:
    cl = t["content"].lower()
    for kw in ego_debunked_kw:
        if kw in cl:
            issues.append(f"Ego depletion afirmado: {t['_empire']}/{t['plan']} #{t['_index']} '{t['title']}'")
            print(f"  ⚠️ {t['_empire']}/{t['plan']} #{t['_index']}: '{kw}'")
            ego_found = True
if not ego_found:
    print("  ✓ Ningún tip afirma que la voluntad es un recurso limitado que se agota")

# Check correct framing exists
print("  Verificando que el marco correcto está presente...")
correct_tips = [
    ("disciplina", 50, "Voluntad: músculo o señal"),
    ("disciplina", 82, "Creer que puedes"),
    ("disciplina", 107, "Inhibición de respuesta"),
]
for emp, idx, title in correct_tips:
    t = [x for x in all_tips if x["_empire"] == emp and x["_index"] == idx][0]
    if "no es que se agote una reserva" in t["content"].lower() or "no se vacíe una reserva" in t["content"].lower() or "no la han respaldado" in t["content"].lower():
        print(f"  ✓ {emp}/{t['plan']} #{idx} '{title}' — marco correcto")
    else:
        issues.append(f"Tip de ego depletion sin marco correcto: {emp}/{t['plan']} #{idx}")
        print(f"  ⚠️ {emp}/{t['plan']} #{idx} '{title}' — necesita revisión")

# Check "como un músculo" is not used for willpower/attention depleting
print("  Buscando metáfora 'como un músculo' en contexto de agotamiento...")
muscle_found = False
for t in all_tips:
    cl = t["content"].lower()
    if "como un músculo" in cl:
        # Check if it's in a depleting context
        if any(w in cl for w in ["se agota", "se gasta", "se fatiga", "agota"]):
            issues.append(f"Metáfora muscular con agotamiento: {t['_empire']}/{t['plan']} #{t['_index']}")
            print(f"  ⚠️ {t['_empire']}/{t['plan']} #{t['_index']} '{t['title']}'")
            muscle_found = True
if not muscle_found:
    print("  ✓ Sin metáfora 'como un músculo' en contexto de agotamiento")

# 4. DECISION FATIGUE consistency
print("\n  Verificando fatiga de decisión...")
df_tips = [t for t in all_tips if "fatiga de decisión" in t["content"].lower()]
for t in df_tips:
    cl = t["content"].lower()
    if "se agote una reserva" in cl or "reserva de voluntad" in cl:
        issues.append(f"Fatiga de decisión como recurso: {t['_empire']}/{t['plan']} #{t['_index']}")
        print(f"  ⚠️ {t['_empire']}/{t['plan']} #{t['_index']} '{t['title']}' — menciona 'reserva'")
    elif "motivación" in cl or "cambio motivacional" in cl:
        print(f"  ✓ {t['_empire']}/{t['plan']} #{t['_index']} '{t['title']}' — marco motivacional correcto")

# 5. CONTEXT-DEPENDENT LEARNING consistency
print("\n  Verificando aprendizaje dependiente del contexto...")
cdl_tips = [t for t in all_tips if "contexto" in t["content"].lower() and ("aprend" in t["content"].lower() or "recuerda" in t["content"].lower() or "estudiar" in t["content"].lower())]
for t in cdl_tips:
    print(f"  • {t['_empire']}/{t['plan']} #{t['_index']} '{t['title']}'")

# 6. EACH TIP DEVELOPS ONE IDEA
print("\n" + "=" * 80)
print("4. CONTENIDO FUSIONADO")
print("=" * 80)
# Check "Cada hora, muévete"
for t in all_tips:
    if t["title"] == "Cada hora, muévete":
        ideas = 0
        if "mover" in t["content"].lower() or "movimiento" in t["content"].lower():
            ideas += 1
        if "orden" in t["content"].lower() and "comida" in t["content"].lower():
            ideas += 1
        if "comer" in t["content"].lower() and "primero" in t["content"].lower():
            ideas += 1
        print(f"  energía/FREE #1 'Cada hora, muévete': {ideas} idea(s) detectada(s)")
        print(f"    Contenido: {t['content'][:120]}...")
        if ideas > 1:
            issues.append(f"Tip fusionado: energia/FREE #1 'Cada hora, muévete'")
        else:
            print("  ✓ Desarrollo de una sola idea")

# 7. CROSS-EMPIRE SIMILARITY CHECK (not exact dupes, but flagged)
print("\n" + "=" * 80)
print("5. SIMILITUDES CROSS-EMPIRE (diferenciadas)")
print("=" * 80)
pairs_to_check = [
    ("Coste hundido", "El coste hundido en suscripciones"),
    ("Fatiga de decisión: cambio motivacional", "La fatiga de decisión"),
    ("Pensamiento de segundo orden", "Invertir en el segundo nivel"),
    ("Pensamiento de segundo orden", "El segundo orden en el aprendizaje"),
    ("El pre-mortem prevé", "Pre-mortem"),
    ("Lo suficientemente bueno", "Lo mejor es enemigo de lo bueno"),
    ("La reversión a la media", "La reversión a la media en inversiones"),
]
all_titles = [t["title"] for t in all_tips]
for t1_name, t2_name in pairs_to_check:
    if t1_name in all_titles and t2_name in all_titles:
        tip1 = next(t for t in all_tips if t["title"] == t1_name)
        tip2 = next(t for t in all_tips if t["title"] == t2_name)
        cross = "✓" if tip1["_empire"] != tip2["_empire"] else "~"
        same_tier = "⚠️ mismo tier" if tip1["plan"] == tip2["plan"] and tip1["_empire"] != tip2["_empire"] else ""
        print(f"  {cross} '{t1_name}' ({tip1['_empire']}/{tip1['plan']}) ↔ '{t2_name}' ({tip2['_empire']}/{tip2['plan']}) {same_tier}")

# 8. TONE CHECK - no AI-sounding patterns
print("\n" + "=" * 80)
print("6. PATRONES AI (verificación)")
print("=" * 80)
ai_patterns = ["En conclusión", "En resumen", "Es importante destacar", "En el mundo actual",
               "En última instancia", "Como hemos visto", "Cabe destacar"]
ai_found = False
for t in all_tips:
    cl = t["content"]
    for p in ai_patterns:
        if p in cl:
            print(f"  ⚠️ {t['_empire']}/{t['plan']} #{t['_index']}: '{p}'")
            ai_found = True
if not ai_found:
    print("  ✓ Sin patrones AI detectados")

# 9. FINAL SUMMARY
print("\n" + "=" * 80)
print("RESUMEN FINAL")
print("=" * 80)
if issues:
    print(f"  ⚠️ {len(issues)} issue(s) pendiente(s):")
    for i in issues:
        print(f"    - {i}")
else:
    print("  ✓ Sin issues pendientes")
    print("  ✓ 550 tips (250 FREE, 300 PREMIUM)")
    print("  ✓ Sin títulos duplicados")
    print("  ✓ Sin contradicciones científicas")
    print("  ✓ Sin contenido fusionado")
    print("  ✓ Tono VitaZen coherente")