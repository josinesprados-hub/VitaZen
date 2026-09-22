// @vitest-environment jsdom
// ═════════════════════════════════════════════════════════════════════
// FASE 30 — BUG 3: CONTADOR STALE TRAS DELETE + INDEPENDENCIA DE CUOTAS
// ═════════════════════════════════════════════════════════════════════
//
// Spec §4 (ejemplo OBLIGATORIO):
//   Antes:   5/5 conversaciones · 10/10 mensajes
//   DELETE:  4/5 conversaciones · 10/10 mensajes   (¡NO 9/10!)
//
// Before the fix, deleteThread() only filtered the local list and left
// totalActiveCount stale until the next refetch — the "Nueva conversación"
// button stayed disabled (5/5) even though the server would allow creation.
//
// This test drives the REAL flow: sidebar ⋯ menu → Eliminar → confirm modal
// → local state update, and asserts the counters move IMMEDIATELY, that the
// daily message quota display is untouched, and that a new conversation can
// be created right after (4/5 → 5/5) without any refetch in between.
// ═════════════════════════════════════════════════════════════════════

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks de infraestructura ─────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user_1', plan: 'FREE' } }),
}));

vi.mock('@/context/ScreenshotModeContext', () => ({
  useScreenshotMode: () => ({ displayUser: { plan: 'FREE' } }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import MentorChat from '@/components/mentor/MentorChat';

// ─── Fixtures ─────────────────────────────────────────────────────────

function isoAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeThread(i: number, over: Partial<{ archived: boolean }> = {}) {
  return {
    id: `thr-${i}`,
    title: `Conversación ${i}`,
    archived: over.archived ?? false,
    createdAt: isoAgo(i),
    updatedAt: isoAgo(i),
  };
}

const FIVE_ACTIVE = [1, 2, 3, 4, 5].map(i => makeThread(i));

function threadsResponse(threads = FIVE_ACTIVE, totalActiveCount = threads.filter(t => !t.archived).length) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      threads,
      nextCursor: null,
      hasMore: false,
      historyLimited: false,
      remaining: 10,
      limit: 10,
      totalActiveCount,
      totalArchivedCount: 0,
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = url.split('?')[0];
    if (path === '/api/ai/threads' && (!init?.method || init.method === 'GET')) {
      return threadsResponse();
    }
    if (path === '/api/ai/threads' && init?.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
    }
    if (path === '/api/ai/threads' && init?.method === 'POST') {
      const now = new Date().toISOString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ thread: { id: 'thr-new-1', title: 'Nueva conversación', archived: false, createdAt: now, updatedAt: now } }),
      } as unknown as Response;
    }
    if (path.startsWith('/api/ai/threads/') && path.endsWith('/messages')) {
      return { ok: true, status: 200, json: async () => ({ messages: [] }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });
});

afterEach(cleanup);

// ═════════════════════════════════════════════════════════════════════

describe('FASE 30 — DELETE actualiza el contador INMEDIATAMENTE y no toca la cuota (§12.7/8/9/10/11)', () => {
  it('5/5 + 10/10 → eliminar una → 4/5 (botón activo) + 10/10 intacto → crear → 5/5', async () => {
    render(<MentorChat backHref="/imperio" />);

    // ── Estado inicial: 5/5 (botón de crear deshabilitado) y cuota 10/10 ──
    await screen.findByText('Conversación 1');
    expect(screen.getByText('5/5 conversaciones')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nueva conversación' })).toBeNull();
    expect(screen.getAllByText('10/10').length).toBeGreaterThan(0);
    expect(screen.getByText('Mensajes hoy')).toBeTruthy();

    // ── Abrir el menú ⋯ de la primera conversación y elegir Eliminar ──
    fireEvent.click(screen.getAllByRole('button', { name: 'Más opciones' })[0]);
    const menuDelete = await screen.findByRole('menuitem', { name: 'Eliminar' });
    fireEvent.click(menuDelete);

    // ── Modal de confirmación → confirmar ──
    const confirmDelete = await screen.findByRole('button', { name: 'Eliminar' });
    fireEvent.click(confirmDelete);

    // ── Tras DELETE: contador actualizado SIN refetch ──
    await waitFor(() => {
      expect(screen.queryByText('5/5 conversaciones')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Nueva conversación' })).toBeTruthy();
    // La conversación eliminada (la primera) desaparece inmediatamente;
    // el resto del listado permanece
    expect(screen.queryByText('Conversación 1')).toBeNull();
    expect(screen.getByText('Conversación 5')).toBeTruthy();
    // CUOTA DIARIA INTACTA: 10/10 (eliminar NO devuelve mensajes)
    expect(screen.getAllByText('10/10').length).toBeGreaterThan(0);

    // La petición DELETE se hizo exactamente una vez, con el thread correcto
    const deleteCalls = mockApiFetch.mock.calls.filter(
      ([url, init]) => String(url).split('?')[0] === '/api/ai/threads' && init?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
    expect(JSON.parse(String(deleteCalls[0][1].body)).threadId).toBe('thr-1');

    // ── 4/5 → crear otra → 5/5 (botón vuelve a deshabilitarse) ──
    fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
    await waitFor(() => {
      expect(screen.getByText('5/5 conversaciones')).toBeTruthy();
    });
    // La cuota sigue intacta tras crear
    expect(screen.getAllByText('10/10').length).toBeGreaterThan(0);

    // Solo un POST de creación
    const postCalls = mockApiFetch.mock.calls.filter(
      ([url, init]) => String(url).split('?')[0] === '/api/ai/threads' && init?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
  });

  it('eliminar una ARCHIVADA descuenta el contador de archivadas, no el de activas', async () => {
    const mixed = [...FIVE_ACTIVE.slice(0, 4), makeThread(9, { archived: true })];
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0];
      if (path === '/api/ai/threads' && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            threads: mixed,
            nextCursor: null,
            hasMore: false,
            historyLimited: false,
            remaining: 10,
            limit: 10,
            totalActiveCount: 4,
            totalArchivedCount: 1,
          }),
        } as unknown as Response;
      }
      if (path === '/api/ai/threads' && init?.method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });

    render(<MentorChat backHref="/imperio" />);
    await screen.findByText('Conversación 1');

    // Badge "Archivadas" = 1 antes del delete
    expect(screen.getByText('1')).toBeTruthy();

    // Eliminar la archivada (última fila → tiene icono Archive)
    const moreButtons = screen.getAllByRole('button', { name: 'Más opciones' });
    fireEvent.click(moreButtons[moreButtons.length - 1]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      // Archivadas pasa a 0 (badge desaparece) y las activas siguen en 4
      // → el botón "Nueva conversación" sigue activo (4/5 < 5)
      expect(screen.getByRole('button', { name: 'Nueva conversación' })).toBeTruthy();
    });
    expect(screen.queryByText('5/5 conversaciones')).toBeNull();
    expect(screen.getAllByText('10/10').length).toBeGreaterThan(0);
  });
});
