// ═════════════════════════════════════════════════════════════════════
// E-9 — D-2: PLACEHOLDER CONTRAST REGRESSION GUARD (WCAG 1.4.3)
// ═════════════════════════════════════════════════════════════════════
//
// E-8 confirmed ~30 inputs rendering their placeholder through Tailwind's
// bare `placeholder-[#hex]` utility with hex values whose contrast against
// the app's near-black backgrounds fails WCAG 1.4.3 (minimum 4.5:1):
//
//   placeholder-[#333] → 1.66:1   (riqueza)
//   placeholder-[#555] → 2.82:1   (mentor ChatInput/ThreadSidebar)
//   placeholder-[#666] → 3.66:1   (26 occurrences across 9 files)
//
// FIX (E-9): every one of them now uses the project's established
// `placeholder:text-[#888]` pattern (already used by perfil since long
// before) — #888 on the darkest backgrounds used by the app (#000, #050505,
// #0a0a0a, #111) is ≥ 5.2:1 and passes AA.
//
// This file pins BOTH halves of that decision:
//
//   1. SOURCE SCAN — no bare `placeholder-[#...]` class may reappear in
//      src/**. Placeholder colors must go through the variant syntax with
//      an approved value (placeholder:text-[#888] / [#999] /
//      text-muted-foreground). The scan is limited to src/ on purpose:
//      historical tool artifacts living in the repo (tool-results/) must
//      not trip it.
//
//   2. CONTRAST MATH — the WCAG ratios are computed here so the approved
//      palette can never silently drift below 4.5:1 on any background the
//      app actually renders inputs on.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

// ─── WCAG 2.x relative luminance / contrast ratio ──────────────

function channelLinear(hexValue: number): number {
  const c = hexValue / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ─── Source scan (recursive, src only) ─────────────────────────

function listTsxFilenames(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listTsxFilenames(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

// Every background the app currently renders text inputs on (from the
// affected inputs' own bg-* classes) — all near-black.
const INPUT_BACKGROUNDS = ['#000000', '#050505', '#0a0a0a', '#111111'];
const APPROVED_PLACEHOLDER = '#888888';
const AA_MINIMUM = 4.5;

describe('E-9 D-2 — placeholder contrast (WCAG 1.4.3)', () => {
  it('the approved placeholder color passes AA on every input background the app uses', () => {
    for (const bg of INPUT_BACKGROUNDS) {
      const ratio = contrastRatio(APPROVED_PLACEHOLDER, bg);
      expect(ratio, `#888 on ${bg}`).toBeGreaterThanOrEqual(AA_MINIMUM);
    }
  });

  it('the previously used placeholder colors genuinely failed (documents the bug)', () => {
    // Pins the reason the fix exists: all three legacy hexes were below AA.
    expect(contrastRatio('#333333', '#000000')).toBeLessThan(AA_MINIMUM);
    expect(contrastRatio('#555555', '#000000')).toBeLessThan(AA_MINIMUM);
    expect(contrastRatio('#666666', '#000000')).toBeLessThan(AA_MINIMUM);
    expect(contrastRatio('#666666', '#0a0a0a')).toBeLessThan(AA_MINIMUM);
  });

  it('no bare placeholder-[#hex] class remains anywhere in src/**', () => {
    // Bare `placeholder-[#hex]` was the defect's vehicle: it emits
    // `::placeholder{color:<hex>}` with unvetted hex values. Placeholder
    // colors must use the approved variant pattern instead.
    const offenders: string[] = [];
    for (const file of listTsxFilenames(SRC)) {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(/placeholder-\[#/g);
      if (matches) offenders.push(`${file.replace(SRC, 'src')} ×${matches.length}`);
    }
    expect(offenders, `files with bare placeholder-[#...] classes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every placeholder color class in src/** uses an approved AA-passing value', () => {
    const allowed = new Set([
      'placeholder:text-[#888]',
      'placeholder:text-[#999]',
      'placeholder:text-muted-foreground', // resolves to #999999 (globals.css --color-muted-foreground)
    ]);
    const offenders: string[] = [];
    for (const file of listTsxFilenames(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/placeholder:[^\s"'`]+/g)) {
        if (!allowed.has(match[0])) offenders.push(`${file.replace(SRC, 'src')}: ${match[0]}`);
      }
    }
    expect(offenders, `unapproved placeholder color classes:\n${offenders.join('\n')}`).toEqual([]);
  });
});
