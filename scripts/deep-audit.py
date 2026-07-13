#!/usr/bin/env python3
"""
Deep analysis of specific issues found in the audit.
"""

import json
import os

BASE = "/home/z/my-project/prisma"
FILES = {
    "disciplina": f"{BASE}/disciplina-tips.json",
    "mente": f"{BASE}/mente-tips.json",
    "energia": f"{BASE}/energia-tips.json",
    "riqueza": f"{BASE}/riqueza-tips.json",
    "crecimiento": f"{BASE}/crecimiento-tips.json",
}

all_tips = []
for empire, path in FILES.items():
    with open(path, "r", encoding="utf-8") as f:
        tips = json.load(f)
    for i, tip in enumerate(tips):
        tip["_index"] = i
        tip["_file"] = path
        tip["_empire_file"] = empire
        all_tips.append(tip)

def find_tip(empire, index):
    for t in all_tips:
        if t["_empire_file"] == empire and t["_index"] == index:
            return t
    return None

# ============================================================
# 1. EXACT DUPLICATE TITLES - full content comparison
# ============================================================
print("=" * 80)
print("1. EXACT DUPLICATE TITLES - FULL CONTENT")
print("=" * 80)

# "El efecto Dunning-Kruger" - mente #62, crecimiento #52
print("\n--- 'El efecto Dunning-Kruger' ---")
t1 = find_tip("mente", 62)
t2 = find_tip("crecimiento", 52)
print(f"MENTE/PREMIUM #{t1['_index']}:")
print(f"  Title: {t1['title']}")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/PREMIUM #{t2['_index']}:")
print(f"  Title: {t2['title']}")
print(f"  Content: {t2['content']}")

# "La opción por defecto gana" - disciplina #25, mente #19
print("\n\n--- 'La opción por defecto gana' ---")
t1 = find_tip("disciplina", 25)
t2 = find_tip("mente", 19)
print(f"DISCIPLINA/FREE #{t1['_index']}:")
print(f"  Title: {t1['title']}")
print(f"  Content: {t1['content']}")
print(f"\nMENTE/FREE #{t2['_index']}:")
print(f"  Title: {t2['title']}")
print(f"  Content: {t2['content']}")

# ============================================================
# 2. NEAR-DUPLICATES: Check "Pensamiento de segundo orden" areas
# ============================================================
print("\n" + "=" * 80)
print("2. 'PENSAMIENTO DE SEGUNDO ORDEN' - ALL RELATED TIPS")
print("=" * 80)

for t in all_tips:
    if "segundo orden" in t["title"].lower() or "segundo orden" in t["content"].lower() or "segundo nivel" in t["title"].lower():
        print(f"\n{t['_empire_file'].upper()}/{t['plan']} #{t['_index']}: '{t['title']}'")
        print(f"  Content: {t['content']}")

# ============================================================
# 3. "Eres lo que repites" vs "Lo que repites eres"
# ============================================================
print("\n" + "=" * 80)
print("3. 'ERES LO QUE REPITES' vs 'LO QUE REPITES ERES'")
print("=" * 80)

t1 = find_tip("disciplina", 61)
t2 = find_tip("crecimiento", 19)
print(f"\nDISCIPLINA/PREMIUM #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/FREE #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 4. "Mismo lugar" vs "Mismo tiempo, mismo lugar"
# ============================================================
print("\n" + "=" * 80)
print("4. 'MISMO LUGAR' vs 'MISMO TIEMPO, MISMO LUGAR'")
print("=" * 80)

t1 = find_tip("disciplina", 36)
t2 = find_tip("crecimiento", 31)
print(f"\nDISCIPLINA/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/FREE #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 5. "Coste hundido" vs "El coste hundido en suscripciones"
# ============================================================
print("\n" + "=" * 80)
print("5. 'COSTE HUNDIDO' vs 'EL COSTE HUNDIDO EN SUSCRIPCIONES'")
print("=" * 80)

t1 = find_tip("mente", 18)
t2 = find_tip("riqueza", 72)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nRIQUEZA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 6. "Fatiga de decisión" cross-empire
# ============================================================
print("\n" + "=" * 80)
print("6. 'FATIGA DE DECISIÓN' CROSS-EMPIRE")
print("=" * 80)

t1 = find_tip("mente", 34)
t2 = find_tip("riqueza", 91)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nRIQUEZA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 7. "Mentalidad de crecimiento" cross-empire
# ============================================================
print("\n" + "=" * 80)
print("7. 'MENTALIDAD DE CRECIMIENTO' CROSS-EMPIRE")
print("=" * 80)

t1 = find_tip("riqueza", 103)
t2 = find_tip("crecimiento", 100)
print(f"\nRIQUEZA/PREMIUM #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 8. "Reversión a la media" cross-empire
# ============================================================
print("\n" + "=" * 80)
print("8. 'REVERSIÓN A LA MEDIA' CROSS-EMPIRE")
print("=" * 80)

t1 = find_tip("riqueza", 107)
t2 = find_tip("crecimiento", 72)
print(f"\nRIQUEZA/PREMIUM #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 9. "La pregunta cambia todo" vs "El ciclo cambia todo"
# ============================================================
print("\n" + "=" * 80)
print("9. 'LA PREGUNTA CAMBIA TODO' vs 'EL CICLO CAMBIA TODO'")
print("=" * 80)

t1 = find_tip("mente", 40)
t2 = find_tip("energia", 58)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nENERGIA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 10. "Estrés agudo frente a crónico" vs "El eje del estrés crónico"
# ============================================================
print("\n" + "=" * 80)
print("10. 'ESTRÉS AGUDO FRENTE A CRÓNICO' vs 'EL EJE DEL ESTRÉS CRÓNICO'")
print("=" * 80)

t1 = find_tip("mente", 38)
t2 = find_tip("energia", 73)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nENERGIA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 11. "Lo que comes primero" - check for meal order content
# ============================================================
print("\n" + "=" * 80)
print("11. 'LO QUE COMES PRIMERO' (ENERGIA) - MEAL ORDER TIP")
print("=" * 80)

t = find_tip("energia", 8)
print(f"\nENERGIA/FREE #{t['_index']}: '{t['title']}'")
print(f"  Content: {t['content']}")

# ============================================================
# 12. "El pre-mortem prevé" (mente) vs "Pre-mortem" (disciplina)
# ============================================================
print("\n" + "=" * 80)
print("12. 'EL PRE-MORTEM PREVÉ' vs 'PRE-MORTEM'")
print("=" * 80)

t1 = find_tip("mente", 45)
t2 = find_tip("disciplina", 92)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nDISCIPLINA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 13. "El contexto importa" (mente #30) vs "El contexto de la prueba" (crecimiento #64)
# ============================================================
print("\n" + "=" * 80)
print("13. CONTEXT-DEPENDENT LEARNING: MENTE #30 vs CRECIMIENTO #64")
print("=" * 80)

t1 = find_tip("mente", 30)
t2 = find_tip("crecimiento", 64)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nCRECIMIENTO/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 14. EGO DEPLETION TIPS - full content
# ============================================================
print("\n" + "=" * 80)
print("14. EGO DEPLETION - FULL CONTENT OF ALL MENTIONS")
print("=" * 80)

for t in all_tips:
    content_lower = t["content"].lower()
    title_lower = t["title"].lower()
    if any(kw in content_lower or kw in title_lower for kw in [
        "ego depletion", "voluntad funciona como", "fuerza de voluntad",
        "voluntad se agota", "voluntad es limitada", "autocontrol limitado",
        "como un músculo"
    ]):
        print(f"\n{t['_empire_file'].upper()}/{t['plan']} #{t['_index']}: '{t['title']}'")
        print(f"  Content: {t['content']}")

# ============================================================
# 15. Check "EPOC" vs "El enfriamiento" - same empire
# ============================================================
print("\n" + "=" * 80)
print("15. 'EPOC' vs 'EL ENFRIAMIENTO TRAS EL EJERCICIO' (SAME EMPIRE)")
print("=" * 80)

t1 = find_tip("energia", 43)
t2 = find_tip("energia", 76)
print(f"\nENERGIA/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nENERGIA/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 16. Check "La concentración se agota" (mente #1) for ego depletion
# ============================================================
print("\n" + "=" * 80)
print("16. 'LA CONCENTRACIÓN SE AGOTA' (MENTE #1) - CHECK")
print("=" * 80)

t = find_tip("mente", 1)
print(f"\nMENTE/FREE #{t['_index']}: '{t['title']}'")
print(f"  Content: {t['content']}")

# ============================================================
# 17. Check "Lo suficientemente bueno" and "Lo mejor es enemigo de lo bueno"
# ============================================================
print("\n" + "=" * 80)
print("17. 'LO SUFICIENTEMENTE BUENO' vs 'LO MEJOR ES ENEMIGO DE LO BUENO'")
print("=" * 80)

t1 = find_tip("mente", 35)
t2 = find_tip("mente", 79)
print(f"\nMENTE/FREE #{t1['_index']}: '{t1['title']}'")
print(f"  Content: {t1['content']}")
print(f"\nMENTE/PREMIUM #{t2['_index']}: '{t2['title']}'")
print(f"  Content: {t2['content']}")

# ============================================================
# 18. Check all FREE tips in energia for overly complex content
# ============================================================
print("\n" + "=" * 80)
print("18. ENERGIA FREE TIPS - CHECK FOR PREMIUM-LEVEL COMPLEXITY")
print("=" * 80)

# Several energia FREE tips have very technical names
technical_free = [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49]
for idx in technical_free:
    t = find_tip("energia", idx)
    if t:
        content_len = len(t["content"])
        print(f"  #{t['_index']:3d}: '{t['title']}' ({content_len} chars) [{t['plan']}]")
        # Print content only for very technical ones
        if any(kw in t["title"].lower() for kw in ["ampk", "epoc", "neat", "autofagia", "mioquinas", "cortisol", "lactico", "hepático", "teanina"]):
            print(f"         Content: {t['content'][:150]}...")

print("\n=== DEEP ANALYSIS COMPLETE ===")