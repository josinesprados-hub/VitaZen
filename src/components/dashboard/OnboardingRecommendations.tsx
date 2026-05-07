'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Brain, Shield, Zap, Gem, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface OnboardingInfo {
  completed: boolean;
  data: {
    goals: string[];
    primaryFocus: string;
    stressLevel: number;
    energyLevel: number;
    focusLevel: number;
    initialHabits: string[];
  } | null;
}

const FOCUS_CONFIG: Record<string, { name: string; icon: any; href: string; tip: string }> = {
  mente: {
    name: 'Mente',
    icon: Brain,
    href: '/imperio/mente',
    tip: 'Tu foco está en la calma mental. Empieza con una meditación breve.',
  },
  disciplina: {
    name: 'Disciplina',
    icon: Shield,
    href: '/imperio/disciplina',
    tip: 'Tu prioridad es la constancia. Completa tu check-in hoy.',
  },
  energia: {
    name: 'Energía',
    icon: Zap,
    href: '/imperio/energia',
    tip: 'Tu energía importa. Registra tu descanso y actividad.',
  },
  riqueza: {
    name: 'Finanzas',
    icon: Gem,
    href: '/imperio/riqueza',
    tip: 'Tu foco financiero. Empieza registrando tus gastos de hoy.',
  },
};

export function OnboardingRecommendations() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [onboarding, setOnboarding] = useState<OnboardingInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only fetch for users who might have onboarding data
    if (!user) return;

    const fetchOnboarding = async () => {
      try {
        const res = await apiFetch('/api/onboarding');
        if (res.ok) {
          const data = await res.json();
          setOnboarding(data);
        }
      } catch {
        // Silently fail — recommendations are optional
      }
    };
    fetchOnboarding();
  }, [user]);

  // Don't show if dismissed, no data, or no primary focus
  if (dismissed || !onboarding?.data?.primaryFocus) return null;

  const focusConfig = FOCUS_CONFIG[onboarding.data.primaryFocus];
  if (!focusConfig) return null;

  const Icon = focusConfig.icon;
  const habitCount = onboarding.data.initialHabits?.length || 0;

  // Build contextual tips based on levels
  const tips: string[] = [focusConfig.tip];

  if (onboarding.data.stressLevel >= 4) {
    tips.push('Tu estrés está alto. Prueba la respiración consciente antes de dormir.');
  }
  if (onboarding.data.energyLevel <= 2) {
    tips.push('Tu energía está baja. Prioriza el descanso esta semana.');
  }
  if (onboarding.data.focusLevel <= 2) {
    tips.push('El enfoque se entrena. Empieza con bloques de 25 minutos.');
  }

  return (
    <div className="hero-fade-in">
      <div className="bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-xl p-6 relative overflow-hidden">
        {/* Subtle glow */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: 'inset 0 1px 0 0 rgba(200, 165, 90, 0.06)' }}
        />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
                <Sparkles size={20} className="text-[#c8a55a]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Recomendaciones para ti</h3>
                <p className="text-[11px] text-[#666]">Basadas en tu configuración inicial</p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-[#555] hover:text-[#999] transition-colors text-xs"
            >
              Cerrar
            </button>
          </div>

          {/* Primary Focus Card */}
          <Link
            href={focusConfig.href}
            className="flex items-center gap-4 bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 hover:border-[#c8a55a]/30 transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
              <Icon size={20} className="text-[#c8a55a]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white group-hover:text-[#c8a55a] transition-colors">
                Tu imperio principal: {focusConfig.name}
              </p>
              <p className="text-[11px] text-[#666]">{focusConfig.tip}</p>
            </div>
            <ArrowRight size={14} className="text-[#555] group-hover:text-[#c8a55a] transition-colors" />
          </Link>

          {/* Tips */}
          {tips.length > 1 && (
            <div className="space-y-2.5">
              {tips.slice(1).map((tip, idx) => (
                <p key={idx} className="text-[12px] text-[#999] flex items-start gap-2">
                  <span className="text-[#c8a55a] text-[8px] mt-1.5 shrink-0">●</span>
                  {tip}
                </p>
              ))}
            </div>
          )}

          {/* Habit count */}
          {habitCount > 0 && (
            <div className="mt-4 pt-3 border-t border-[#1a1a1a]/60">
              <p className="text-[10px] text-[#555]">
                {habitCount} hábito{habitCount > 1 ? 's' : ''} inicial{habitCount > 1 ? 'es' : ''} creado{habitCount > 1 ? 's' : ''} para ti
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
