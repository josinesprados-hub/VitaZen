'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import {
  Shield,
  Brain,
  Zap,
  Gem,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react';

// ═══════════════════════════════════════════
// Types & Config
// ═══════════════════════════════════════════

interface OnboardingFormData {
  goals: string[];
  primaryFocus: string;
  stressLevel: number;
  energyLevel: number;
  focusLevel: number;
  initialHabits: string[];
}

const INITIAL_DATA: OnboardingFormData = {
  goals: [],
  primaryFocus: '',
  stressLevel: 3,
  energyLevel: 3,
  focusLevel: 3,
  initialHabits: [],
};

const FOCUS_OPTIONS = [
  { key: 'mente', label: 'Mente', description: 'Claridad, calma y bienestar emocional', icon: Brain, emoji: '🧠' },
  { key: 'disciplina', label: 'Disciplina', description: 'Hábitos sólidos y consistencia diaria', icon: Shield, emoji: '⚔️' },
  { key: 'energia', label: 'Energía', description: 'Vitalidad física y descanso reparador', icon: Zap, emoji: '⚡' },
  { key: 'riqueza', label: 'Finanzas', description: 'Consciencia y claridad con tu dinero', icon: Gem, emoji: '💎' },
  { key: 'crecimiento', label: 'Crecimiento', description: 'Reflexión, diario y evolución personal', icon: TrendingUp, emoji: '📈' },
];

const GOAL_OPTIONS = [
  'Reducir el estrés',
  'Dormir mejor',
  'Ser más constante',
  'Mejorar mi enfoque',
  'Cuidar mi cuerpo',
  'Organizar mis finanzas',
  'Meditar regularmente',
  'Escribir un diario',
];

const TOTAL_STEPS = 3;

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════

export default function OnboardingPage() {
  const { user, loading, refreshUser, firebaseUser, syncError } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [data, setData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ─── Refs to prevent premature redirect during active onboarding ───
  const completingRef = useRef(false);
  const mountedRef = useRef(false);
  const retriedSync = useRef(false);

  // Auth guard: redirect if not logged in or already completed onboarding.
  useEffect(() => {
    if (completingRef.current) return;

    if (!loading) {
      if (!user && !firebaseUser) {
        router.replace('/login');
      } else if (user?.onboardingCompleted && !saving) {
        router.replace('/dashboard');
      }
    }
  }, [user, firebaseUser, loading, saving, router]);

  // When sync fails, retry once.
  useEffect(() => {
    if (syncError && firebaseUser && !user && !retriedSync.current) {
      retriedSync.current = true;
      refreshUser();
    }
  }, [syncError, firebaseUser, user, refreshUser]);

  // Mark component as mounted
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const goToStep = useCallback((nextStep: number) => {
    if (nextStep >= 1) {
      completingRef.current = true;
    }
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 250);
  }, []);

  const handleComplete = async () => {
    completingRef.current = true;
    setSaving(true);
    setError('');
    try {
      let res = await apiFetch('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          name: user?.name || firebaseUser?.displayName || undefined,
        }),
      });

      if (res.status === 404 && firebaseUser) {
        console.log('[ONBOARDING] User not found in DB, forcing sync retry');
        await refreshUser();
        await new Promise(r => setTimeout(r, 500));
        res = await apiFetch('/api/onboarding', {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            name: user?.name || firebaseUser?.displayName || undefined,
          }),
        });
      }

      if (res.ok) {
        await refreshUser();
        router.replace('/dashboard');
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || 'Error al guardar. Inténtalo de nuevo.');
        completingRef.current = false;
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
      completingRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading states ───
  // Silence. Just the logo pulsing. No text.
  if (loading && !firebaseUser) {
    return (
      <div className="min-h-[100dvh] bg-[#000000] flex items-center justify-center">
        <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse rounded-[20%]" />
      </div>
    );
  }

  if (firebaseUser && !user && !syncError) {
    return (
      <div className="min-h-[100dvh] bg-[#000000] flex items-center justify-center">
        <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse rounded-[20%]" />
      </div>
    );
  }

  if (!firebaseUser) {
    return null;
  }
  if (user?.onboardingCompleted) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-[#000000] flex flex-col items-center justify-center px-5 py-8">
      {/* Subtle Dot Indicator */}
      <div className="flex items-center justify-center gap-2.5 mb-8 sm:mb-10">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-500 ${
              i === step
                ? 'w-2 h-2 bg-champagne'
                : 'w-1.5 h-1.5 bg-[#1a1a1a]'
            }`}
          />
        ))}
      </div>

      {/* Step Content */}
      <div className={`w-full max-w-lg ${animating ? 'onboarding-step-exit' : 'onboarding-step-enter'} overflow-x-contain`}>
        {step === 0 && (
          <WelcomeStep
            userName={user?.name || firebaseUser?.displayName || firebaseUser?.email?.split('@')[0]}
            onNext={() => goToStep(1)}
          />
        )}
        {step === 1 && (
          <GoalsStep
            selected={data.goals}
            onToggle={(goal) => {
              setData((prev) => ({
                ...prev,
                goals: prev.goals.includes(goal)
                  ? prev.goals.filter((g) => g !== goal)
                  : [...prev.goals, goal],
              }));
            }}
            onNext={() => goToStep(2)}
            onBack={() => goToStep(0)}
          />
        )}
        {step === 2 && (
          <FocusStep
            selected={data.primaryFocus}
            onSelect={(focus) => {
              setData((prev) => ({ ...prev, primaryFocus: focus }));
            }}
            onComplete={handleComplete}
            onBack={() => goToStep(1)}
            saving={saving}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 0: Welcome
// ═══════════════════════════════════════════

function WelcomeStep({ userName, onNext }: { userName?: string | null; onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="onboarding-logo-enter mb-6 sm:mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-champagne/10 border border-champagne/20 flex items-center justify-center onboarding-complete-glow">
          <Sparkles size={36} className="text-champagne" />
        </div>
      </div>

      <h1 className="text-3xl font-bold text-white mb-3">
        Hola{userName ? `, ${userName}` : ''}
      </h1>
      <p className="text-[#999] text-base mb-2">Esto no va a ser largo.</p>
      <p className="text-[#888] text-sm mb-10 max-w-sm mx-auto leading-relaxed">
        Unos minutos. Nada más.
      </p>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 bg-champagne text-[#000000] font-semibold px-8 py-3 rounded-xl hover:bg-champagne-hover transition-colors text-sm"
      >
        Vale
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 1: Resonance (was "Goals")
// ═══════════════════════════════════════════

function GoalsStep({
  selected,
  onToggle,
  onNext,
  onBack,
}: {
  selected: string[];
  onToggle: (goal: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">¿Qué resuena contigo?</h2>
        <p className="text-[#999] text-sm">Toca lo que te diga algo. No hace falta pensar mucho.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
        {GOAL_OPTIONS.map((goal) => {
          const isSelected = selected.includes(goal);
          return (
            <button
              key={goal}
              onClick={() => onToggle(goal)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-champagne/10 border-champagne/40 onboarding-option-pop'
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-champagne/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-champagne bg-champagne' : 'border-[#333]'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-black" />}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-champagne' : 'text-[#999]'
                  }`}
                >
                  {goal}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[#888] text-sm hover:text-white transition-colors"
        >
          Atrás
        </button>
        <button
          onClick={onNext}
          disabled={selected.length === 0}
          className="inline-flex items-center gap-2 bg-champagne text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-champagne-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuar
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 2: What matters now (was "Focus") — final step
// ═══════════════════════════════════════════

function FocusStep({
  selected,
  onSelect,
  onComplete,
  onBack,
  saving,
  error,
}: {
  selected: string;
  onSelect: (focus: string) => void;
  onComplete: () => void;
  onBack: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">¿Qué importa ahora?</h2>
        <p className="text-[#999] text-sm">Si tuvieras que elegir una, ¿cuál sería?</p>
      </div>

      <div className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8">
        {FOCUS_OPTIONS.map((option) => {
          const isSelected = selected === option.key;
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              onClick={() => onSelect(option.key)}
              className={`w-full text-left p-5 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-champagne/10 border-champagne/40 onboarding-option-pop'
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-champagne/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-champagne/20' : 'bg-champagne/10'
                  }`}
                >
                  <Icon size={22} className="text-champagne" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold text-sm ${
                        isSelected ? 'text-champagne' : 'text-white'
                      }`}
                    >
                      {option.label}
                    </h3>
                    <span className="text-sm">{option.emoji}</span>
                  </div>
                  <p className="text-xs text-[#888] mt-0.5">{option.description}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-champagne bg-champagne' : 'border-[#333]'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-black" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-champagne/5 border border-champagne/15 rounded-lg p-3 mb-4 error-state-enter">
          <p className="text-champagne/80 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[#888] text-sm hover:text-white transition-colors"
          disabled={saving}
        >
          Atrás
        </button>
        <button
          onClick={onComplete}
          disabled={saving || !selected}
          className="inline-flex items-center gap-2 bg-champagne text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-champagne-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Preparando...
            </>
          ) : (
            <>
              Entrar
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
