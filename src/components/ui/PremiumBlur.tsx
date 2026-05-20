'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Circle } from 'lucide-react';

// ─────────────────────────────────────────
// DepthBlur (formerly PremiumBlur)
//
// Reimagined: no aggressive blur, no Crown,
// no "Descubrir" button, no Lock icon.
//
// A gentle dim + a contemplative whisper.
// The user feels curiosity, not frustration.
// ─────────────────────────────────────────

interface PremiumBlurProps {
  children: ReactNode;
}

export default function PremiumBlur({ children }: PremiumBlurProps) {
  return (
    <div className="relative group">
      {/* Dimmed content — visible, not blurred */}
      <div className="opacity-35 select-none pointer-events-none">
        {children}
      </div>

      {/* Depth overlay — gradient fade, not hard wall */}
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg depth-gate-overlay">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          {/* Small gold dot — presence, not royalty */}
          <Circle size={5} className="text-[#c8a55a]/40" fill="currentColor" />

          {/* Whisper — not a sales pitch */}
          <div>
            <p className="text-[#999] text-xs leading-relaxed">
              Algunas conexiones solo aparecen con el tiempo
            </p>
          </div>

          {/* Quiet link — not a button */}
          <Link
            href="/elite"
            className="text-[#c8a55a]/40 hover:text-[#c8a55a]/70 transition-colors text-[10px]"
          >
            Conocer Élite
          </Link>
        </div>
      </div>
    </div>
  );
}
