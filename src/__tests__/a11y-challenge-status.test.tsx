// @vitest-environment jsdom
// N-8 · §13 — Challenge completion accessible feedback contract.
// Proves the completion renders an accessible status announcement exactly
// once (no duplicated live regions) and nothing when not completed.

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ChallengeStatus } from '@/components/gamification/ChallengeStatus';
import { MicroReward } from '@/components/ui/MicroReward';

afterEach(cleanup);

describe('ChallengeStatus — feedback accesible de challenge completado (N-8 §3)', () => {
  it('cuando se completa: existe una región role="status" con el anuncio', () => {
    render(<ChallengeStatus completed title="Completa 3 hábitos hoy" />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('Desafío diario completado: Completa 3 hábitos hoy');
  });

  it('el anuncio aparece exactamente UNA vez (sin live regions duplicadas)', () => {
    render(<ChallengeStatus completed title="Completa 3 hábitos hoy" />);
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(1);
  });

  it('sin completar: no genera ningún anuncio ni badge', () => {
    render(<ChallengeStatus completed={false} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Completado')).toBeNull();
  });

  it('la transición a completado inserta la región viva en el DOM (se anuncia)', async () => {
    const { rerender } = render(<ChallengeStatus completed={false} title="Reto X" />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<ChallengeStatus completed title="Reto X" />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy();
    });
    expect(screen.getByRole('status').textContent).toContain('Reto X');
  });
});

describe('MicroReward — feedback de éxito anunciado (N-8 §1/S1)', () => {
  it('renderiza role="status" mientras es visible, con el mensaje de éxito', async () => {
    const onComplete = vi.fn();
    render(<MicroReward trigger={true} message="Hábito completado" onComplete={onComplete} />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('Hábito completado');

    // Se desmonta solo tras 1.8 s (comportamiento existente intacto)
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 2500 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sin trigger no renderiza nada', () => {
    render(<MicroReward trigger={false} message="Hábito completado" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
