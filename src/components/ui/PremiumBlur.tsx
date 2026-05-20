'use client';

import { ReactNode } from 'react';
import { Crown } from 'lucide-react';
import Link from 'next/link';

interface PremiumBlurProps {
  children: ReactNode;
}

export default function PremiumBlur({ children }: PremiumBlurProps) {
  return (
    <div className="relative group">
      {/* Blurred content */}
      <div className="blur-[6px] select-none pointer-events-none saturate-50">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg backdrop-blur-[2px] premium-overlay-enter">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          {/* Crown icon */}
          <div className="w-12 h-12 rounded-full bg-[#c8a55a]/15 flex items-center justify-center border border-[#c8a55a]/30">
            <Crown size={22} className="text-[#c8a55a]" />
          </div>

          {/* Message */}
          <div>
            <p className="text-white font-medium text-sm tracking-wide">
              Más capas aquí
            </p>
            <p className="text-[#777] text-xs mt-1">
              Élite accede a mayor profundidad
            </p>
          </div>

          {/* Depth button — not "upgrade", discover */}
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-[#c8a55a]/10 border border-[#c8a55a]/25 text-[#c8a55a] font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-[#c8a55a]/15 hover:border-[#c8a55a]/35 transition-all duration-300"
          >
            <Crown size={14} />
            Descubrir
          </Link>
        </div>
      </div>
    </div>
  );
}
