/**
 * G-09 — F-1: FinanceLog edit form preserves the natural Europe/Madrid day.
 *
 * Original defect (found by the G-09 temporal audit at 1266e69):
 *   `FinanceLog.date` is stored as the UTC instant of Madrid midnight
 *   (`startOfMadridDay(key)`, e.g. 2026-07-14T22:00:00.000Z for the Madrid
 *   day 2026-07-15 in CEST). The GET route serializes it with
 *   `toISOString()`, and the riqueza page prefilled the edit form with
 *   `log.date.split('T')[0]` — the UTC calendar day, which is the PREVIOUS
 *   Madrid day for every row. Editing a record without touching its date
 *   therefore shifted the record one day back on every save.
 *
 * Fix: the prefill derives the natural Madrid day with the canonical
 * timezone utility: `getMadridDateKey(new Date(log.date))` (src/lib/dates.ts).
 * The PUT route parses the submitted YYYY-MM-DD key with `startOfMadridDay`,
 * so the round-trip GET → prefill → PUT(no date change) is now an identity.
 *
 * Round-trip under test (mirrors the exact expressions used by the API and
 * the page — no second timezone implementation):
 *   FinanceLog.date (UTC instant)
 *     → toISOString()                     [serializeFinanceLog, GET]
 *     → getMadridDateKey(new Date(...))   [startEdit prefill]
 *     → startOfMadridDay(key)             [PUT parse]
 *     → same Madrid day & same stored instant
 *
 * These tests are pure and deterministic: only the REAL Europe/Madrid
 * utilities from src/lib/dates.ts are involved (Intl-based, DST-safe).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getMadridDateKey, startOfMadridDay, madridDayBoundaries } from '@/lib/dates';

// ─── The exact expressions used by the app ───────────────────

// GET /api/finance serialization (serializeFinanceLog).
function serializeDate(stored: Date): string {
  return stored.toISOString();
}

// startEdit() prefill in src/app/(dashboard)/imperio/riqueza/page.tsx (F-1 FIX).
function prefillFormDate(serialized: string): string {
  return getMadridDateKey(new Date(serialized));
}

// PUT /api/finance parse of the submitted date (server, unchanged by F-1).
function parseSubmittedDate(formDate: string): Date {
  return startOfMadridDay(formDate);
}

// The original buggy prefill (kept only to document the defect it caused).
function buggyPrefill(serialized: string): string {
  return serialized.split('T')[0];
}

// ─── F1-1 ────────────────────────────────────────────────────

describe('F1-1 — the form shows the Madrid day the record represents', () => {
  it('a record for 2026-07-15 (stored as Madrid midnight) prefills "2026-07-15"', () => {
    const madridDay = '2026-07-15';
    const stored = startOfMadridDay(madridDay);

    const formDate = prefillFormDate(serializeDate(stored));
    expect(formDate).toBe('2026-07-15');
  });

  it('works for both offsets: CET (winter) and CEST (summer) records', () => {
    // CEST (UTC+2): Madrid midnight = 22:00 UTC of the previous UTC day.
    const cestStored = startOfMadridDay('2026-07-15');
    expect(cestStored.toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(prefillFormDate(cestStored.toISOString())).toBe('2026-07-15');

    // CET (UTC+1): Madrid midnight = 23:00 UTC of the previous UTC day.
    const cetStored = startOfMadridDay('2026-01-15');
    expect(cetStored.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(prefillFormDate(cetStored.toISOString())).toBe('2026-01-15');
  });

  it('the buggy expression is documented as the defect: it yields the previous day', () => {
    const stored = startOfMadridDay('2026-07-15');
    expect(buggyPrefill(stored.toISOString())).toBe('2026-07-14'); // ← the original bug
    expect(prefillFormDate(stored.toISOString())).toBe('2026-07-15'); // ← the fix
  });
});

// ─── F1-2 ────────────────────────────────────────────────────

describe('F1-2 — editing WITHOUT touching the date keeps date before == date after', () => {
  for (const madridDay of ['2026-07-15', '2026-01-15', '2026-03-29', '2026-10-25']) {
    it(`round-trip is an identity for ${madridDay}`, () => {
      const storedBefore = startOfMadridDay(madridDay);

      // GET → form prefill → PUT (date untouched) → server parse.
      const formDate = prefillFormDate(serializeDate(storedBefore));
      const storedAfter = parseSubmittedDate(formDate);

      // Same natural Madrid day…
      expect(getMadridDateKey(storedAfter)).toBe(getMadridDateKey(storedBefore));
      expect(getMadridDateKey(storedAfter)).toBe(madridDay);
      // …and the exact same stored UTC instant (no shift at all).
      expect(storedAfter.getTime()).toBe(storedBefore.getTime());
    });
  }

  it('full API-level round-trip through a re-serialized response', () => {
    const madridDay = '2026-07-15';
    const stored = startOfMadridDay(madridDay);

    // PUT responds with the same serialization the GET uses.
    const serializedAfterPut = serializeDate(parseSubmittedDate(
      prefillFormDate(serializeDate(stored)),
    ));

    // A second edit cycle still shows the same day.
    expect(prefillFormDate(serializedAfterPut)).toBe(madridDay);
    expect(new Date(serializedAfterPut).getTime()).toBe(stored.getTime());
  });
});

// ─── F1-3 ────────────────────────────────────────────────────

describe('F1-3 — records stored around CET/CEST (and the DST days themselves)', () => {
  it('spring-forward day (2026-03-29, 23 hours) keeps its natural day', () => {
    const { start, end } = madridDayBoundaries('2026-03-29');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);

    expect(prefillFormDate(start.toISOString())).toBe('2026-03-29');
    // Last instant of the 23h day also maps to the same day.
    expect(prefillFormDate(new Date(end.getTime() - 1).toISOString())).toBe('2026-03-29');

    // And a no-touch edit of a record on that day does not move it.
    const stored = parseSubmittedDate(prefillFormDate(start.toISOString()));
    expect(stored.getTime()).toBe(start.getTime());
  });

  it('fall-back day (2026-10-25, 25 hours) keeps its natural day', () => {
    const { start, end } = madridDayBoundaries('2026-10-25');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);

    expect(prefillFormDate(start.toISOString())).toBe('2026-10-25');
    expect(prefillFormDate(new Date(end.getTime() - 1).toISOString())).toBe('2026-10-25');

    const stored = parseSubmittedDate(prefillFormDate(start.toISOString()));
    expect(stored.getTime()).toBe(start.getTime());
  });

  it('the day before/after each DST transition round-trips correctly', () => {
    expect(prefillFormDate(startOfMadridDay('2026-03-28').toISOString())).toBe('2026-03-28');
    expect(prefillFormDate(startOfMadridDay('2026-03-30').toISOString())).toBe('2026-03-30');
    expect(prefillFormDate(startOfMadridDay('2026-10-24').toISOString())).toBe('2026-10-24');
    expect(prefillFormDate(startOfMadridDay('2026-10-26').toISOString())).toBe('2026-10-26');
  });
});

// ─── F1-4 ────────────────────────────────────────────────────

describe('F1-4 — timestamps whose UTC day is the PREVIOUS day still show the Madrid day', () => {
  it('2026-07-14T22:00:00.000Z (UTC day 14) is Madrid day 2026-07-15', () => {
    const serialized = '2026-07-14T22:00:00.000Z';
    expect(new Date(serialized).getUTCDate()).toBe(14); // UTC calendar day = 14
    expect(prefillFormDate(serialized)).toBe('2026-07-15'); // Madrid natural day = 15
    expect(buggyPrefill(serialized)).toBe('2026-07-14'); // what the old code showed
  });

  it('2026-01-14T23:00:00.000Z (UTC day 14) is Madrid day 2026-01-15', () => {
    const serialized = '2026-01-14T23:00:00.000Z';
    expect(new Date(serialized).getUTCDate()).toBe(14);
    expect(prefillFormDate(serialized)).toBe('2026-01-15');
  });

  it('legacy UTC-midnight rows (stored as T00:00:00Z) keep their day — no regression', () => {
    // Historic rows stored at UTC midnight: Madrid is always UTC+1/+2, so the
    // Madrid day equals the UTC day for those rows. The fix shows the same day
    // the old code showed for them.
    const serialized = '2026-09-07T00:00:00.000Z';
    expect(buggyPrefill(serialized)).toBe('2026-09-07');
    expect(prefillFormDate(serialized)).toBe('2026-09-07');
  });
});

// ─── Regression guard on the page source ─────────────────────

describe('regression guard — riqueza page uses the canonical utility', () => {
  const pagePath = path.join(
    process.cwd(),
    'src',
    'app',
    '(dashboard)',
    'imperio',
    'riqueza',
    'page.tsx',
  );

  it('startEdit() no longer slices the ISO string, and imports getMadridDateKey', () => {
    const source = readFileSync(pagePath, 'utf8');

    // The buggy expression must be gone…
    expect(source).not.toContain("log.date.split('T')[0]");
    // …and the canonical prefill must be present.
    expect(source).toContain('getMadridDateKey(new Date(log.date))');
    // The utility is imported from the unified dates module.
    expect(source).toContain("from '@/lib/dates'");
  });
});
