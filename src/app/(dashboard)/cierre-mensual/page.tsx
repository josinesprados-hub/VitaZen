'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { Circle, ArrowLeft } from 'lucide-react';
import PrivacyMask from '@/components/ui/PrivacyMask';
import Link from 'next/link';
import PremiumGate from '@/components/ui/PremiumGate';
import {
  REFLECTION_TITLE,
  REFLECTION_PRIVACY_NOTE,
  SKIP_REFLECTION,
  SAVE_REFLECTION,
  SUMMARY_TITLE_FACTORY,
  INTENTION_BALANCE_TITLE,
  INTENTION_BALANCE_EMPTY,
  FINANCIAL_BALANCE_TITLE,
  FINANCIAL_NO_DATA,
  RHYTHM_TITLE,
  MEMORIES_TITLE,
  ELITE_DEEPER,
  ELITE_EVOLUTION,
  ELITE_MEMORIES,
  PATTERNS_TITLE,
  PATTERNS_INTRO,
  PATTERNS_INTRO_FREE,
  formatMonthLabel,
} from '@/lib/monthly-closure/copy';
import type {
  IntentionBalance,
  FinancialSummary,
  RhythmData,
  MemoryItem,
  EvolutionData,
  ConnectionItem,
} from '@/lib/monthly-closure/digest';

// ─── Types ───

type Phase = 'loading' | 'reflection' | 'summary';

interface ClosureData {
  reflection: string | null;
  reflectedAt: string | null;
  summaryViewedAt: string | null;
}

interface DigestData {
  month: string;
  monthLabel: string;
  hasData: boolean;
  intentionBalance: IntentionBalance | null;
  financial: FinancialSummary | null;
  rhythm: RhythmData | null;
  memories: MemoryItem[];
  evolution: EvolutionData | null;
  connections: ConnectionItem[];
  noDataMessage: { title: string; subtitle: string } | null;
}

// ─── Intention labels ───

const INTENTION_LABELS: Record<string, { label: string; color: string }> = {
  tranquility: { label: 'Tranquilidad', color: '#6b9fcf' },
  growth: { label: 'Crecimiento', color: '#8bcf6b' },
  necessity: { label: 'Necesidad', color: '#cf9f6b' },
  enjoyment: { label: 'Disfrute', color: '#cf6b9f' },
};

// ─── Main Page ───

export default function CierreMensualPage() {
  const { user } = useAuth();
  const { displayUser } = useScreenshotMode();
  const { apiFetch } = useApi();
  const isPremium = displayUser?.plan === 'PREMIUM';

  const [phase, setPhase] = useState<Phase>('loading');
  const [month, setMonth] = useState('');
  const [closure, setClosure] = useState<ClosureData | null>(null);
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/monthly-closure');
      if (res.ok) {
        const data = await res.json();
        setMonth(data.month);
        setClosure(data.closure);
        setDigest(data.digest);

        // Determine phase:
        // If already reflected → go to summary
        // If not → go to reflection
        if (data.closure?.reflectedAt) {
          setPhase('summary');
          if (data.closure.reflection) {
            setReflectionText(data.closure.reflection);
          }
        } else {
          setPhase('reflection');
        }
      }
    } catch (error) {
      console.error('[Cierre Mensual] Fetch error:', error);
      setPhase('reflection');
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Save reflection and move to summary ───
  const handleSaveReflection = async (skip: boolean = false) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/monthly-closure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          reflection: skip ? null : reflectionText || null,
          markSummaryViewed: true,
        }),
      });

      if (res.ok) {
        setPhase('summary');
      }
    } catch (error) {
      console.error('[Cierre Mensual] Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading state ───
  if (phase === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20">
        <div className="flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-champagne gentle-pulse" />
        </div>
      </div>
    );
  }

  // ─── REFLECTION PHASE ───
  // First identity, then numbers. Always.
  if (phase === 'reflection') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-16 min-h-screen flex flex-col">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[#555] hover:text-champagne transition-colors text-xs mb-12"
        >
          <ArrowLeft size={14} />
          Volver
        </Link>

        {/* The reflection — clean, intimate, silent */}
        <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-light text-white leading-relaxed mb-8 text-center">
            {REFLECTION_TITLE}
          </h1>

          {/* Text area — minimalist, private */}
          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            className="w-full bg-transparent border-b border-[#1a1a1a] focus:border-champagne/30 text-white text-base leading-relaxed py-4 px-1 resize-none outline-none transition-colors min-h-[120px] placeholder:text-[#333]"
            placeholder=""
            rows={4}
          />

          {/* Privacy note — subtle, calm */}
          <p className="text-[#333] text-[10px] mt-3 text-center tracking-wide">
            {REFLECTION_PRIVACY_NOTE}
          </p>

          {/* Actions — calm, no pressure */}
          <div className="flex flex-col items-center gap-3 mt-10">
            <button
              onClick={() => handleSaveReflection(false)}
              disabled={saving}
              className="px-8 py-3 bg-champagne text-black font-medium rounded-xl hover:bg-champagne-hover transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? '...' : SAVE_REFLECTION}
            </button>

            <button
              onClick={() => handleSaveReflection(true)}
              disabled={saving}
              className="text-[#444] hover:text-[#666] transition-colors text-xs"
            >
              {SKIP_REFLECTION}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUMMARY PHASE ───
  // Appears ONLY AFTER reflection (or skip).
  // Calm observation. Not analytics. Not a dashboard.

  if (!digest) return null;

  const monthLabel = formatMonthLabel(month);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-[#555] hover:text-champagne transition-colors text-xs mb-8"
      >
        <ArrowLeft size={14} />
        Volver
      </Link>

      {/* Summary title */}
      <h1 className="text-lg sm:text-xl font-light text-white mb-1 text-center">
        {SUMMARY_TITLE_FACTORY(monthLabel)}
      </h1>

      {/* Reflection display */}
      {closure?.reflection && (
        <div className="mt-8 mb-10">
          <div className="border-l border-[#151515] pl-4">
            <span className="text-[9px] text-[#333] uppercase tracking-wider">Tu reflexión</span>
            <p className="text-[#888] text-sm italic leading-relaxed mt-2">
              {closure.reflection}
            </p>
          </div>
        </div>
      )}

      {/* No data state */}
      {!digest.hasData && digest.noDataMessage && (
        <div className="text-center py-20">
          <p className="text-[#555] text-sm">{digest.noDataMessage.title}</p>
          <p className="text-[#333] text-xs mt-2">{digest.noDataMessage.subtitle}</p>
        </div>
      )}

      {/* Intention Balance */}
      {digest.intentionBalance && digest.intentionBalance.total > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] text-[#444] mb-4 tracking-wide">{INTENTION_BALANCE_TITLE}</h2>
          <IntentionBar balance={digest.intentionBalance} />
        </div>
      )}

      {/* Evolution */}
      {isPremium && digest.evolution && (
        <div className="mt-6">
          <h2 className="text-[11px] text-[#444] mb-2 tracking-wide">{ELITE_EVOLUTION}</h2>
          <p className="text-[#888] text-sm italic">{digest.evolution.label}</p>
        </div>
      )}

      {/* Evolution gate for FREE */}
      {!isPremium && digest.intentionBalance && (
        <div className="mt-4">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_EVOLUTION}>
            <div className="h-12" />
          </PremiumGate>
        </div>
      )}

      {/* Memories */}
      {isPremium && digest.memories.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] text-[#444] mb-4 tracking-wide">{MEMORIES_TITLE}</h2>
          <div className="space-y-3">
            {digest.memories.map((memory, i) => (
              <div key={i} className="border-l border-[#151515] pl-3">
                <p className="text-[#777] text-xs italic leading-relaxed">{memory.text}</p>
                <p className="text-[9px] text-[#2a2a2a] mt-1">
                  {memory.empire} · {new Date(memory.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories gate for FREE */}
      {!isPremium && digest.financial && (
        <div className="mt-4">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_MEMORIES}>
            <div className="h-12" />
          </PremiumGate>
        </div>
      )}

      {/* Connections — from the patterns engine, single source of truth */}
      {digest.connections.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] text-[#444] mb-4 tracking-wide">{PATTERNS_TITLE}</h2>
          <div className="space-y-3">
            {isPremium && digest.connections.length > 1 && (
              <p className="text-[#555] text-xs italic mb-2">{PATTERNS_INTRO}</p>
            )}
            {!isPremium && digest.connections.length === 1 && (
              <p className="text-[#555] text-xs italic mb-2">{PATTERNS_INTRO_FREE}</p>
            )}
            {digest.connections.map((conn) => (
              <div key={conn.id} className="border-l border-[#151515] pl-3">
                <p className="text-[#888] text-sm italic leading-relaxed">{conn.text}</p>
                {isPremium && conn.empires.length > 0 && (
                  <p className="text-[9px] text-[#2a2a2a] mt-1">
                    {conn.empires.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financial Balance */}
      {digest.financial && (
        <div className="mt-8">
          <h2 className="text-[11px] text-[#444] mb-4 tracking-wide">{FINANCIAL_BALANCE_TITLE}</h2>
          <FinancialDisplay financial={digest.financial} />
        </div>
      )}

      {/* Rhythm */}
      {digest.rhythm && (
        <div className="mt-6">
          <h2 className="text-[11px] text-[#444] mb-2 tracking-wide">{RHYTHM_TITLE}</h2>
          <p className="text-[#888] text-sm italic">{digest.rhythm.rhythmLabel}</p>
          <PrivacyMask compact>
            <div className="flex flex-wrap gap-3 mt-2">
              {digest.rhythm.checkinDays > 0 && (
                <span className="text-[9px] text-[#444]">{digest.rhythm.checkinDays} check-ins</span>
              )}
              {digest.rhythm.financeLogs > 0 && (
                <span className="text-[9px] text-[#444]">{digest.rhythm.financeLogs} registros financieros</span>
              )}
              {digest.rhythm.journalEntries > 0 && (
                <span className="text-[9px] text-[#444]">{digest.rhythm.journalEntries} entradas</span>
              )}
              {digest.rhythm.meditationSessions > 0 && (
                <span className="text-[9px] text-[#444]">{digest.rhythm.meditationSessions} meditaciones</span>
              )}
            </div>
          </PrivacyMask>
        </div>
      )}

      {/* FREE hint */}
      {!isPremium && (
        <div className="mt-8 text-center">
          <p className="text-[9px] text-[#333] flex items-center justify-center gap-1">
            <Circle size={3} fill="currentColor" className="text-champagne/40" />
            {ELITE_DEEPER}
          </p>
        </div>
      )}

      <div className="h-16" />
    </div>
  );
}

// ═══════════════════════════════════════════
// Sub-components — calm, minimal, premium
// ═══════════════════════════════════════════

// ─── Intention Bar ───
// A calm horizontal bar showing intention distribution.
// NOT a pie chart. NOT percentages. Just gentle proportions.

function IntentionBar({ balance }: { balance: IntentionBalance }) {
  const total = balance.total;
  if (total === 0) return <p className="text-[#555] text-xs">{INTENTION_BALANCE_EMPTY}</p>;

  const segments = [
    { key: 'tranquility', value: balance.tranquility },
    { key: 'growth', value: balance.growth },
    { key: 'necessity', value: balance.necessity },
    { key: 'enjoyment', value: balance.enjoyment },
  ].filter(s => s.value > 0);

  return (
    <div>
      <PrivacyMask compact>
        {/* Bar */}
        <div className="flex h-2 rounded-full overflow-hidden bg-[#111] gap-px">
          {segments.map(seg => (
            <div
              key={seg.key}
              className="rounded-full transition-all duration-500"
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: INTENTION_LABELS[seg.key]?.color || '#555',
                opacity: 0.7,
              }}
            />
          ))}
        </div>

        {/* Labels */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {segments.map(seg => (
            <div key={seg.key} className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: INTENTION_LABELS[seg.key]?.color || '#555', opacity: 0.7 }}
              />
              <span className="text-[10px] text-[#666]">
                {INTENTION_LABELS[seg.key]?.label || seg.key} · {seg.value}
              </span>
            </div>
          ))}
        </div>
      </PrivacyMask>
    </div>
  );
}

// ─── Financial Display ───
// Simple, elegant. No dashboard. No KPIs.
// European number format: 1.250,75 €

function FinancialDisplay({ financial }: { financial: FinancialSummary }) {
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const formatted = abs.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return (n < 0 ? '-' : '') + formatted + ' €';
  };

  return (
    <div>
      <PrivacyMask compact>
        {/* Balance */}
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-[#666] text-xs">Balance</span>
          <span className={`text-lg font-light ${financial.balance >= 0 ? 'text-white' : 'text-white/70'}`}>
            {fmt(financial.balance)}
          </span>
        </div>

        {/* Income / Expenses */}
        <div className="flex gap-6 mb-4">
          <div>
            <p className="text-[10px] text-[#555] mb-0.5">Ingresos</p>
            <p className="text-sm text-white/80">{fmt(financial.income)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#555] mb-0.5">Gastos</p>
            <p className="text-sm text-white/80">{fmt(financial.expenses)}</p>
          </div>
        </div>

        {/* Top categories — calm, not ranked */}
        {financial.topCategories.length > 0 && (
          <div className="border-t border-[#1a1a1a] pt-3 mt-3">
            <p className="text-[10px] text-[#444] mb-2">Categorías con más movimiento</p>
            <div className="space-y-1.5">
              {financial.topCategories.slice(0, 3).map((cat, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-[#777]">{cat.category}</span>
                  <span className="text-xs text-[#555]">{fmt(cat.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </PrivacyMask>
    </div>
  );
}
