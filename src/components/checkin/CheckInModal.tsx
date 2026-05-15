'use client';

import { useState, useEffect } from 'react';
import { X, Sunrise } from 'lucide-react';

// ─── Emotion Labels ─────────────────────────────────────

const EMOTION_LABELS: Record<number, { label: string; emoji: string }> = {
  1: { label: 'Muy bajo', emoji: '😞' },
  2: { label: 'Bajo', emoji: '😔' },
  3: { label: 'Neutral', emoji: '😐' },
  4: { label: 'Bien', emoji: '🙂' },
  5: { label: 'Excelente', emoji: '😊' },
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
  2: { label: 'Distracto' },
  3: { label: 'Normal' },
  4: { label: 'Concentrado' },
  5: { label: 'Láser' },
};

const STRESS_LABELS: Record<number, { label: string }> = {
  1: { label: 'En calma' },
  2: { label: 'Relajado' },
  3: { label: 'Normal' },
  4: { label: 'Tenso' },
  5: { label: 'Sobrepasado' },
};

// ─── Slider Component ───────────────────────────────────

function ValueSlider({
  label,
  value,
  onChange,
  labels,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: Record<number, { label: string; emoji?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#999] uppercase tracking-wider font-medium">{label}</span>
        <span className="text-xs text-[#c8a55a] font-semibold">
          {labels[value]?.emoji && <span className="mr-1">{labels[value].emoji}</span>}
          {labels[value]?.label}
        </span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-200 value-btn ${
              v <= value
                ? 'bg-[#c8a55a] text-[#000000]'
                : 'bg-[#1a1a1a] text-[#555] hover:bg-[#222] hover:text-[#888]'
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
  }) => Promise<void>;
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
  const [step, setStep] = useState(0); // 0: intro, 1: form, 2: done

  // Lock body scroll when modal is open.
  // Save scroll position before locking (position:fixed on body resets it),
  // then restore on cleanup.
  useEffect(() => {
    document.body.classList.add('scroll-locked');
    return () => {
      document.body.classList.remove('scroll-locked');
    };
  }, []);

  const handleSave = async () => {
    if (!intention.trim()) return;
    setSaving(true);
    setSaveError(false);
    try {
      await onSave({ emotion, energy, focus, stress, intention: intention.trim(), note: note.trim() || undefined });
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
      />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md modal-content overflow-hidden keyboard-aware"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-[#555] hover:text-white hover:bg-[#1a1a1a] transition-colors z-10 close-btn"
        >
          <X size={16} />
        </button>

        {step === 0 && (
          /* Intro Step */
          <div className="p-6 sm:p-8 text-center safe-top">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Sunrise size={28} className="text-[#c8a55a]" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check-in Diario</h2>
            <p className="text-sm text-[#999] leading-relaxed mb-8">
              Toma un momento para conectar contigo. Tu estado emocional define la calidad de tu día.
            </p>
            <button
              onClick={() => setStep(1)}
              className="w-full btn-primary py-3 rounded-xl text-sm"
            >
              Comenzar
            </button>
            <button
              onClick={onClose}
              className="w-full text-[#555] text-xs mt-3 hover:text-[#999] transition-colors"
            >
              Más tarde
            </button>
          </div>
        )}

        {step === 1 && (
          /* Form Step */
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[75dvh] overflow-y-auto scroll-contain safe-bottom">
            <div className="text-center mb-2">
              <h3 className="text-lg font-bold text-white">¿Cómo estás hoy?</h3>
              <p className="text-xs text-[#666]">Sé honesto, sin juicio</p>
            </div>

            <ValueSlider label="Estado emocional" value={emotion} onChange={setEmotion} labels={EMOTION_LABELS} />
            <ValueSlider label="Energía" value={energy} onChange={setEnergy} labels={ENERGY_LABELS} />
            <ValueSlider label="Enfoque" value={focus} onChange={setFocus} labels={FOCUS_LABELS} />
            <ValueSlider label="Estrés" value={stress} onChange={setStress} labels={STRESS_LABELS} />

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
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#444] focus:border-[#c8a55a] transition-colors text-base sm:text-sm"
              />
            </div>

            {/* Optional note */}
            <div>
              <label className="block text-xs text-[#999] uppercase tracking-wider font-medium mb-2">
                Nota <span className="text-[#444] normal-case">(opcional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Algo que quieras recordar..."
                maxLength={300}
                rows={2}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#444] focus:border-[#c8a55a] transition-colors text-base sm:text-sm resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !intention.trim()}
              className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Confirmar check-in'}
            </button>
            {saveError && (
              <p className="text-center text-xs text-red-400 mt-2">
                No se pudo guardar. Inténtalo de nuevo.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          /* Done Step */
          <div className="p-6 sm:p-8 text-center safe-bottom card-enter">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/15 flex items-center justify-center mx-auto mb-5 micro-celebrate">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check-in completado</h2>
            <p className="text-sm text-[#999] leading-relaxed mb-2">
              Tu intención para hoy:
            </p>
            <p className="text-[#c8a55a] font-medium italic mb-6">«{intention}»</p>
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
