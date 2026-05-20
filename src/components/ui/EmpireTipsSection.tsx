'use client';

import { Lightbulb, Lock, Crown } from 'lucide-react';
import Link from 'next/link';
import { useEmpireTips, type Tip } from '@/hooks/useEmpireTips';

// ═══════════════════════════════════════════
// EmpireTipsSection — shared tips display
// ═══════════════════════════════════════════
//
// - Shows 2 FREE tips clearly
// - Shows PREMIUM tips with SINGLE CTA (not per-tip)
// - Premium users see all tips unblurred
// - Clean, minimal, premium feel

interface EmpireTipsSectionProps {
  empire: string;
  subtitle: string;
}

function TipCard({ tip }: { tip: Tip }) {
  return (
    <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
      <h3 className="text-[#c8a55a] font-medium text-sm mb-1">{tip.title}</h3>
      <p className="text-[#999] text-sm">{tip.content}</p>
    </div>
  );
}

export default function EmpireTipsSection({ empire, subtitle }: EmpireTipsSectionProps) {
  const { freeTips, premiumTips, isPremium, loading } = useEmpireTips(empire);

  if (loading || (freeTips.length === 0 && premiumTips.length === 0)) {
    return null;
  }

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
      <div className="flex items-center gap-3 mb-4">
        <Lightbulb size={20} className="text-[#c8a55a]" />
        <h2 className="text-lg font-semibold text-white">Notas</h2>
      </div>
      <p className="text-[#666] text-xs mb-5">{subtitle}</p>

      <div className="space-y-3">
        {/* FREE tips — always visible */}
        {freeTips.map((tip) => (
          <TipCard key={tip.id} tip={tip} />
        ))}

        {/* PREMIUM tips — single CTA for all, not per-tip */}
        {premiumTips.length > 0 && (
          isPremium ? (
            // Premium user: show tips clearly
            premiumTips.map((tip) => (
              <TipCard key={tip.id} tip={tip} />
            ))
          ) : (
            // Free user: single blur overlay for all premium tips
            <div className="relative">
              {/* Blurred preview of premium tips */}
              <div className="blur-[6px] select-none pointer-events-none saturate-50 space-y-3">
                {premiumTips.map((tip) => (
                  <TipCard key={tip.id} tip={tip} />
                ))}
              </div>

              {/* Single CTA overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#c8a55a]/15 flex items-center justify-center border border-[#c8a55a]/30">
                    <Crown size={22} className="text-[#c8a55a]" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm tracking-wide">
                      Más capas
                    </p>
                    <p className="text-[#999] text-xs mt-1">
                      Con Élite
                    </p>
                  </div>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 bg-[#c8a55a] text-black font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-all duration-200 shadow-[0_0_20px_rgba(200,165,90,0.15)] hover:shadow-[0_0_30px_rgba(200,165,90,0.25)]"
                  >
                    <Lock size={14} />
                    Descubrir
                  </Link>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
