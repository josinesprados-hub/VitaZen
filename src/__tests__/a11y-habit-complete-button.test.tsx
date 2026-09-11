// @vitest-environment jsdom
// N-8 · §13 — Habit completion button accessibility contract.
// Proves the control has an accessible name, exposes completed state
// through aria-pressed, is a real <button> and is keyboard-activatable.

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitCompleteButton } from '@/components/habits/HabitCompleteButton';

afterEach(cleanup);

describe('HabitCompleteButton — accesibilidad (N-8 §2)', () => {
  it('tiene nombre accesible que incluye el nombre del hábito', () => {
    render(
      <HabitCompleteButton habitName="Meditar" completed={false} onComplete={() => {}} />
    );
    const btn = screen.getByRole('button', { name: 'Completar hábito: Meditar' });
    expect(btn).toBeTruthy();
  });

  it('expone el estado completado/no completado mediante aria-pressed (no solo color)', () => {
    const { rerender } = render(
      <HabitCompleteButton habitName="Meditar" completed={false} onComplete={() => {}} />
    );
    const btn = screen.getByRole('button', { name: 'Completar hábito: Meditar' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    rerender(
      <HabitCompleteButton habitName="Meditar" completed={true} onComplete={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Completar hábito: Meditar' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('es un <button> nativo (activable por teclado por semántica)', () => {
    render(
      <HabitCompleteButton habitName="Leer" completed={false} onComplete={() => {}} />
    );
    const btn = screen.getByRole('button', { name: 'Completar hábito: Leer' }) as HTMLElement;
    expect(btn.tagName).toBe('BUTTON');
  });

  it('se activa con Enter y con Espacio mediante teclado', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<HabitCompleteButton habitName="Leer" completed={false} onComplete={onComplete} />);
    const btn = screen.getByRole('button', { name: 'Completar hábito: Leer' });

    btn.focus();
    await user.keyboard('{Enter}');
    expect(onComplete).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('el icono Check es decorativo y no duplica el nombre accesible', () => {
    render(
      <HabitCompleteButton habitName="Leer" completed={true} onComplete={() => {}} />
    );
    const btn = screen.getByRole('button', { name: 'Completar hábito: Leer' });
    const svg = btn.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // The accessible name must be exactly the label — no duplicated "completar" from the icon
    expect(btn.getAttribute('aria-label')).toBe('Completar hábito: Leer');
  });

  it('responde a onClick (contrato de activación con puntero)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<HabitCompleteButton habitName="Leer" completed={false} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: 'Completar hábito: Leer' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
