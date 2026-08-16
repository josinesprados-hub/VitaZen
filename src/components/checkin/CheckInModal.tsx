'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Sunrise } from 'lucide-react';
import { EMOTION_EMOJIS } from '@/lib/emotion-emojis';

// ─── Emotion Labels ─────────────────────────────────────
// DASH-1: emojis now come from the shared single source of truth
// (src/lib/emotion-emojis.ts) so the dashboard and modal always agree.

const EMOTION_LABELS: Record<number, { label: string; emoji: string }> = {
  1: { label: 'Muy bajo', emoji: EMOTION_EMOJIS[1] },
  2: { label: 'Bajo', emoji: EMOTION_EMOJIS[2] },
  3: { label: 'Neutral', emoji: EMOTION_EMOJIS[3] },
  4: { label: 'Bien', emoji: EMOTION_EMOJIS[4] },
  5: { label: 'Excelente', emoji: EMOTION_EMOJIS[5] },
};

const ENERGY_LABELS: Record<number, { label: string }> = {
  1: { label: 'Agotado' },
  2: { label: 'Bajo' },
  3: { label: 'Normal' },
  4: { label: 'Activo' },
  5: { label: 'Pleno' },
};

const FOCUS_LABELS: Record<number, { label: string }> = {
  1: { label: 'Disperso' },
  2: { label: 'Distraído' },
  3: { label: 'Normal' },
  4: { label: 'Concentrado' },
  5: { label: 'Muy concentrado' },
};

const STRESS_LABELS: Record<number, { label: string }> = {
  1: { label: 'En calma' },
  2: { label: 'Relajado' },
  3: { label: 'Normal' },
  4: { label: 'Tenso' },
  5: { label: 'Sobrepasado' },
};

// ─── Slider Component ───────────────────────────────────
// DASH-25: Uses role="radiogroup" + aria-label so screen readers announce
// the dimension name and the selected value.

function ValueSlider({
  label,
  value,
  onChange,
  labels,
  sliderId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: Record<number, { label: string; emoji?: string }>;
  sliderId: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={`${sliderId}-value`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#999] uppercase tracking-wider font-medium">{label}</span>
        <span id={`${sliderId}-value`} className="text-xs text-champagne font-semibold">
          {labels[value]?.emoji && <span className="mr-1">{labels[value].emoji}</span>}
          {labels[value]?.label}
        </span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            aria-label={`${label}: ${v} — ${labels[v]?.label || ''}`}
            onClick={() => onChange(v)}
            className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-200 value-btn ${
              v <= value
                ? 'bg-champagne text-[#000000]'
                : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-[#888]'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Modal Props ────────────────────────────────────────

interface CheckInModalProps {
  onClose: () => void;
  onSave: (data: {
    emotion: number;
    energy: number;
    focus: number;
    stress: number;
    intention: string;
    note?: string;
  }) => Promise<{ xpAwarded: number }>;
  initialData?: {
    emotion?: number;
    energy?: number;
    focus?: number;
    stress?: number;
    intention?: string;
    note?: string;
  } | null;
}

// ─── Modal Component ────────────────────────────────────

export function CheckInModal({ onClose, onSave, initialData }: CheckInModalProps) {
  const [emotion, setEmotion] = useState(initialData?.emotion || 3);
  const [energy, setEnergy] = useState(initialData?.energy || 3);
  const [focus, setFocus] = useState(initialData?.focus || 3);
  const [stress, setStress] = useState(initialData?.stress || 3);
  const [intention, setIntention] = useState(initialData?.intention || '');
  const [note, setNote] = useState(initialData?.note || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [step, setStep] = useState(1); // Skip intro — go directly to form
  const [xpAwarded, setXpAwarded] = useState(0); // DASH-38: XP feedback after save

  // DASH-23/26: Focus management for accessibility.
  // - dialogRef: the modal container (receives initial focus)
  // - closeButtonRef: the close button (restored focus on close)
  // - previouslyFocused: the element that had focus before the modal opened
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Lock body scroll when modal is open.
  useEffect(() => {
    document.body.classList.add('scroll-locked');
    return () => {
      document.body.classList.remove('scroll-locked');
    };
  }, []);

  // DASH-23: Escape key closes the modal.
  // DASH-26: Focus is moved into the modal on open, trapped inside while open,
  //          and restored to the trigger element on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement;
    // Move focus into the modal — focus the close button which is always visible
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Focus trap: Tab and Shift+Tab cycle within the modal
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that opened the modal
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  const handleSave = async () => {
    if (!intention.trim()) return;
    setSaving(true);
    setSaveError(false);
    try {
      // DASH-7: onSave now throws on API error, so this catch block is reached.
      // DASH-38: onSave returns { xpAwarded } so we can show XP feedback.
      const result = await onSave({ emotion, energy, focus, stress, intention: intention.trim(), note: note.trim() || undefined });
      setXpAwarded(result.xpAwarded);
      setStep(2);
    } catch (err) {
      console.error('[CHECKIN] Error saving:', err);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 premium-modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* DASH-26: Modal with role="dialog", aria-modal, aria-labelledby, aria-describedby */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-modal-title"
        aria-describedby="checkin-modal-desc"
        className="relative w-full sm:max-w-md modal-content overflow-hidden keyboard-aware"
      >
        {/* Close button — DASH-24: aria-label added */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors z-10 close-btn"
        >
          <X size={16} />
        </button>

        {step === 1 && (
          /* Form Step */
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[75dvh] overflow-y-auto scroll-contain safe-bottom">
            <div className="text-center mb-2">
              <h3 id="checkin-modal-title" className="text-lg font-bold text-white">¿Cómo estás hoy?</h3>
              <p id="checkin-modal-desc" className="text-xs text-[#888]">Sin juicio</p>
            </div>

            <ValueSlider label="Estado emocional" value={emotion} onChange={setEmotion} labels={EMOTION_LABELS} sliderId="emotion" />
            <ValueSlider label="Energía" value={energy} onChange={setEnergy} labels={ENERGY_LABELS} sliderId="energy" />
            <ValueSlider label="Enfoque" value={focus} onChange={setFocus} labels={FOCUS_LABELS} sliderId="focus" />
            <ValueSlider label="Estrés" value={stress} onChange={setStress} labels={STRESS_LABELS} sliderId="stress" />

            {/* Intention */}
            <div>
              <label className="block text-xs text-[#999] uppercase tracking-wider font-medium mb-2">
                Intención del día
              </label>
              <input
                type="text"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                placeholder="¿Qué te propones hoy?"
                maxLength={120}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#444] focus:border-champagne transition-colors text-base sm:text-sm"
              />
            </div>

            {/* Optional note */}
            <div>
              <label className="block text-xs text-[#999] uppercase tracking-wider font-medium mb-2">
                Nota <span className="text-[#999] normal-case">(opcional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Algo que quieras recordar..."
                maxLength={300}
                rows={2}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#444] focus:border-champagne transition-colors text-base sm:text-sm resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !intention.trim()}
              className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Listo'}
            </button>
            <button
              onClick={onClose}
              className="w-full text-[#888] text-xs mt-2 hover:text-[#999] transition-colors"
            >
              Más tarde
            </button>
            {saveError && (
              <p role="alert" className="text-center text-xs text-red-400 mt-2">
                No se pudo guardar. Inténtalo de nuevo.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          /* Done Step */
          <div className="p-6 sm:p-8 text-center safe-bottom card-enter">
            <div className="w-16 h-16 rounded-2xl bg-champagne/15 flex items-center justify-center mx-auto mb-5 micro-celebrate">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Guardado</h2>
            {/* DASH-38: Discreet XP feedback — only shown when XP was actually awarded (first check-in of the day) */}
            {xpAwarded > 0 && (
              <p className="text-xs text-champagne/60 mb-2">
                +{xpAwarded} XP Mente
              </p>
            )}
            <p className="text-sm text-[#999] leading-relaxed mb-2">
              Tu intención para hoy:
            </p>
            <p className="text-champagne font-medium italic mb-6">«{intention}»</p>
            <button
              onClick={onClose}
              className="w-full btn-primary py-3 rounded-xl text-sm"
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
