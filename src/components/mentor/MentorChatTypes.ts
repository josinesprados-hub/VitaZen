'use client';

import { getMadridDateKey, getTodayDateKey, daysBetweenDateKeys } from '@/lib/dates';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface Thread {
  id: string;
  title: string;
  archived: boolean;
  updatedAt: string;
  createdAt: string;
  messages?: { content: string; role: string; createdAt: string }[];
}

export interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  isFavorited?: boolean;
}

export interface Favorite {
  id: string;
  content: string;
  favoritedAt: string;
  thread: { id: string; title: string };
}

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

export const STORAGE_KEY_PREFIX = 'vitazen_active_thread';
export const VISIBILITY_DEBOUNCE_MS = 1500;
export const DATE_GROUP_ORDER = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Anterior'];

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

export function getRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // Calendar-day difference using Madrid-normalized dates
  const entryKey = getMadridDateKey(date);
  const todayKey = getTodayDateKey();
  const diffDays = daysBetweenDateKeys(entryKey, todayKey);

  if (diffMins < 1 && diffDays === 0) return 'Ahora';
  if (diffMins < 60 && diffDays === 0) return `Hace ${diffMins} min`;
  if (diffHours < 24 && diffDays === 0) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  const [eY, eM, eD] = entryKey.split('-').map(Number);
  const entryDate = new Date(eY, eM - 1, eD);
  return entryDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function getDateGroup(dateStr: string): string {
  // Calendar-day difference using Madrid-normalized dates
  const entryKey = getMadridDateKey(new Date(dateStr));
  const todayKey = getTodayDateKey();

  if (entryKey === todayKey) return 'Hoy';

  const diffDays = daysBetweenDateKeys(entryKey, todayKey);

  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return 'Esta semana';
  if (diffDays < 30) return 'Este mes';
  return 'Anterior';
}

export function getProgressColor(rem: number, limit: number): string {
  if (!isFinite(limit)) return '#c8a55a';
  const pct = rem / limit;
  if (pct > 0.5) return '#c8a55a';
  if (pct > 0.25) return '#e8a849';
  return '#ef4444';
}
