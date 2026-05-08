'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface MomentumData {
  score: number;
  level: string;
  description: string;
  trend: 'up' | 'down' | 'stable';
  currentStreak: number;
}

function getMomentumColor(level: string): string {
  if (level === 'fuerte') return '#c8a55a';
  if (level === 'estable') return '#999';
  return '#666';
}

function getMomentumBarColor(level: string): string {
  if (level === 'fuerte') return 'bg-[#c8a55a]';
  if (level === 'estable') return 'bg-[#999]';
  return 'bg-[#555]';
}

function getLevelLabel(level: string): string {
  if (level === 'fuerte') return 'Fuerte';
  if (level === 'estable') return 'Estable';
  return 'Bajo';
}

export function MomentumCard() {
  const { apiFetch } = useApi();
  const [data, setData] = useState<MomentumData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMomentum = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dashboard/momentum');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (e) {
      console.error('Momentum fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchMomentum();
  }, [fetchMomentum]);

  if (loading || !data) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
            <Activity size={14} className="text-[#c8a55a]/30 sm:w-[18px] sm:h-[18px]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-medium text-[#666]">Momentum</h2>
            <p className="fallback-warm">Calculando tu consistencia</p>
          </div>
        </div>
      </div>
    );
  }

  const color = getMomentumColor(data.level);
  const barColor = getMomentumBarColor(data.level);

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5 card-enter hover:border-[#c8a55a]/15 transition-colors">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
            <Activity size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-white">Momentum</h2>
            <p className="text-[9px] sm:text-[10px] text-[#555] uppercase tracking-wider">Consistencia reciente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              color,
              backgroundColor: `${color}15`,
              border: `1px solid ${color}30`,
            }}
          >
            {getLevelLabel(data.level)}
          </span>
          {data.trend === 'up' && <TrendingUp size={12} className="text-[#c8a55a]" />}
          {data.trend === 'down' && <TrendingDown size={12} className="text-[#666]" />}
          {data.trend === 'stable' && <Minus size={12} className="text-[#555]" />}
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2 overflow-hidden mb-1.5 sm:mb-2">
        <div
          className={`h-1.5 sm:h-2 rounded-full transition-all duration-1000 ease-out ${barColor}`}
          style={{ width: `${data.score}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] sm:text-xs text-[#999]">{data.description}</p>
        {data.currentStreak > 0 && (
          <span className="text-[10px] sm:text-xs text-[#c8a55a] flex items-center gap-1">
            <span className="streak-pulse">🔥</span> {data.currentStreak}d
          </span>
        )}
      </div>
    </div>
  );
}
