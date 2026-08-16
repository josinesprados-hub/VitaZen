'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_MOMENTUM } from '@/lib/screenshot-data';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import PrivacyMask from '@/components/ui/PrivacyMask';

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
  if (level === 'fuerte') return 'bg-champagne';
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
  const { isActive: screenshotMode } = useScreenshotMode();
  const [data, setData] = useState<MomentumData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMomentum = useCallback(async () => {
    // ── Screenshot mode: use mock data, skip API calls ──
    if (screenshotMode) {
      setData(SCREENSHOT_MOMENTUM);
      setLoading(false);
      return;
    }

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
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    fetchMomentum();
  }, [fetchMomentum]);

  if (loading || !data) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-champagne/5 flex items-center justify-center">
            <Activity size={14} className="text-champagne/30 sm:w-[18px] sm:h-[18px]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-medium text-[#888]">Tu ritmo</h2>
            <p className="fallback-warm">Aparecerá con tu actividad</p>
          </div>
        </div>
      </div>
    );
  }

  const color = getMomentumColor(data.level);
  const barColor = getMomentumBarColor(data.level);

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5 card-enter hover:border-champagne/15 transition-colors">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-champagne/10 flex items-center justify-center">
            <Activity size={14} className="text-champagne sm:w-[18px] sm:h-[18px]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-white">Tu ritmo</h2>
            <p className="label-discrete">Consistencia reciente</p>
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
          {data.trend === 'up' && <TrendingUp size={12} className="text-champagne" />}
          {data.trend === 'down' && <TrendingDown size={12} className="text-[#888]" />}
          {data.trend === 'stable' && <Minus size={12} className="text-[#888]" />}
        </div>
      </div>

      {/* Score bar */}
      <PrivacyMask compact>
        <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2 overflow-hidden mb-1.5 sm:mb-2">
          <div
            className={`h-1.5 sm:h-2 rounded-full transition-all duration-1000 ease-out ${barColor}`}
            style={{ width: `${data.score}%` }}
          />
        </div>
      </PrivacyMask>

      <div className="flex items-center justify-between">
        <p className="text-[10px] sm:text-xs text-[#999]">{data.description}</p>
        <PrivacyMask compact>
          {data.currentStreak > 0 && (
            <span className="text-[10px] sm:text-xs text-champagne flex items-center gap-1">
              {data.currentStreak}d
            </span>
          )}
        </PrivacyMask>
      </div>
    </div>
  );
}
