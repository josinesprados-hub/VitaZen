'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Flame, Star } from 'lucide-react';

interface EmpireData {
  empire: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  progress: number;
}

interface ChallengeData {
  id: string;
  completed: boolean;
  challenge: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
  };
}

const EMPIRE_CONFIG: Record<string, { name: string; icon: any; color: string; description: string }> = {
  disciplina: { name: 'Disciplina', icon: Shield, color: '#c8a55a', description: 'Hábitos, desafíos y consistencia' },
  mente: { name: 'Mente', icon: Brain, color: '#c8a55a', description: 'Meditación, mentor IA y bienestar' },
  energia: { name: 'Energía', icon: Zap, color: '#c8a55a', description: 'Nutrición, salud física y vitalidad' },
  riqueza: { name: 'Riqueza', icon: Gem, color: '#c8a55a', description: 'Finanzas, mentalidad y gestión' },
  crecimiento: { name: 'Crecimiento', icon: TrendingUp, color: '#c8a55a', description: 'Journal, reflexión y desarrollo' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [empires, setEmpires] = useState<EmpireData[]>([]);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, chRes] = await Promise.all([
          apiFetch('/api/empire'),
          apiFetch('/api/challenges'),
        ]);

        if (empRes.ok) {
          const empData = await empRes.json();
          setEmpires(empData.empires);
        }

        if (chRes.ok) {
          const chData = await chRes.json();
          setChallenge(chData.challenge);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-10 h-10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Bienvenido, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
        </h1>
        <p className="text-[#999] mt-1">Tu imperio se construye cada día. Aquí está tu progreso.</p>
      </div>

      {/* Daily Challenge */}
      {challenge && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={24} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Desafío del día</h2>
            {challenge.completed && (
              <span className="text-xs px-2 py-1 rounded-full bg-[#c8a55a]/20 text-[#c8a55a]">Completado</span>
            )}
          </div>
          <h3 className="text-[#c8a55a] font-medium text-lg mb-2">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-sm mb-4">{challenge.challenge.description}</p>
          {!challenge.completed && (
            <button
              onClick={async () => {
                const res = await apiFetch('/api/challenges/complete', {
                  method: 'POST',
                  body: JSON.stringify({ challengeId: challenge.challenge.id }),
                });
                if (res.ok) {
                  setChallenge({ ...challenge, completed: true });
                }
              }}
              className="bg-[#c8a55a] text-black font-semibold px-6 py-2 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
            >
              Marcar como completado
            </button>
          )}
        </div>
      )}

      {/* Empire Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Tus Imperios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(EMPIRE_CONFIG).map(([key, config]) => {
            const empireData = empires.find((e) => e.empire === key);
            const level = empireData?.level || 1;
            const progress = empireData?.progress || 0;
            const streak = empireData?.streak || 0;
            const Icon = config.icon;

            return (
              <Link
                key={key}
                href={`/imperio/${key}`}
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6 hover:border-[#c8a55a]/30 transition-all group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                    <Icon size={22} className="text-[#c8a55a]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-[#c8a55a] transition-colors">{config.name}</h3>
                    <p className="text-xs text-[#999]">Nivel {level}</p>
                  </div>
                </div>

                <p className="text-sm text-[#999] mb-4">{config.description}</p>

                {/* Progress bar */}
                <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2">
                  <div
                    className="bg-[#c8a55a] h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#666]">
                  <span>{Math.round(progress)}% al siguiente nivel</span>
                  {streak > 0 && (
                    <span className="flex items-center gap-1 text-[#c8a55a]">
                      <Flame size={12} /> {streak} días
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <Star size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-2xl font-bold text-white">{empires.reduce((sum, e) => sum + e.xp, 0)}</p>
              <p className="text-xs text-[#999]">XP Total</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-2xl font-bold text-white">{empires.reduce((sum, e) => sum + e.level, 0)}</p>
              <p className="text-xs text-[#999]">Niveles Totales</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <Flame size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-2xl font-bold text-white">
                {Math.max(...empires.map((e) => e.streak), 0)}
              </p>
              <p className="text-xs text-[#999]">Mejor Racha</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
