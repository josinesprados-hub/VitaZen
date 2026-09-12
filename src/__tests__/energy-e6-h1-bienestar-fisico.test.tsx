// @vitest-environment jsdom
/**
 * E-6 — H-1: the Imperio ⚡ Energía presents WellnessLog.energy as
 * "Bienestar físico" (with a plain-language 1–5 scale hint), while the daily
 * check-in keeps its own global "Energía" name.
 *
 * What must NOT change (asserted here so regressions get caught):
 *   - DailyCheckin surfaces keep saying "Energía" (CheckInModal slider).
 *   - The API field stays `energy` (no API/DB/data change — naming only).
 *   - The empire keeps its global name "Energía" (page title).
 *
 * Tests avoid brittle HTML-order assertions: they query by accessible role
 * and visible text, never by DOM position.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnergiaPage from '@/app/(dashboard)/imperio/energia/page';
import { CheckInModal } from '@/components/checkin/CheckInModal';

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
  useScreenshotMode: () => ({ displayUser: null, isActive: () => false }),
}));
vi.mock('@/hooks/useMadridDayRefresh', () => ({
  useMadridDayRefresh: () => {},
}));
vi.mock('@/components/ui/EmpireTipsSection', () => ({
  default: () => <div data-testid="tips-stub" />,
}));

// ─── Fixtures ────────────────────────────────────────────────

const WELLNESS_LOG = {
  id: 'wl-1',
  date: '2026-09-07T10:00:00.000Z',
  mood: 3,
  energy: 3,
  sleep: 3,
  stress: 3,
  notes: null,
  createdAt: '2026-09-07T10:30:00.000Z',
};

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  H.apiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
    const method = (options?.method || 'GET').toUpperCase();
    if (method === 'GET' && path === '/api/wellness') return ok({ logs: [WELLNESS_LOG] });
    if (method === 'GET' && path === '/api/nutrition') return ok({ logs: [] });
    throw new Error(`unexpected apiFetch ${method} ${path}`);
  });
});

// ─── Tests ───────────────────────────────────────────────────

describe('E-6 H-1 — Imperio ⚡ Energía uses "Bienestar físico" for WellnessLog.energy', () => {
  async function openWellnessForm() {
    const user = userEvent.setup();
    render(<EnergiaPage />);
    await screen.findByText('Registro de Bienestar');
    const section = screen.getByText('Registro de Bienestar').parentElement!.parentElement! as HTMLElement;
    await user.click(within(section).getByRole('button', { name: '+ Registrar hoy' }));
    return user;
  }

  it('1. the wellness form rates "Bienestar físico" — no standalone "Energía" rating — with the plain-language scale', async () => {
    await openWellnessForm();

    const group = await screen.findByRole('radiogroup', { name: 'Bienestar físico' });
    expect(group).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Energía' })).toBeNull();

    // Plain-language scale explanation (everyday wellbeing wording, no
    // clinical claims; deliberately different from the check-in vocabulary).
    expect(screen.getByText('1 = Muy bajo · 2 = Bajo · 3 = Normal · 4 = Bueno · 5 = Muy bueno')).toBeTruthy();
  });

  it('2. the records list shows the energy value under "Bienestar físico:"', async () => {
    render(<EnergiaPage />);
    await screen.findByText('Registro de Bienestar');

    // The stored row (WELLNESS_LOG) renders its energy metric with the new
    // label; the label+value live in the same text span.
    const listLabel = await screen.findByText(/Bienestar físico:/);
    expect(listLabel.textContent).toContain('Bienestar físico:');
  });

  it('3. the edit dialog rates "Bienestar físico" too', async () => {
    const user = userEvent.setup();
    render(<EnergiaPage />);
    await screen.findByText('Registro de Bienestar');

    await user.click(screen.getByRole('button', { name: /Editar registro de bienestar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar bienestar' });
    expect(within(dialog).getByRole('radiogroup', { name: 'Bienestar físico' })).toBeTruthy();
    expect(within(dialog).getByRole('radiogroup', { name: 'Estado de ánimo' })).toBeTruthy();
    expect(within(dialog).queryByRole('radiogroup', { name: 'Energía' })).toBeNull();
    expect(within(dialog).getByText('1 = Muy bajo · 2 = Bajo · 3 = Normal · 4 = Bueno · 5 = Muy bueno')).toBeTruthy();
  });

  it('4. the empire keeps its global "Energía" name (title) — only the metric is renamed', async () => {
    render(<EnergiaPage />);
    const title = await screen.findByRole('heading', { level: 1, name: 'Energía' });
    expect(title).toBeTruthy();
  });
});

describe('E-6 H-1 — the daily check-in keeps its own "Energía"', () => {
  it('5. CheckInModal still labels its energy slider "Energía" and never "Bienestar físico"', () => {
    render(
      <CheckInModal
        onClose={() => {}}
        onSave={async () => ({ xpAwarded: 0 })}
      />,
    );
    expect(screen.getByText('Energía')).toBeTruthy();
    expect(screen.queryByText('Bienestar físico')).toBeNull();
  });
});

describe('E-6 H-1 — API contract untouched', () => {
  it('6. POST /api/wellness still accepts and returns the `energy` field (route-level smoke)', async () => {
    vi.resetModules();

    // Real Madrid "today" — the route under test uses the REAL date utils
    // (no mocks on dates here), so G-02 only accepts today/yesterday/anteayer.
    const todayKey = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ')[0];

    const empireProgressUpsert = vi.fn().mockResolvedValue({});
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
      id: 'wl-new',
      ...create,
    }));
    const MOCK_TX = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      wellnessLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
        findFirst: vi.fn().mockResolvedValue(null),
      },
      nutritionLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      empireProgress: { upsert: empireProgressUpsert },
    };
    vi.doMock('@/lib/db', () => ({
      db: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)) },
    }));
    vi.doMock('@/lib/auth', () => ({
      getAuthUser: vi.fn(),
      getAuthUserBasic: vi.fn().mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'u@test.com' }),
    }));
    vi.doMock('@/lib/rate-limit', () => ({
      rateLimit: vi.fn().mockResolvedValue({ limited: false }),
      RATE_LIMITS: {},
      rateLimitedResponse: vi.fn(),
    }));
    vi.doMock('@/lib/challenge-auto-complete', () => ({
      tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('@/lib/widgets/triggers', () => ({
      onEnergiaChange: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('@/lib/achievements', () => ({
      evaluateAchievements: vi.fn().mockResolvedValue([]),
    }));

    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(new Request('http://localhost/api/wellness', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayKey, mood: 3, energy: 4, sleep: 3, stress: 2 }),
    }) as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    // The API field name is unchanged — H-1 is presentation-only.
    expect(json.log).toHaveProperty('energy', 4);
    expect(json.log).toHaveProperty('mood', 3);
  });
});
