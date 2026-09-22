// @vitest-environment jsdom
// ═════════════════════════════════════════════════════════════════════
// FASE 30 — BUG 1: EL HISTORIAL NO ES UNA FUNCIONALIDAD PREMIUM
// ═════════════════════════════════════════════════════════════════════
//
// Before: ThreadSidebar wrapped every date group older than "Esta semana"
// (groupIdx >= 3) in a PremiumGate for FREE users — opacity-40 +
// pointer-events-none + "Historial completo → Explorar Élite". Old rows had
// no onClick and no ⋯ menu, so FREE could not open, rename, archive,
// restore or delete its own old conversations (the root cause reported by
// the user). A bottom PremiumHistoryGate upsold the history too.
//
// After: conversation age is irrelevant — every group renders the same
// interactive rows for FREE and PREMIUM alike. The only plan-gated bits
// left in the sidebar are LEGITIMATE premium affordances (the Élite
// context indicator), and the full history is reachable via the new
// "Cargar más" cursor-pagination button.
// ═════════════════════════════════════════════════════════════════════

import React, { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import ThreadSidebar from '@/components/mentor/ThreadSidebar';
import type { Thread } from '@/components/mentor/MentorChatTypes';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const OLD_THREAD: Thread = {
  id: 'thr-old-1',
  title: 'Conversación antigua',
  archived: false,
  createdAt: daysAgo(30),
  updatedAt: daysAgo(20), // > 7 días → antiguo grupo "Anterior"
};

function makeProps(over: Partial<Parameters<typeof ThreadSidebar>[0]> = {}) {
  const oldThread = over.groupedThreads?.Anterior?.[0] ?? OLD_THREAD;
  return {
    backHref: '/imperio',
    tab: 'active' as const,
    searchQuery: '',
    threads: [oldThread],
    activeThread: null,
    totalActiveCount: 1,
    totalArchivedCount: 0,
    isPremium: false,
    remaining: 10,
    dailyLimit: 10,
    editingThreadId: null,
    editTitle: '',
    activeThreads: [oldThread],
    archivedThreads: [],
    groupedThreads: { Anterior: [oldThread] },
    favorites: [],
    hasMoreThreads: false,
    loadingMore: false,
    onLoadMore: vi.fn(),
    onCreateThread: vi.fn(),
    onSelectThread: vi.fn(),
    onTabChange: vi.fn(),
    onSearchChange: vi.fn(),
    onContextMenu: vi.fn(),
    onRenameThread: vi.fn(),
    onCancelEdit: vi.fn(),
    onEditTitleChange: vi.fn(),
    onSelectFavorite: vi.fn(),
    onShowLimitModal: vi.fn(),
    editInputRef: createRef<HTMLInputElement>(),
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════

describe('FASE 30 — ThreadSidebar: FREE puede operar conversaciones antiguas (§1/§12.1-5)', () => {
  it('1. la conversación de hace >7 días se renderiza INTERACTIVA para FREE (role button)', () => {
    render(<ThreadSidebar {...makeProps()} />);
    const row = screen.getByRole('button', { name: /Conversación antigua/ });
    expect(row).toBeTruthy();
  });

  it('2. la fila antigua tiene menú ⋯ ("Más opciones") → FREE puede eliminar/archivar/restaurar', () => {
    render(<ThreadSidebar {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Más opciones' })).toBeTruthy();
  });

  it('3. al pulsar la fila antigua se abre la conversación (onSelectThread con su id)', () => {
    const onSelectThread = vi.fn();
    render(<ThreadSidebar {...makeProps({ onSelectThread })} />);
    fireEvent.click(screen.getByRole('button', { name: /Conversación antigua/ }));
    expect(onSelectThread).toHaveBeenCalledWith('thr-old-1');
  });

  it('4. NO aparece "Historial completo" ni "Explorar Élite" como bloqueo del historial FREE', () => {
    render(<ThreadSidebar {...makeProps()} />);
    expect(screen.queryByText('Historial completo')).toBeNull();
    expect(screen.queryByText('Explorar Élite')).toBeNull();
    expect(screen.queryByText(/Hay más aquí/)).toBeNull();
  });

  it('5. sin PremiumGate por antigüedad aunque haya varios grupos antiguos y 4+ conversaciones', () => {
    const t1 = { ...OLD_THREAD, id: 't1', title: 'Antigua A', updatedAt: daysAgo(10) };
    const t2 = { ...OLD_THREAD, id: 't2', title: 'Antigua B', updatedAt: daysAgo(15) };
    const t3 = { ...OLD_THREAD, id: 't3', title: 'Antigua C', updatedAt: daysAgo(40) };
    const t4 = { ...OLD_THREAD, id: 't4', title: 'Antigua D', updatedAt: daysAgo(50) };
    render(
      <ThreadSidebar
        {...makeProps({
          threads: [t1, t2, t3, t4],
          activeThreads: [t1, t2, t3, t4],
          groupedThreads: { 'Este mes': [t1, t2], Anterior: [t3, t4] },
        })}
      />,
    );
    // All four are interactive rows (no gated/pointer-events-none variant)
    for (const title of ['Antigua A', 'Antigua B', 'Antigua C', 'Antigua D']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: 'Más opciones' })).toHaveLength(4);
    expect(screen.queryByText('Explorar Élite')).toBeNull();
  });

  it('6. FREE en 5/5 mantiene el aviso del límite de CREACIÓN (feature legítima intacta)', () => {
    render(<ThreadSidebar {...makeProps({ totalActiveCount: 5 })} />);
    expect(screen.getByText('5/5 conversaciones')).toBeTruthy();
  });

  it('7. la cuota diaria de mensajes sigue visible para FREE (10/10) — independiente de conversaciones', () => {
    render(<ThreadSidebar {...makeProps({ remaining: 10, dailyLimit: 10 })} />);
    expect(screen.getByText('10/10')).toBeTruthy();
    expect(screen.getByText('Mensajes hoy')).toBeTruthy();
  });

  it('8. PREMIUM conserva su indicador legítimo de contexto profundo', () => {
    render(<ThreadSidebar {...makeProps({ isPremium: true, remaining: null })} />);
    expect(screen.getByText('Memoria contextual profunda')).toBeTruthy();
  });
});

describe('FASE 30 — ThreadSidebar: paginación "Cargar más" (§2/§12.14)', () => {
  it('9. muestra "Cargar más" cuando hay más páginas y dispara onLoadMore', () => {
    const onLoadMore = vi.fn();
    render(<ThreadSidebar {...makeProps({ hasMoreThreads: true, onLoadMore })} />);
    const btn = screen.getByRole('button', { name: 'Cargar más' });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('10. mientras carga muestra "Cargando..." y deshabilita el botón', () => {
    render(<ThreadSidebar {...makeProps({ hasMoreThreads: true, loadingMore: true })} />);
    const btn = screen.getByRole('button', { name: 'Cargando...' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('11. sin más páginas no hay botón (y sigue sin haber upsell Premium)', () => {
    render(<ThreadSidebar {...makeProps({ hasMoreThreads: false })} />);
    expect(screen.queryByText('Cargar más')).toBeNull();
    expect(screen.queryByText('Explorar Élite')).toBeNull();
  });
});
