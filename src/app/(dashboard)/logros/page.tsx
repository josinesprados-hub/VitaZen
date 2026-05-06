'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { LogrosSkeleton } from '@/components/ui/PremiumSkeleton';
import {
  Wind,
  BookOpen,
  Heart,
  CheckCircle,
  Utensils,
  Wallet,
  Flame,
  Crown,
  Trophy,
  Lock,
  Filter,
  PiggyBank,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────

interface AchievementData {
  key: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  target: number;
  current: number;
  percent: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface AchievementsResponse {
  achievements: AchievementData[];
  stats: {
    total: number;
    unlocked: number;
    percent: number;
  };
}

// ─── Icon Map ────────────────────────────────────────────

const ICON_MAP: Record<string, any> = {
  Wind,
  BookOpen,
  Heart,
  CheckCircle,
  Utensils,
  Wallet,
  Flame,
  Crown,
  PiggyBank,
};

// ─── Category Config ─────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: 'Todos', icon: Filter },
  { key: 'meditation', label: 'Meditación', icon: Wind },
  { key: 'journal', label: 'Diario', icon: BookOpen },
  { key: 'wellness', label: 'Bienestar', icon: Heart },
  { key: 'habits', label: 'Hábitos', icon: CheckCircle },
  { key: 'nutrition', label: 'Nutrición', icon: Utensils },
  { key: 'finance', label: 'Finanzas', icon: Wallet },
  { key: 'general', label: 'General', icon: Crown },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  meditation: 'Meditación',
  journal: 'Diario',
  wellness: 'Bienestar',
  habits: 'Hábitos',
  nutrition: 'Nutrición',
  finance: 'Finanzas',
  general: 'General',
};

// ─── Component ───────────────────────────────────────────

export default function LogrosPage() {
  const { apiFetch } = useApi();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    const fetchAchievements = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await apiFetch('/api/achievements');
        if (!cancelled && res.ok) {
          const json = await res.json();
          setData(json);
        } else if (!cancelled) {
          setError(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[ACHIEVEMENTS] Error:', err);
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchAchievements();

    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  if (loading) {
    return <LogrosSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <AlertCircle size={32} className="text-[#666]" />
          <p className="text-[#999] text-sm">No se pudieron cargar los logros</p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 text-[#c8a55a] text-sm hover:underline"
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredAchievements = activeFilter === 'all'
    ? data.achievements
    : data.achievements.filter((a) => a.category === activeFilter);

  const unlockedList = filteredAchievements.filter((a) => a.unlocked);
  const lockedList = filteredAchievements.filter((a) => !a.unlocked);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Trophy size={24} className="text-[#c8a55a]" />
          <h1 className="text-2xl font-bold text-white">Logros</h1>
        </div>
        <p className="text-[#999] text-sm">Tu recorrido de excelencia, cada hito cuenta</p>
      </div>

      {/* Stats Bar */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
              <Crown size={20} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-white font-semibold">Progreso General</p>
              <p className="text-xs text-[#666]">{data.stats.unlocked} de {data.stats.total} logros desbloqueados</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-[#c8a55a]">{data.stats.percent}%</span>
        </div>
        <div className="w-full bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#c8a55a] to-[#d4b468] h-3 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${data.stats.percent}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORIES.map((cat) => {
          const isActive = activeFilter === cat.key;
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-[#c8a55a] text-[#000000]'
                  : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999] hover:border-[#c8a55a]/30 hover:text-[#c8a55a]'
              }`}
            >
              <Icon size={14} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Unlocked Section */}
      {unlockedList.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <Crown size={16} className="text-[#c8a55a]" />
            <h2 className="text-sm uppercase tracking-widest font-semibold text-[#c8a55a]">Desbloqueados</h2>
            <span className="text-xs text-[#666] ml-1">({unlockedList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unlockedList.map((achievement, index) => (
              <AchievementCard key={achievement.key} achievement={achievement} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Locked Section */}
      {lockedList.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Lock size={16} className="text-[#555]" />
            <h2 className="text-sm uppercase tracking-widest font-semibold text-[#555]">Por Desbloquear</h2>
            <span className="text-xs text-[#444] ml-1">({lockedList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lockedList.map((achievement, index) => (
              <AchievementCard key={achievement.key} achievement={achievement} index={index} />
            ))}
          </div>
        </div>
      )}

      {filteredAchievements.length === 0 && (
        <div className="text-center py-20">
          <p className="text-[#555] text-sm">No hay logros en esta categoría</p>
        </div>
      )}
    </div>
  );
}

// ─── Achievement Card ────────────────────────────────────

function AchievementCard({ achievement, index }: { achievement: AchievementData; index: number }) {
  const Icon = ICON_MAP[achievement.icon] || Trophy;
  const isUnlocked = achievement.unlocked;

  return (
    <div
      className={`relative rounded-xl p-5 transition-all duration-300 group animate-in ${
        isUnlocked
          ? 'bg-[#0a0a0a] border border-[#c8a55a]/20 hover:border-[#c8a55a]/40 hover:bg-[#0d0d0d]'
          : 'bg-[#080808] border border-[#1a1a1a] hover:border-[#1a1a1a]'
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Badge shine for unlocked */}
      {isUnlocked && (
        <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden rounded-tr-xl">
          <div className="absolute top-3 -right-6 bg-[#c8a55a] text-[#000000] text-[9px] font-bold px-8 py-1 rotate-45 uppercase tracking-wider">
            Gold
          </div>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
            isUnlocked
              ? 'bg-[#c8a55a]/15 border border-[#c8a55a]/30'
              : 'bg-[#111] border border-[#1a1a1a]'
          }`}
        >
          <Icon
            size={22}
            className={`transition-colors duration-300 ${
              isUnlocked ? 'text-[#c8a55a]' : 'text-[#333]'
            }`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-widest font-semibold text-[#555]">
              {CATEGORY_LABELS[achievement.category] || achievement.category}
            </span>
          </div>
          <h3
            className={`font-semibold text-sm truncate transition-colors ${
              isUnlocked ? 'text-white' : 'text-[#555]'
            }`}
          >
            {achievement.title}
          </h3>
          <p
            className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${
              isUnlocked ? 'text-[#888]' : 'text-[#444]'
            }`}
          >
            {achievement.description}
          </p>

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#555]">
                {achievement.current}/{achievement.target}
              </span>
              <span className={`text-[10px] font-semibold ${isUnlocked ? 'text-[#c8a55a]' : 'text-[#444]'}`}>
                {achievement.percent}%
              </span>
            </div>
            <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-700 ease-out ${
                  isUnlocked ? 'bg-[#c8a55a]' : 'bg-[#333]'
                }`}
                style={{ width: `${achievement.percent}%` }}
              />
            </div>
          </div>

          {/* Unlocked date */}
          {isUnlocked && achievement.unlockedAt && (
            <p className="text-[9px] text-[#555] mt-2">
              Desbloqueado {new Date(achievement.unlockedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
