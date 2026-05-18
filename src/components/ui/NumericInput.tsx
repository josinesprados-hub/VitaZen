'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * NumericInput — premium numeric input for VitaZen.
 *
 * European/Spanish format: dot = thousands separator, comma = decimal separator.
 *
 * UX rules:
 * - Permissive during typing (no blocking, no cursor jumps)
 * - Normalize/parse only on blur
 * - European format: "1.000" → 1000, "1,5" → 1.5, "2.500,75" → 2500.75
 *
 * Parsing strategy:
 * - If comma + dot present: dots = thousands, comma = decimal
 *   "2.500,75" → remove dots → "2500,75" → comma→dot → "2500.75" → 2500.75
 * - If only comma: comma = decimal
 *   "1,5" → "1.5" → 1.5
 * - If only dot: check pattern
 *   "1.000" matches \d{1,3}(\.\d{3})+ → thousands → 1000
 *   "1.5" doesn't match → decimal → 1.5
 * - If neither: plain number
 */

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  /** Use "decimal" for amounts (€), "numeric" for integers (water glasses, minutes) */
  inputMode?: 'decimal' | 'numeric';
  /** Whether to allow decimal values */
  allowDecimal?: boolean;
  disabled?: boolean;
}

export function NumericInput({
  value,
  onChange,
  placeholder,
  className,
  min,
  max,
  inputMode = 'decimal',
  allowDecimal = true,
  disabled = false,
}: NumericInputProps) {
  const [raw, setRaw] = useState(formatEuropean(value, allowDecimal));
  const isFocused = useRef(false);

  // Sync from external value changes (only when not actively editing)
  useEffect(() => {
    if (!isFocused.current) {
      setRaw(formatEuropean(value, allowDecimal));
    }
  }, [value, allowDecimal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Permissive: allow digits, dots, commas, minus
    // Structure is not validated during typing — we parse properly on blur.
    // This prevents blocking European input like "2.500,75" or "1.000"
    if (input === '' || /^-?[\d.,]*$/.test(input)) {
      setRaw(input);

      // Propagate best-effort parsed value to parent during typing.
      // This prevents race conditions where submit reads stale state
      // because onChange was only called on blur.
      // Does NOT rewrite the display (raw is managed internally).
      const parsed = parseEuropean(input, allowDecimal);
      let clamped = parsed;
      if (min !== undefined && clamped < min) clamped = min;
      if (max !== undefined && clamped > max) clamped = max;
      if (clamped !== value) {
        onChange(clamped);
      }
    }
  };

  const handleFocus = () => {
    isFocused.current = true;
  };

  const handleBlur = () => {
    isFocused.current = false;
    const parsed = parseEuropean(raw, allowDecimal);

    // Clamp to min/max
    let clamped = parsed;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;

    // Update display with clean European-formatted value
    setRaw(formatEuropean(clamped, allowDecimal));

    // Propagate to parent if changed
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      value={raw}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      autoComplete="off"
    />
  );
}

// ═══════════════════════════════════════════
// European number formatting & parsing
// ═══════════════════════════════════════════

/**
 * Format a number for European display.
 * - Decimal: 2500.75 → "2.500,75"
 * - Integer: 2500 → "2.500"
 * - Small: 1.5 → "1,5"
 */
function formatEuropean(n: number, allowDecimal: boolean): string {
  if (n === 0) return '0';

  if (allowDecimal) {
    // Format with up to 2 decimal places, strip trailing zeros
    const fixed = n.toFixed(2);
    const cleaned = fixed.replace(/\.?0+$/, ''); // "2500.75" or "2500"
    const [intPart, decPart] = cleaned.split('.');
    const formatted = addThousandsSep(intPart);
    return decPart ? `${formatted},${decPart}` : formatted;
  }

  // Integer: add thousands separators
  return addThousandsSep(Math.round(n).toString());
}

/** Add dot as thousands separator: "2500" → "2.500", "1000000" → "1.000.000" */
function addThousandsSep(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse European-formatted number string to a numeric value.
 *
 * Rules:
 * 1. Comma + dot present → dots = thousands, comma = decimal
 *    "2.500,75" → remove dots → "2500,75" → comma→dot → "2500.75" → 2500.75
 *
 * 2. Only comma → comma = decimal
 *    "1,5" → "1.5" → 1.5
 *
 * 3. Only dot → disambiguate by pattern:
 *    "1.000" matches \d{1,3}(\.\d{3})+ → thousands → 1000
 *    "1.5" doesn't match → decimal → 1.5
 *
 * 4. Neither → plain number
 */
function parseEuropean(raw: string, allowDecimal: boolean): number {
  if (!raw || raw.trim() === '') return 0;

  const trimmed = raw.trim();

  // Handle edge cases: just separators
  if (/^-?[.,]+$/.test(trimmed)) return 0;

  const isNegative = trimmed.startsWith('-');
  const digits = isNegative ? trimmed.slice(1) : trimmed;

  const hasComma = digits.includes(',');
  const hasDot = digits.includes('.');

  let normalized: string;

  if (hasComma && hasDot) {
    // European: dots = thousands, comma = decimal
    // "2.500,75" → remove dots → "2500,75" → replace comma → "2500.75"
    normalized = digits.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Comma = decimal: "1,5" → "1.5"
    normalized = digits.replace(',', '.');
  } else if (hasDot) {
    // Ambiguous: dot could be thousands or decimal
    // Check if pattern matches European thousands: \d{1,3}(\.\d{3})+
    if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
      // Dots are thousands separators: "1.000" → 1000, "10.000" → 10000
      normalized = digits.replace(/\./g, '');
    } else {
      // Dot is decimal: "1.5", "3.14"
      normalized = digits;
    }
  } else {
    // No separators: plain number
    normalized = digits;
  }

  // Clean trailing dot (e.g. "3." → "3")
  normalized = normalized.replace(/\.$/, '');

  const parsed = allowDecimal ? parseFloat(normalized) : parseInt(normalized, 10);
  const result = isNaN(parsed) ? 0 : parsed;

  return isNegative ? -result : result;
}
