// @vitest-environment jsdom
/**
 * FASE 28 — Energy Insights source clarification (UX copy only).
 *
 * Product decision (FASE 26, not reopened): the Energy insight is derived
 * EXCLUSIVELY from the daily check-in energy rating (DailyCheckin.energy).
 * This suite locks in the presentation-only clarification:
 *
 *   ⚡ Energía alta [energía]
 *   Basado en tus registros de energía del check-in diario.   ← new note
 *   Promedio 4.2/5. Mejoró desde la semana pasada.            ← unchanged
 *
 * What must NOT change (asserted here so regressions get caught):
 *   - avgEnergy / energyTrend values keep rendering from the API payload.
 *   - WellnessLog.energy ("Bienestar físico") is never presented as the
 *     source of the Energy insight.
 *   - The note appears ONLY on energy insight cards (no on-screen repetition,
 *     no orphan note when no energy insight exists).
 *
 * Tests query by accessible text/role, never by DOM position.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import InsightsPage from '@/app/(dashboard)/insights/page';

// ─── Mocks (hoisted) ─────────────────────────────────────────

const H = vi.hoisted(() => {
  const apiFetch = vi.fn();
  return { apiFetch };
});

vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ apiFetch: H.apiFetch }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', privacyStatsVisible: true } }),
}));
vi.mock('@/context/ScreenshotModeContext', () => ({
  // isActive must be a BOOLEAN here: the insights page checks `if (screenshotMode)`,
  // so a function (truthy) would flip the page into frozen demo data.
  useScreenshotMode: () => ({
    isActive: false,
    device: null,
    hideTransient: false,
    displayUser: { id: 'u1', name: 'Test', plan: 'PREMIUM' },
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/insights',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/hooks/usePrivacy', () => ({
  usePrivacy: () => ({ isPrivate: false }),
}));

// ─── Fixtures ────────────────────────────────────────────────

const SOURCE_NOTE = 'Basado en tus registros de energía del check-in diario.';

const SUMMARY = {
  weekLabel: '8 — 14 sep 2025',
  score: 68,
  totalActivities: 31,
  checkins: { count: 5, avgEmotion: 3.8, avgEnergy: 4.2, avgFocus: 3.6, avgStress: 2.3 },
  habits: { completed: 11, topStreak: 7, topHabit: 'Meditación matutina' },
  meditation: { sessions: 4, totalMinutes: 48, avgDuration: 12 },
  journal: { entries: 5 },
  wellness: { logs: 4, avgMood: 3.8, avgSleep: 3.2 },
  nutrition: { logs: 3, avgWater: 5 },
  finance: { income: 1450, expense: 1361, balance: 89 },
  streaks: { bestEmpireStreak: 7, bestEmpireName: 'Disciplina' },
};

const COMPARISON = {
  emotionTrend: 0.1,
  energyTrend: 0.5,
  stressTrend: -0.1,
  activityTrend: 0.15,
  meditationTrend: 0.3,
  habitTrend: 0.1,
};

const ENERGY_INSIGHT = {
  id: 'insight-2',
  type: 'positive' as const,
  category: 'energía',
  icon: '⚡',
  title: 'Energía alta',
  description: 'Promedio 4.2/5. Mejoró desde la semana pasada.',
};

const HABIT_INSIGHT = {
  id: 'insight-1',
  type: 'positive' as const,
  category: 'hábitos',
  icon: '✅',
  title: 'Racha de 7 días en hábitos',
  description: '7 días seguidos en Disciplina.',
};

let insightsFixture: Array<Record<string, unknown>> = [ENERGY_INSIGHT, HABIT_INSIGHT];

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  insightsFixture = [ENERGY_INSIGHT, HABIT_INSIGHT];
  H.apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/insights') {
      return ok({ summary: SUMMARY, insights: insightsFixture, comparison: COMPARISON, plan: 'PREMIUM' });
    }
    throw new Error(`unexpected apiFetch ${path}`);
  });
});

// ─── Tests ───────────────────────────────────────────────────

describe('FASE 28 — Energy Insight: la fuente (check-in diario) queda explícita', () => {
  it('1. la nota aclaratoria aparece en la tarjeta de energía — exactamente una vez en pantalla', async () => {
    render(<InsightsPage />);
    await screen.findByText('Energía alta');
    const notes = screen.getAllByText(SOURCE_NOTE);
    expect(notes.length).toBe(1);
  });

  it('2. el valor medio sigue mostrándose sin cambios (descripción y fila Energía del detalle)', async () => {
    render(<InsightsPage />);
    await screen.findByText('Energía alta');

    // Insight description (comes from the API payload) — untouched.
    expect(screen.getByText('Promedio 4.2/5. Mejoró desde la semana pasada.')).toBeTruthy();

    // "Tu semana en detalle" → Check-ins card → Energía row (avgEnergy).
    expect(screen.getByText('4.2/5')).toBeTruthy();
  });

  it('3. energyTrend sigue funcionando en "Semana a semana"', async () => {
    render(<InsightsPage />);
    await screen.findByText('Energía alta');

    // TrendIndicator for energyTrend = 0.5 → "+0.5 ↑" (TrendingUp branch).
    expect(screen.getByText('+0.5 ↑')).toBeTruthy();
  });

  it('4. la fuente declarada es el check-in diario; WellnessLog ("Bienestar físico") no aparece como fuente', async () => {
    render(<InsightsPage />);
    await screen.findByText('Energía alta');

    const note = screen.getByText(SOURCE_NOTE);
    expect(note.textContent).toContain('check-in diario');

    // "Bienestar físico" is the WellnessLog.energy label (Imperio Energía).
    // It must never leak into Energy Insights as the source.
    expect(screen.queryByText(/Bienestar físico/)).toBeNull();
  });

  it('5. sin tarjeta de energía no hay nota huérfana — y el resto de la página sigue intacta', async () => {
    insightsFixture = [HABIT_INSIGHT];
    render(<InsightsPage />);
    await screen.findByText('Racha de 7 días en hábitos');

    expect(screen.queryByText(SOURCE_NOTE)).toBeNull();
    // avgEnergy detail row keeps rendering even without an energy insight card.
    expect(screen.getByText('4.2/5')).toBeTruthy();
  });

  it('6. jerarquía visual: la nota es secundaria (patrón caption existente) y vive dentro de la tarjeta de energía', async () => {
    render(<InsightsPage />);
    const heading = await screen.findByRole('heading', { level: 3, name: 'Energía alta' });

    const note = screen.getByText(SOURCE_NOTE);
    // Reuses the page's existing caption pattern (no new colors/fonts):
    // same classes as "días esta semana" / "completados" captions.
    expect(note.className).toContain('text-[10px]');
    expect(note.className).toContain('text-[#888]');

    // Same card as the energy heading (one cohesive card, no new card added).
    const card = note.closest('.insight-card') as HTMLElement | null;
    expect(card).toBeTruthy();
    expect(within(card!).getByRole('heading', { level: 3, name: 'Energía alta' })).toBe(heading);
  });
});
