'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import {
  Shield,
  Brain,
  Zap,
  Gem,
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
  { key: 'riqueza', label: 'Finanzas', description: 'Control económico y libertad financiera', icon: Gem, emoji: '💎' },
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

const HABIT_OPTIONS = [
  { name: 'Meditación', emoji: '🧘' },
  { name: 'Ejercicio', emoji: '💪' },
  { name: 'Lectura', emoji: '📖' },
  { name: 'Diario', emoji: '📝' },
  { name: 'Hidratación', emoji: '💧' },
  { name: 'Descanso temprano', emoji: '🌙' },
  { name: 'Caminar', emoji: '🚶' },
  { name: 'Respiración consciente', emoji: '🌬️' },
  { name: 'Planificación del día', emoji: '📋' },
  { name: 'Agradecimiento', emoji: '🙏' },
];

const TOTAL_STEPS = 5;

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════

export default function OnboardingPage() {
  const { user, loading, refreshUser } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [data, setData] = useState<OnboardingFormData>(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auth guard: redirect if not logged in or already completed onboarding
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (user.onboardingCompleted) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router]);

  const goToStep = useCallback((nextStep: number) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimating(false);
    }, 250);
  }, []);

  const handleComplete = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await refreshUser();
        router.push('/dashboard');
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || 'Error al guardar. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/images/vitazen-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse" />
          <p className="text-[#c8a55a] text-sm">Preparando tu experiencia...</p>
        </div>
      </div>
    );
  }

  // Not ready yet (redirecting)
  if (!user || user.onboardingCompleted) {
    return null;
  }

  const progressPercent = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-[100dvh] bg-[#000000] flex flex-col items-center justify-center px-5 py-8 safe-top safe-bottom">
      {/* Progress Bar */}
      <div className="w-full max-w-lg mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#555] uppercase tracking-widest font-medium">
            Paso {step + 1} de {TOTAL_STEPS}
          </span>
          <span className="text-[10px] text-[#c8a55a] font-medium">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="w-full bg-[#1a1a1a] rounded-full h-1 overflow-hidden">
          <div
            className="bg-[#c8a55a] h-1 rounded-full onboarding-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className={`w-full max-w-lg ${animating ? 'onboarding-step-exit' : 'onboarding-step-enter'} overflow-x-contain`}>
        {step === 0 && (
          <WelcomeStep
            userName={user?.name}
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
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {step === 3 && (
          <LevelsStep
            stressLevel={data.stressLevel}
            energyLevel={data.energyLevel}
            focusLevel={data.focusLevel}
            onChange={(field, value) => {
              setData((prev) => ({ ...prev, [field]: value }));
            }}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}
        {step === 4 && (
          <HabitsStep
            selected={data.initialHabits}
            onToggle={(habit) => {
              setData((prev) => ({
                ...prev,
                initialHabits: prev.initialHabits.includes(habit)
                  ? prev.initialHabits.filter((h) => h !== habit)
                  : [...prev.initialHabits, habit],
              }));
            }}
            onComplete={handleComplete}
            onBack={() => goToStep(3)}
            saving={saving}
            error={error}
            primaryFocus={data.primaryFocus}
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
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#c8a55a]/10 border border-[#c8a55a]/20 flex items-center justify-center onboarding-complete-glow">
          <Sparkles size={36} className="text-[#c8a55a]" />
        </div>
      </div>

      <h1 className="text-3xl font-bold text-white mb-3">
        Bienvenido{userName ? `, ${userName}` : ''}
      </h1>
      <p className="text-[#999] text-base mb-2">Tu viaje con VitaZen comienza ahora.</p>
      <p className="text-[#666] text-sm mb-10 max-w-sm mx-auto leading-relaxed">
        Unas breves preguntas para personalizar tu experiencia.
      </p>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 bg-[#c8a55a] text-[#000000] font-semibold px-8 py-3 rounded-xl hover:bg-[#d4b468] transition-colors text-sm"
      >
        Comenzar
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 1: Personal Goals
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
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">¿Qué quieres lograr?</h2>
        <p className="text-[#999] text-sm">Selecciona los objetivos que más resuenen contigo.</p>
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
                  ? 'bg-[#c8a55a]/10 border-[#c8a55a]/40 onboarding-option-pop'
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#c8a55a]/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-[#c8a55a] bg-[#c8a55a]' : 'border-[#333]'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-black" />}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-[#c8a55a]' : 'text-[#999]'
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
          className="text-[#666] text-sm hover:text-white transition-colors"
        >
          Atrás
        </button>
        <button
          onClick={onNext}
          disabled={selected.length === 0}
          className="inline-flex items-center gap-2 bg-[#c8a55a] text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuar
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 2: Primary Focus
// ═══════════════════════════════════════════

function FocusStep({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: string;
  onSelect: (focus: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Tu foco principal</h2>
        <p className="text-[#999] text-sm">Elige el área donde quieres concentrar tu energía ahora.</p>
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
                  ? 'bg-[#c8a55a]/10 border-[#c8a55a]/40 onboarding-option-pop'
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#c8a55a]/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#c8a55a]/20' : 'bg-[#c8a55a]/10'
                  }`}
                >
                  <Icon size={22} className="text-[#c8a55a]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold text-sm ${
                        isSelected ? 'text-[#c8a55a]' : 'text-white'
                      }`}
                    >
                      {option.label}
                    </h3>
                    <span className="text-sm">{option.emoji}</span>
                  </div>
                  <p className="text-xs text-[#666] mt-0.5">{option.description}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-[#c8a55a] bg-[#c8a55a]' : 'border-[#333]'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-black" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[#666] text-sm hover:text-white transition-colors"
        >
          Atrás
        </button>
        <button
          onClick={onNext}
          disabled={!selected}
          className="inline-flex items-center gap-2 bg-[#c8a55a] text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuar
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 3: Levels (Stress, Energy, Focus)
// ═══════════════════════════════════════════

function LevelsStep({
  stressLevel,
  energyLevel,
  focusLevel,
  onChange,
  onNext,
  onBack,
}: {
  stressLevel: number;
  energyLevel: number;
  focusLevel: number;
  onChange: (field: string, value: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const levels = [
    {
      key: 'stressLevel',
      label: 'Nivel de estrés',
      description: '¿Cómo percibes tu estrés últimamente?',
      value: stressLevel,
      lowLabel: 'Muy bajo',
      highLabel: 'Muy alto',
      lowEmoji: '😌',
      highEmoji: '😰',
    },
    {
      key: 'energyLevel',
      label: 'Nivel de energía',
      description: '¿Cómo está tu vitalidad general?',
      value: energyLevel,
      lowLabel: 'Muy baja',
      highLabel: 'Muy alta',
      lowEmoji: '😴',
      highEmoji: '⚡',
    },
    {
      key: 'focusLevel',
      label: 'Nivel de enfoque',
      description: '¿Capacidad de concentrarte en lo importante?',
      value: focusLevel,
      lowLabel: 'Muy bajo',
      highLabel: 'Muy alto',
      lowEmoji: '🌫️',
      highEmoji: '🎯',
    },
  ];

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Tu estado actual</h2>
        <p className="text-[#999] text-sm">Nos ayuda a adaptar tu experiencia desde el inicio.</p>
      </div>

      <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
        {levels.map((item) => (
          <div
            key={item.key}
            className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{item.label}</h3>
                <p className="text-[11px] text-[#666] mt-0.5">{item.description}</p>
              </div>
              <span className="text-xl font-bold text-[#c8a55a]">{item.value}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm shrink-0">{item.lowEmoji}</span>
              <span className="text-[10px] text-[#555] shrink-0 w-14">{item.lowLabel}</span>
              <div className="flex-1 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    onClick={() => onChange(item.key, val)}
                    className={`flex-1 h-2.5 rounded-full transition-all duration-200 ${
                      val <= item.value
                        ? 'bg-[#c8a55a]'
                        : 'bg-[#1a1a1a] hover:bg-[#2a2a2a]'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-[#555] shrink-0 w-14 text-right">{item.highLabel}</span>
              <span className="text-sm shrink-0">{item.highEmoji}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[#666] text-sm hover:text-white transition-colors"
        >
          Atrás
        </button>
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 bg-[#c8a55a] text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm"
        >
          Continuar
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Step 4: Initial Habits
// ═══════════════════════════════════════════

function HabitsStep({
  selected,
  onToggle,
  onComplete,
  onBack,
  saving,
  error,
  primaryFocus,
}: {
  selected: string[];
  onToggle: (habit: string) => void;
  onComplete: () => void;
  onBack: () => void;
  saving: boolean;
  error: string;
  primaryFocus: string;
}) {
  const focusLabel = FOCUS_OPTIONS.find((f) => f.key === primaryFocus)?.label || '';

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Tus primeros hábitos</h2>
        <p className="text-[#999] text-sm">
          Elige hábitos para empezar. Los crearemos por ti.
        </p>
        {primaryFocus && (
          <p className="text-[11px] text-[#c8a55a] mt-1.5">
            Enfocado en <span className="font-semibold">{focusLabel}</span> — se priorizará este imperio.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
        {HABIT_OPTIONS.map((habit) => {
          const isSelected = selected.includes(habit.name);
          return (
            <button
              key={habit.name}
              onClick={() => onToggle(habit.name)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-[#c8a55a]/10 border-[#c8a55a]/40 onboarding-option-pop'
                  : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#c8a55a]/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{habit.emoji}</span>
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-[#c8a55a]' : 'text-[#999]'
                  }`}
                >
                  {habit.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-[#c8a55a]/5 border border-[#c8a55a]/15 rounded-lg p-3 mb-4 error-state-enter">
          <p className="text-[#c8a55a]/80 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[#666] text-sm hover:text-white transition-colors"
          disabled={saving}
        >
          Atrás
        </button>
        <button
          onClick={onComplete}
          disabled={saving || selected.length === 0}
          className="inline-flex items-center gap-2 bg-[#c8a55a] text-[#000000] font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Preparando...
            </>
          ) : (
            <>
              Comenzar mi viaje
              <Sparkles size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
