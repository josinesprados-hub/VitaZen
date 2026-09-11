// @vitest-environment jsdom
// N-8 · §13 — Gamification state + navigation a11y contracts:
//  - achievement cards expose unlock state textually (not color/dot only)
//    and expose progress through progressbar semantics
//  - the mobile sidebar, when closed, is removed from the tab order /
//    accessibility tree (visibility) but restored on desktop
//  - the global toast close control has an accessible name

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AchievementCard } from '@/app/(dashboard)/logros/page';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastClose } from '@/components/ui/toast';
import type { AchievementData } from '@/app/(dashboard)/logros/page';

// Sidebar reads auth + screenshot-mode contexts (and usePrivacy internally)
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test' }, signOut: vi.fn() }),
}));
vi.mock('@/context/ScreenshotModeContext', () => ({
  useScreenshotMode: () => ({ displayUser: null, isActive: () => false }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const achievement = (over: Partial<AchievementData>): AchievementData => ({
  key: 'first-habit',
  title: 'Primer paso',
  description: 'Completa tu primer hábito',
  category: 'disciplina',
  icon: 'shield',
  target: 1,
  current: 1,
  percent: 100,
  unlocked: true,
  unlockedAt: '2026-01-01T00:00:00Z',
  hidden: false,
  ...over,
});

describe('AchievementCard — estado semántico del logro (N-8 §7/§13)', () => {
  it('logro desbloqueado: el estado no depende solo del punto dorado', () => {
    render(<AchievementCard achievement={achievement({ unlocked: true })} index={0} />);
    expect(screen.getByText('Logro desbloqueado')).toBeTruthy();
    expect(screen.queryByText('Logro bloqueado')).toBeNull();
  });

  it('logro bloqueado: expone textualmente que está bloqueado', () => {
    render(<AchievementCard achievement={achievement({ unlocked: false, percent: 40, current: 2, target: 5 })} index={0} />);
    expect(screen.getByText('Logro bloqueado')).toBeTruthy();
  });

  it('la barra de progreso es un progressbar con valor accesible', () => {
    render(<AchievementCard achievement={achievement({ unlocked: false, percent: 40, title: 'Primer paso' })} index={0} />);
    const bar = screen.getByRole('progressbar', { name: 'Progreso del logro Primer paso' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });
});

describe('Sidebar — fuera del orden de tabulación cuando está cerrado (N-8 §5/§11)', () => {
  it('cerrado en móvil: el panel es invisible (fuera del árbol de accesibilidad)', () => {
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);
    const aside = container.querySelector('aside')!;
    expect(aside.className).toContain('invisible');
    // Desktop restores visibility (the sidebar is permanent there)
    expect(aside.className).toContain('lg:visible');
  });

  it('abierto: el panel es visible y sigue siendo un diálogo nombrado', () => {
    const { container } = render(<Sidebar open={true} onClose={() => {}} />);
    const aside = container.querySelector('aside')!;
    expect(aside.className).not.toContain('invisible');
    expect(aside.getAttribute('role')).toBe('dialog');
    expect(aside.getAttribute('aria-label')).toBe('Menú de navegación');
    // Hamburger control target exists
    expect(aside.id).toBe('app-sidebar');
  });

  it('los enlaces de navegación exponen aria-current en la ruta activa', () => {
    const { container } = render(<Sidebar open={true} onClose={() => {}} />);
    const links = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.textContent?.includes('Inicio'))).toBe(true);
  });
});

describe('Toast — control de cierre con nombre accesible (N-8)', () => {
  it('ToastClose expone aria-label (icon-only con nombre)', () => {
    render(<ToastClose />);
    const btn = screen.getByRole('button', { name: 'Cerrar notificación' });
    expect(btn.tagName).toBe('BUTTON');
  });
});
