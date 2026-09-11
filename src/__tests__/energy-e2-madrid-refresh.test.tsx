// @vitest-environment jsdom
/**
 * E-2 — H-8 (integración real): /imperio/energia refresca en la medianoche
 * civil REAL de Europe/Madrid mediante el watcher existente
 * (useMadridDayRefresh → watchMadridDay → startOfNextDayMadrid), sin timers
 * propios de la página.
 *
 * Estrategia determinista (misma familia que gamification-n6 M1–M7, pero a
 * través de la PÁGINA completa): reloj congelado + timers falsos. La prueba
 * clave contra "timer propio" usa el día de 25 horas del cambio de hora de
 * otoño: +24h siguen siendo el MISMO día civil Madrid, así que un
 * setInterval/setTimeout(24h) — o un "start + 24h" — dispararía donde el
 * watcher real NO debe disparar; la medianoche real llega +24.5h.
 */

import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import EnergiaPage from '@/app/(dashboard)/imperio/energia/page';

// ─── Mocks (hoisted) — el hook de Madrid NO se mockea ────────

const H = vi.hoisted(() => {
  const apiFetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ logs: [] }),
  }));
  return { apiFetch };
});

vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ apiFetch: H.apiFetch }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', privacyStatsVisible: true } }),
}));
vi.mock('@/context/ScreenshotModeContext', () => ({
  useScreenshotMode: () => ({ displayUser: null, isActive: () => false }),
}));
vi.mock('@/components/ui/EmpireTipsSection', () => ({
  default: () => <div data-testid="tips-stub" />,
}));

function methodsCalled(): string[] {
  return H.apiFetch.mock.calls.map(
    ([p, o]: any[]) => `${((o?.method) || 'GET').toUpperCase()} ${p}`,
  );
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  H.apiFetch.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('E-2 H-8 — Energía reacciona a la medianoche Madrid real (watcher existente, DST-exacto)', () => {
  it('Caso día 25h (otoño) — un timer +24h no dispara; el refetch ocurre exactamente una vez en la medianoche real', async () => {
    vi.useFakeTimers();
    // 2026-10-24 22:30Z = 25 oct 00:30 Madrid (CEST). El día Madrid "Oct 25"
    // dura 25 h (el reloj retrocede dentro de él): la siguiente medianoche
    // civil REAL es 26 oct 00:00 CET = 25 oct 23:00Z, es decir +24.5 h.
    vi.setSystemTime(new Date('2026-10-24T22:30:00.000Z'));

    render(<EnergiaPage />);
    await flush();

    // Carga inicial: exactamente los dos GET de la página.
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    expect(methodsCalled()).toEqual(['GET /api/wellness', 'GET /api/nutrition']);
    H.apiFetch.mockClear();

    // +24 h → 25 oct 22:30Z = 23:30 Madrid del MISMO día civil (25 h).
    // Un timer propio de +24h habría disparado aquí; el watcher real no.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(0);

    // +31 min → cruzamos la medianoche civil real (25 oct 23:00:01Z).
    // Exactamente UNA ronda de refetch: sin doble refresh por la transición.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60_000 + 2_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    expect(methodsCalled()).toEqual(['GET /api/wellness', 'GET /api/nutrition']);
    H.apiFetch.mockClear();

    // El resto del día nuevo: sin polling, sin timers residuales.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 3600_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(0);
  });

  it('el watcher se reprograma: una segunda transición dispara una segunda ronda', async () => {
    vi.useFakeTimers();
    // 2026-09-11 21:59Z = 23:59 Madrid (CEST); medianoche real en +61 s
    // (22:00Z). Día normal de 24 h: la siguiente medianoche es +24 h.
    vi.setSystemTime(new Date('2026-09-11T21:59:00.000Z'));

    render(<EnergiaPage />);
    await flush();
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    H.apiFetch.mockClear();

    // Primera transición (Sep 11 → Sep 12).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000 + 1_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    H.apiFetch.mockClear();

    // Segunda transición (Sep 12 → Sep 13) — el watcher se reprogramó solo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600_000 + 2_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    expect(methodsCalled()).toEqual(['GET /api/wellness', 'GET /api/nutrition']);
  });

  it('sin transición de día no hay refetch alguno (la visibilidad sin cambio de clave no dispara)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T10:00:00.000Z'));

    render(<EnergiaPage />);
    await flush();
    expect(H.apiFetch).toHaveBeenCalledTimes(2);
    H.apiFetch.mockClear();

    // Horas pasando dentro del MISMO día civil Madrid: ni timers ni
    // visibilidad (sin cambio de clave) deben provocar fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6 * 3600_000);
    });
    expect(H.apiFetch).toHaveBeenCalledTimes(0);
  });
});
