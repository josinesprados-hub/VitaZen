// @vitest-environment jsdom
// N-8 · §13 — CheckInModal accessibility contracts:
//  - labels programmatically associated (intention, note)
//  - radiogroup/radio semantics with arrow-key navigation + roving tabindex
//  - focus moves to the confirmation action after save (no focus drop)
//  - save success is announced via role="status"
//  - Escape closes the dialog (existing behavior preserved)

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckInModal } from '@/components/checkin/CheckInModal';

afterEach(cleanup);

function renderModal(onSave = vi.fn(async () => ({ xpAwarded: 10 })), onClose = vi.fn()) {
  render(<CheckInModal onClose={onClose} onSave={onSave} />);
  return { onSave, onClose };
}

describe('CheckInModal — formularios (N-8 §6/§13)', () => {
  it('el input de intención está asociado a su label', () => {
    renderModal();
    const input = screen.getByLabelText('Intención del día') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('el textarea de nota está asociado a su label', () => {
    renderModal();
    const note = screen.getByLabelText(/Nota/) as HTMLTextAreaElement;
    expect(note.tagName).toBe('TEXTAREA');
  });

  it('los errores de guardado siguen anunciándose con role="alert"', async () => {
    const onSave = vi.fn(async () => { throw new Error('network'); });
    renderModal(onSave);
    const intention = screen.getByLabelText('Intención del día') as HTMLInputElement;
    fireEvent.change(intention, { target: { value: 'Escribir' } });
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });
});

describe('CheckInModal — radiogroups con patrón ARIA radio (N-8 §13)', () => {
  it('cada dimensión es un radiogroup con nombre y radios con aria-checked', () => {
    renderModal();
    const group = screen.getByRole('radiogroup', { name: 'Estado emocional' });
    expect(group).toBeTruthy();
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(5);
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toBe('3');
  });

  it('un solo tab stop por grupo (roving tabindex)', () => {
    renderModal();
    const group = screen.getByRole('radiogroup', { name: 'Energía' });
    const radios = Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('las flechas mueven el valor y el foco dentro del grupo', () => {
    renderModal();
    const group = screen.getByRole('radiogroup', { name: 'Enfoque' });
    const radios = Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
    const current = radios.find((r) => r.getAttribute('aria-checked') === 'true')!;

    fireEvent.keyDown(current, { key: 'ArrowRight' });
    const afterRight = Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
    const checkedRight = afterRight.find((r) => r.getAttribute('aria-checked') === 'true')!;
    expect(checkedRight.textContent).toBe('4');

    fireEvent.keyDown(checkedRight, { key: 'ArrowLeft' });
    const afterLeft = Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
    const checkedLeft = afterLeft.find((r) => r.getAttribute('aria-checked') === 'true')!;
    expect(checkedLeft.textContent).toBe('3');
  });
});

describe('CheckInModal — foco y confirmación tras guardar (N-8 §4/§13)', () => {
  it('tras guardar: la confirmación se anuncia (role="status") y el foco va al botón Continuar', async () => {
    const onSave = vi.fn(async () => ({ xpAwarded: 10 }));
    renderModal(onSave);
    const intention = screen.getByLabelText('Intención del día') as HTMLInputElement;
    fireEvent.change(intention, { target: { value: 'Terminar N-8' } });
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation.textContent).toContain('Guardado');
    expect(confirmation.textContent).toContain('Terminar N-8');

    await waitFor(() => {
      const continueBtn = screen.getByRole('button', { name: 'Continuar' });
      expect(document.activeElement).toBe(continueBtn);
    });
  });

  it('el foco entra en el modal al abrir (botón Cerrar) y Escape lo cierra', async () => {
    const onClose = vi.fn();
    render(<CheckInModal onClose={onClose} onSave={vi.fn(async () => ({ xpAwarded: 0 }))} />);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
