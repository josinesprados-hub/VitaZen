import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * European currency formatter — premium, precise, no abbreviations.
 * Format: 1.250,50 € | 12.500,00 € | -450,00 € | 0,00 €
 * Uses point for thousands, comma for decimals — es-ES standard.
 * Never abbreviates. Every cent visible. No 'k' shortcuts.
 */
const currencyFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(n: number): string {
  return currencyFormatter.format(n) + '\u00A0€';
}

/**
 * Compact European currency for tight spaces (date headers, pulse labels).
 * Same format as formatCurrency — no abbreviation, full precision.
 * Kept as a separate export for semantic clarity in tight-layout contexts.
 */
export function formatCurrencyCompact(n: number): string {
  return currencyFormatter.format(n) + '\u00A0€';
}
