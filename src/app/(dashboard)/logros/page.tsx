'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_ACHIEVEMENTS } from '@/lib/screenshot-data';
import { LogrosSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
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
  Circle,
  Sun,
  Calendar,
  Clock,
  Sparkles,
  MessageCircle,
  Layers,
  Eye,
  Mountain,
  Sunrise,
  Leaf,
  TrendingUp,
  Moon,
  Compass,
  RotateCcw,
  Zap,
} from 'lucide-react';
import PrivacyMask from '@/components/ui/PrivacyMask';

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
  hidden: boolean;
}

interface AchievementsResponse {
  achievements: AchievementData[];
  newlyUnlocked: string[];
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
  Sun,
  Calendar,
  Clock,
  Sparkles,
  MessageCircle,
  Layers,
  Eye,
  Mountain,
  Sunrise,
  Leaf,
  TrendingUp,
  Moon,
  Compass,
  RotateCcw,
  Zap,
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
  { key: 'checkin', label: 'Check-in', icon: Sun },
  { key: 'general', label: 'General', icon: Crown },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  meditation: 'Meditación',
  journal: 'Diario',
  wellness: 'Bienestar',
  habits: 'Hábitos',
  nutrition: 'Nutrición',
  finance: 'Finanzas',
  checkin: 'Check-in',
  general: 'General',
};

// ─── Component ───────────────────────────────────────────

export default function LogrosPage() {
  const { apiFetch } = useApi();
  const { firebaseUser } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // ── Screenshot mode: use frozen demo data ──
    if (screenshotMode) {
      setData(SCREENSHOT_ACHIEVEMENTS as any);
      setLoading(false);
      return;
    }

    // ── Wait for Firebase auth before fetching ──
    // The dashboard layout guarantees `user` exists when we mount,
    // but `firebaseUser` in useApi might briefly be null during
    // the initial render cycle. Guarding here prevents the
    // synthetic 401 that useApi returns when firebaseUser is null.
    if (!firebaseUser) return;

    // ── Abort any in-flight request from a previous effect ──
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    const fetchAchievements = async () => {
      setLoading(true);
      setError(false);

      try {
        const res = await apiFetch('/api/achievements', {
          signal: controller.signal,
        });

        if (cancelled || controller.signal.aborted) return;

        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setData(json);
          }
        } else {
          // 401 is handled by useApi (token refresh / sign-out).
          // For anything else, show a graceful error state.
          if (!cancelled && res.status !== 401) {
            setError(true);
          }
        }
      } catch (err) {
        // AbortError means the effect was cleaned up — not a real error
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) {
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
      controller.abort();
    };
  }, [apiFetch, screenshotMode, firebaseUser]);

  // Memoize filtered lists BEFORE any early returns.
  // React hooks must be called in the same order on every render.
  // Placing useMemo after early returns caused "Rendered fewer hooks
  // than expected" (React error #310) when the component returned
  // early during loading/error states.
  const { unlockedList, lockedVisibleList, mysteryList } = useMemo(() => {
    if (!data) return { unlockedList: [], lockedVisibleList: [], mysteryList: [] };
    const filteredAchievements = activeFilter === 'all'
      ? data.achievements
      : data.achievements.filter((a) => a.category === activeFilter);
    return {
      unlockedList: filteredAchievements.filter((a) => a.unlocked),
      lockedVisibleList: filteredAchievements.filter((a) => !a.unlocked && !a.hidden),
      mysteryList: filteredAchievements.filter((a) => !a.unlocked && a.hidden),
    };
  }, [data, activeFilter]);

  if (loading) {
    return <LogrosSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <PremiumEmptyState
          icon={Trophy}
          title="Los logros están descansando"
          subtitle="No pudimos cargarlos ahora. Vuelve en un momento."
          size="lg"
          variant="gold"
        />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Trophy size={24} className="text-champagne" />
          <h1 className="text-2xl font-bold text-white">Logros</h1>
        </div>
        <p className="subtitle-silent">Cada paso que has dado</p>
      </div>

      {/* Stats Bar */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6 mb-8">
        <PrivacyMask>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-champagne/10 flex items-center justify-center">
                <Crown size={20} className="text-champagne" />
              </div>
              <div>
                <p className="text-white font-semibold">Camino</p>
                <p className="text-xs text-[#888]">{data.stats.unlocked} de {data.stats.total} momentos recordados</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-champagne">{data.stats.percent}%</span>
          </div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-champagne to-champagne-hover h-3 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${data.stats.percent}%` }}
            />
          </div>
          <p className="text-[10px] text-[#888] flex items-center gap-1 mt-3">
            <Circle size={3} fill="currentColor" className="text-champagne/30" />
            Más con el tiempo
          </p>
        </PrivacyMask>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scroll-pills -mx-4 px-4 sm:mx-0 sm:px-0">
        {CATEGORIES.map((cat) => {
          const isActive = activeFilter === cat.key;
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-champagne text-[#000000]'
                  : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999] hover:border-champagne/30 hover:text-champagne'
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
            <Circle size={8} fill="currentColor" className="text-champagne" />
            <h2 className="label-discrete text-champagne">Recordado</h2>
            <span className="text-xs text-[#888] ml-1">({unlockedList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unlockedList.map((achievement, index) => (
              <AchievementCard key={achievement.key} achievement={achievement} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Mystery Section — hidden achievements near unlock */}
      {mysteryList.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <Eye size={16} className="text-champagne/40" />
            <h2 className="label-discrete" style={{ color: 'rgba(200,165,90,0.5)' }}>Cerca de aparecer</h2>
            <span className="text-xs text-[#999] ml-1">({mysteryList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mysteryList.map((achievement, index) => (
              <MysteryCard key={achievement.key} achievement={achievement} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Locked Visible Section */}
      {lockedVisibleList.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Lock size={16} className="text-[#888]" />
            <h2 className="label-discrete" style={{ color: '#555' }}>Por aparecer</h2>
            <span className="text-xs text-[#999] ml-1">({lockedVisibleList.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lockedVisibleList.map((achievement, index) => (
              <AchievementCard key={achievement.key} achievement={achievement} index={index} />
            ))}
          </div>
        </div>
      )}

      {unlockedList.length === 0 && lockedVisibleList.length === 0 && mysteryList.length === 0 && (
        <PremiumEmptyState
          icon={Trophy}
          title="No hay logros en esta categoría"
          subtitle="Hay más en otras categorías"
          size="md"
        />
      )}
    </div>
  );
}

// ─── Achievement Card ────────────────────────────────────
// Clean, silent, no ribbon, no "HECHO" badge.
// Unlocked = subtle gold dot + warm tone.
// Locked = dimmed, quiet.

function AchievementCard({ achievement, index }: { achievement: AchievementData; index: number }) {
  const Icon = ICON_MAP[achievement.icon] || Trophy;
  const isUnlocked = achievement.unlocked;

  return (
    <div
      className={`relative rounded-xl p-5 transition-all duration-300 group animate-in ${
        isUnlocked
          ? 'bg-[#0a0a0a] border border-champagne/20 hover:border-champagne/40 hover:bg-[#0d0d0d]'
          : 'bg-[#080808] border border-[#1a1a1a] hover:border-[#1a1a1a]'
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
            isUnlocked
              ? 'bg-champagne/15 border border-champagne/30'
              : 'bg-[#111] border border-[#1a1a1a]'
          }`}
        >
          <Icon
            size={22}
            className={`transition-colors duration-300 ${
              isUnlocked ? 'text-champagne' : 'text-[#999]'
            }`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="label-discrete">
              {CATEGORY_LABELS[achievement.category] || achievement.category}
            </span>
            {isUnlocked && (
              <Circle size={5} fill="currentColor" className="text-champagne" />
            )}
          </div>
          <h3
            className={`font-semibold text-sm truncate transition-colors ${
              isUnlocked ? 'text-white' : 'text-[#888]'
            }`}
          >
            {achievement.title}
          </h3>
          <p
            className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${
              isUnlocked ? 'text-[#888]' : 'text-[#999]'
            }`}
          >
            {achievement.description}
          </p>

          {/* Progress */}
          <PrivacyMask compact>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-[#888]">
                  {achievement.current}/{achievement.target}
                </span>
                <span className={`text-[10px] font-semibold ${isUnlocked ? 'text-champagne' : 'text-[#999]'}`}>
                  {achievement.percent}%
                </span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-700 ease-out ${
                    isUnlocked ? 'bg-champagne' : 'bg-[#333]'
                  }`}
                  style={{ width: `${achievement.percent}%` }}
                />
              </div>
            </div>
          </PrivacyMask>

          {/* Unlocked date — subtle, like a memory */}
          {isUnlocked && achievement.unlockedAt && (
            <p className="text-[9px] text-[#888] mt-2">
              Recordado {new Date(achievement.unlockedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mystery Card ────────────────────────────────────────
// For hidden achievements near-unlock (>=75% progress).
// Shows category + progress, but title and description are "???"

function MysteryCard({ achievement, index }: { achievement: AchievementData; index: number }) {
  const Icon = ICON_MAP[achievement.icon] || Trophy;

  return (
    <div
      className="relative rounded-xl p-5 bg-[#080808] border border-champagne/10 hover:border-champagne/20 transition-all duration-300 group animate-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Mysterious icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-champagne/5 border border-champagne/15">
          <Icon size={22} className="text-champagne/30" />
        </div>

        {/* Content — title and description hidden */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="label-discrete">
              {CATEGORY_LABELS[achievement.category] || achievement.category}
            </span>
          </div>
          <h3 className="font-semibold text-sm text-champagne/40 italic">
            ???
          </h3>
          <p className="text-xs mt-0.5 text-[#888] italic">
            Algo está por aparecer
          </p>

          {/* Progress — shows it's real, not imaginary */}
          <PrivacyMask compact>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-[#888]">
                  {achievement.current}/{achievement.target}
                </span>
                <span className="text-[10px] font-semibold text-champagne/50">
                  {achievement.percent}%
                </span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-champagne/30 transition-all duration-700 ease-out"
                  style={{ width: `${achievement.percent}%` }}
                />
              </div>
            </div>
          </PrivacyMask>
        </div>
      </div>
    </div>
  );
}
