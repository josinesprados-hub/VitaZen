#!/usr/bin/env python3
"""
Audit all 550 VitaZen tips for:
1. Scientific contradictions (ego depletion, decision fatigue, context-dependent learning)
2. Merged tip "Cada hora, muévete" (movement + meal order)
3. Duplicates (identical titles, near-identical content, cross-empire, FREE/PREMIUM)
4. FREE vs PREMIUM tier issues
"""

import json
import os
import re
from collections import defaultdict

BASE = "/home/z/my-project/prisma"
FILES = {
    "disciplina": f"{BASE}/disciplina-tips.json",
    "mente": f"{BASE}/mente-tips.json",
    "energia": f"{BASE}/energia-tips.json",
    "riqueza": f"{BASE}/riqueza-tips.json",
    "crecimiento": f"{BASE}/crecimiento-tips.json",
}

all_tips = []
titles_by_empire = defaultdict(list)
titles_global = defaultdict(list)
content_by_title = defaultdict(list)

for empire, path in FILES.items():
    with open(path, "r", encoding="utf-8") as f:
        tips = json.load(f)
    for i, tip in enumerate(tips):
        tip["_index"] = i
        tip["_file"] = path
        tip["_empire_file"] = empire
        all_tips.append(tip)
        titles_by_empire[empire].append(tip["title"])
        titles_global[tip["title"]].append({"empire": empire, "plan": tip["plan"], "index": i, "content": tip["content"]})
        content_by_title[tip["title"]].append(tip["content"])

print(f"Total tips loaded: {len(all_tips)}")

# Check counts per empire
print("\n=== COUNTS PER EMPIRE ===")
for empire in FILES:
    empire_tips = [t for t in all_tips if t["_empire_file"] == empire]
    free = [t for t in empire_tips if t["plan"] == "FREE"]
    premium = [t for t in empire_tips if t["plan"] == "PREMIUM"]
    print(f"  {empire}: {len(empire_tips)} total ({len(free)} FREE, {len(premium)} PREMIUM)")

total_free = len([t for t in all_tips if t["plan"] == "FREE"])
total_premium = len([t for t in all_tips if t["plan"] == "PREMIUM"])
print(f"  TOTAL: {len(all_tips)} ({total_free} FREE, {total_premium} PREMIUM)")

# 1. Find DUPLICATE TITLES
print("\n=== DUPLICATE TITLES (same title, multiple occurrences) ===")
dup_titles = {k: v for k, v in titles_global.items() if len(v) > 1}
if dup_titles:
    for title, entries in sorted(dup_titles.items()):
        print(f"\n  '{title}' ({len(entries)} occurrences):")
        for e in entries:
            print(f"    - {e['empire']} / {e['plan']} / #{e['index']}: {e['content'][:80]}...")
else:
    print("  None found")

# 2. Find NEAR-DUPLICATE CONTENT (similar titles)
print("\n=== SIMILAR TITLES (potential near-duplicates) ===")
all_titles = [(t["title"], t["_empire_file"], t["plan"], t["_index"]) for t in all_tips]
# Check for titles that share significant words
for i, (t1, e1, p1, i1) in enumerate(all_titles):
    for t2, e2, p2, i2 in all_titles[i+1:]:
        # Skip same entry
        if t1 == t2:
            continue
        # Normalize
        w1 = set(re.findall(r'\w+', t1.lower()))
        w2 = set(re.findall(r'\w+', t2.lower()))
        if not w1 or not w2:
            continue
        common = w1 & w2
        # If 2+ significant words in common (excluding very short ones)
        sig_common = {w for w in common if len(w) > 3}
        if len(sig_common) >= 2:
            # Check if it's cross-empire or within same empire
            cross = "CROSS-EMPIRE" if e1 != e2 else "SAME-EMPIRE"
            print(f"  [{cross}] '{t1}' ({e1}/{p1}) <-> '{t2}' ({e2}/{p2})")

# 3. Check for "Pensamiento de segundo orden" specifically
print("\n=== 'PENSAMIENTO DE SEGUNDO ORDEN' SEARCH ===")
for tip in all_tips:
    if "segundo orden" in tip["title"].lower() or "segundo orden" in tip["content"].lower():
        print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}' -> {tip['content'][:100]}...")

# 4. Check for "Cada hora, muévete" (merged content)
print("\n=== 'CADA HORA, MUÉVETE' CONTENT CHECK ===")
for tip in all_tips:
    if "cada hora" in tip["title"].lower() or "cada hora" in tip["content"].lower():
        print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
        print(f"    Content: {tip['content']}")
        print()

# 5. SCIENTIFIC ISSUES: Ego depletion
print("\n=== EGO DEPLETION MENTIONS ===")
ego_kw = ["ego depletion", "agota la fuerza de voluntad", "fuerza de voluntad se agota", 
           "voluntad es limitada", "voluntad se gasta", "recursos de autocontrol",
           "autocontrol limitado", "agota el autocontrol", "desgaste de la voluntad",
           "voluntad es como", "voluntad funciona como", "como un músculo"]
for tip in all_tips:
    content_lower = tip["content"].lower()
    title_lower = tip["title"].lower()
    for kw in ego_kw:
        if kw in content_lower or kw in title_lower:
            print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
            print(f"    KW: '{kw}'")
            print(f"    Content: {tip['content']}")
            print()
            break

# 6. SCIENTIFIC ISSUES: Decision fatigue (fatiga de decisión)
print("\n=== DECISION FATIGUE MENTIONS ===")
decision_kw = ["fatiga de decisión", "decisiones agotan", "cada decisión gasta",
               "decisiones consumen", "tomas muchas decisiones", "decisiones se acumulan",
               "agotamiento decision", "cada decisión resta"]
for tip in all_tips:
    content_lower = tip["content"].lower()
    title_lower = tip["title"].lower()
    for kw in decision_kw:
        if kw in content_lower or kw in title_lower:
            print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
            print(f"    KW: '{kw}'")
            print(f"    Content: {tip['content']}")
            print()
            break

# 7. SCIENTIFIC ISSUES: Context-dependent learning
print("\n=== CONTEXT-DEPENDENT LEARNING MENTIONS ===")
context_kw = ["aprendizaje dependiente del contexto", "contexto del aprendizaje",
              "cambiar de contexto", "mismo contexto", "contexto diferente",
              "aprendes en un contexto", "recordar en el mismo", "estudiar en distintos"]
for tip in all_tips:
    content_lower = tip["content"].lower()
    title_lower = tip["title"].lower()
    for kw in context_kw:
        if kw in content_lower or kw in title_lower:
            print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
            print(f"    KW: '{kw}'")
            print(f"    Content: {tip['content']}")
            print()
            break

# 8. Check for "orden de la comida" / meal order in energia tips (merged content issue)
print("\n=== MEAL ORDER / ORDEN COMIDA MENTIONS (should NOT be in 'Cada hora, muévete') ===")
for tip in all_tips:
    if tip["_empire_file"] == "energia":
        content_lower = tip["content"].lower()
        title_lower = tip["title"].lower()
        if "orden" in content_lower and "comida" in content_lower:
            print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
            print(f"    Content: {tip['content']}")
            print()
        if "orden" in title_lower and "comer" in content_lower:
            print(f"  {tip['_empire_file']}/{tip['plan']} #{tip['_index']}: '{tip['title']}'")
            print(f"    Content: {tip['content']}")
            print()

# 9. FREE/PREMIUM - check for FREE tips that seem too complex or PREMIUM that seem too simple
print("\n=== ALL TIP TITLES BY EMPIRE AND PLAN ===")
for empire in FILES:
    empire_tips = [t for t in all_tips if t["_empire_file"] == empire]
    free_tips = [t for t in empire_tips if t["plan"] == "FREE"]
    premium_tips = [t for t in empire_tips if t["plan"] == "PREMIUM"]
    print(f"\n  --- {empire.upper()} FREE ({len(free_tips)}) ---")
    for t in free_tips:
        print(f"    #{t['_index']:3d}: {t['title']}")
    print(f"\n  --- {empire.upper()} PREMIUM ({len(premium_tips)}) ---")
    for t in premium_tips:
        print(f"    #{t['_index']:3d}: {t['title']}")

print("\n=== AUDIT COMPLETE ===")