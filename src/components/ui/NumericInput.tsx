'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * NumericInput — premium numeric input for VitaZen.
 *
 * Solves common type="number" UX issues:
 * - Can't clear the field (forced to "0")
 * - Cursor jumps on edit
 * - Inconsistent mobile keyboard
 * - No decimal support
 *
 * Strategy: use type="text" + inputMode="decimal" (mobile numeric keyboard),
 * store raw string internally, parse to number on blur.
 * This lets users type naturally (empty, "0.", "3.5") without forced values.
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
  const [raw, setRaw] = useState(formatValue(value, allowDecimal));
  const isFocused = useRef(false);

  // Sync from external value changes (only when not actively editing)
  useEffect(() => {
    if (!isFocused.current) {
      setRaw(formatValue(value, allowDecimal));
    }
  }, [value, allowDecimal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Allow: empty, "-", digits, one dot, one comma
    // This is permissive during typing; we normalize on blur
    if (input === '' || input === '-' || input === '.' || input === ',') {
      setRaw(input);
      return;
    }

    // Allow typing "0.", "3.", etc. without forcing to "0"
    const pattern = allowDecimal
      ? /^-?\d*[.,]?\d*$/
      : /^-?\d*$/;

    if (pattern.test(input)) {
      setRaw(input);
    }
  };

  const handleFocus = () => {
    isFocused.current = true;
  };

  const handleBlur = () => {
    isFocused.current = false;
    const parsed = parseRaw(raw, allowDecimal);

    // Clamp to min/max
    let clamped = parsed;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;

    // Update display with clean value
    setRaw(formatValue(clamped, allowDecimal));

    // Propagate to parent if changed
    if (clamped !== value) {
      onChange(clamped);
    } else {
      // Even if value is same, we may need to clean display (e.g. "3." → "3")
      setRaw(formatValue(clamped, allowDecimal));
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

/** Format a number for display */
function formatValue(n: number, allowDecimal: boolean): string {
  if (n === 0) return '0';
  if (allowDecimal) {
    // Show up to 2 decimal places, strip trailing zeros
    return parseFloat(n.toFixed(2)).toString();
  }
  return Math.round(n).toString();
}

/** Parse raw string input to a number */
function parseRaw(raw: string, allowDecimal: boolean): number {
  if (!raw || raw.trim() === '') return 0;

  // Normalize comma to dot
  const normalized = raw.replace(',', '.');

  // Remove trailing dot (e.g. "3." → "3")
  const cleaned = normalized.replace(/\.$/, '');

  const parsed = allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}
