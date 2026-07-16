'use client';

import { Lightbulb } from 'lucide-react';
import { PremiumInlineBadge } from '@/components/ui/PremiumGate';
import Link from 'next/link';
import { useEmpireTips, type Tip } from '@/hooks/useEmpireTips';

// ═══════════════════════════════════════════
// EmpireTipsSection — stable tips display
// ═══════════════════════════════════════════
//
// Tips are practical knowledge. They:
//   - ALWAYS render (no null, no hiding, no disappearance)
//   - Show 2 FREE tips for all users
//   - Show 1 additional ÉLITE tip for premium users
//   - Rotate deterministically every 3 days
//
// No silence logic. No rare rendering. No emotional hiding.
// Tips are stable, visible, useful.

interface EmpireTipsSectionProps {
  empire: string;
  subtitle: string;
}

function TipCard({ tip, locked }: { tip: Tip; locked?: boolean }) {
  return (
    <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
      {locked ? (
        <>
          <div className="mb-1">
            <PremiumInlineBadge isPremium={true} freeLabel="" premiumLabel="Élite" />
          </div>
          <h3 className="text-champagne font-medium text-sm mb-3">{tip.title}</h3>
          <p className="text-[#888] text-sm mb-3">🔒 Disponible con Élite</p>
          <Link href="/elite" className="text-champagne/40 hover:text-champagne/70 transition-colors text-[10px]">Conocer Élite</Link>
        </>
      ) : (
        <>
          <h3 className="text-champagne font-medium text-sm mb-1">{tip.title}</h3>
          <p className="text-[#999] text-sm">{tip.content}</p>
        </>
      )}
    </div>
  );
}

export default function EmpireTipsSection({ empire, subtitle }: EmpireTipsSectionProps) {
  const { freeTips, premiumTips, isPremium, loading, error } = useEmpireTips(empire);

  const hasTips = freeTips.length > 0 || premiumTips.length > 0;

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
      <div className="flex items-center gap-3 mb-4">
        <Lightbulb size={20} className="text-champagne" />
        <h2 className="text-lg font-semibold text-white">Notas</h2>
      </div>
      <p className="text-[#666] text-xs mb-5">{subtitle}</p>

      <div className="space-y-3">
        {loading ? (
          // Loading skeleton — brief, always resolves
          <>
            <div className="h-16 bg-[#111] border border-[#1a1a1a] rounded-lg animate-pulse" />
            <div className="h-16 bg-[#111] border border-[#1a1a1a] rounded-lg animate-pulse" />
          </>
        ) : hasTips ? (
          <>
            {/* FREE tips — always visible, always exactly 2 */}
            {freeTips.map((tip) => (
              <TipCard key={tip.id} tip={tip} />
            ))}

            {/* PREMIUM tip — only for Élite users, from ÉLITE-only battery */}
            {premiumTips.length > 0 && (
              isPremium ? (
                // Premium user: show ÉLITE tip clearly
                premiumTips.map((tip) => (
                  <TipCard key={tip.id} tip={tip} />
                ))
              ) : (
                // Free user: locked — tip.content never in DOM
                premiumTips.map((tip) => (
                  <TipCard key={tip.id} tip={tip} locked />
                ))
              )
            )}
          </>
        ) : error ? (
          // API failed — gentle error state
          <p className="text-[#555] text-sm py-4 text-center">
            No se pudieron cargar las notas
          </p>
        ) : (
          // No tips available (DB empty or not seeded)
          <p className="text-[#444] text-sm py-4 text-center">
            Sin notas disponibles
          </p>
        )}
      </div>
    </div>
  );
}
