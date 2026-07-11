// ═══════════════════════════════════════════
// Patrones de Vida — Observation Formatter
// ═══════════════════════════════════════════
//
// Consumes the Connections Engine (engine.ts) as
// single source of truth for all empire connections.
//
// This module ONLY handles:
// - Converting raw connection signals → human observations
// - Philosophical text filtering
// - Weight-based sorting and limiting
//
// NO correlation logic lives here.
// NO aggregation logic lives here.
// All detection is delegated to detectConnections().
//
// Emotional weight system:
// - ligera:   appears briefly, replaced easily
// - relevante: stays 2 weeks, replaced only by igual or stronger
// - profunda:  stays 4 weeks, replaced only by another profunda
//
// Stability over novelty.
// "Si hay duda: NO mostrar nada."
// ═══════════════════════════════════════════

import type {
  CrossEmpireData,
  LifeObservation,
  PatternDetectionResult,
} from './types';
import { getObservationText } from './copy';
import { passesPhilosophicalFilter } from './validation';
import { detectConnections } from './engine';

// ─── Configuration ───

const MAX_OBSERVATIONS = 2;

// ─── Main Detection Function ───
// Public API — same contract as before (PatternDetectionResult).
// All consumers (API route, mentor-context, life-memory) continue
// working without changes.

export function detectPatterns(data: CrossEmpireData): PatternDetectionResult {
  const engineResult = detectConnections(data);

  if (!engineResult.hasEnoughData) {
    return {
      observations: [],
      hasEnoughData: false,
      totalDataPoints: engineResult.totalDataPoints,
    };
  }

  // ── Convert engine signals to human observations ──
  const observations: LifeObservation[] = [];

  for (let i = 0; i < engineResult.connections.length; i++) {
    const signal = engineResult.connections[i];
    const text = getObservationText(signal.connection, i);

    const filterResult = passesPhilosophicalFilter(text);
    if (!filterResult.passes) {
      console.log(`[Patrones] Filtered: "${text}" — ${filterResult.reason}`);
      continue;
    }

    observations.push({
      id: signal.id,
      connection: signal.connection,
      text,
      empires: signal.empires,
      confidence: signal.confidence,
      weight: signal.weight,
    });
  }

  // Sort: profunda first, then relevante, then ligera
  // Within same weight: higher confidence first
  const weightOrder = { profunda: 2, relevante: 1, ligera: 0 };
  observations.sort((a, b) => {
    const wDiff = weightOrder[b.weight] - weightOrder[a.weight];
    if (wDiff !== 0) return wDiff;
    return b.confidence - a.confidence;
  });

  const finalObservations = observations.slice(0, MAX_OBSERVATIONS);

  return {
    observations: finalObservations,
    hasEnoughData: engineResult.hasEnoughData,
    totalDataPoints: engineResult.totalDataPoints,
  };
}