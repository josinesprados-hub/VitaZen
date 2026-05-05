'use client';

import { ReactNode } from 'react';
import { Lock, Crown } from 'lucide-react';
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
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg backdrop-blur-[2px]">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          {/* Crown icon */}
          <div className="w-12 h-12 rounded-full bg-[#c8a55a]/15 flex items-center justify-center border border-[#c8a55a]/30">
            <Crown size={22} className="text-[#c8a55a]" />
          </div>

          {/* Message */}
          <div>
            <p className="text-white font-semibold text-sm tracking-wide">
              Desbloquea con Plan Élite
            </p>
            <p className="text-[#999] text-xs mt-1">
              Accede a contenido premium exclusivo
            </p>
          </div>

          {/* Upgrade button */}
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-[#c8a55a] text-black font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-all duration-200 shadow-[0_0_20px_rgba(200,165,90,0.15)] hover:shadow-[0_0_30px_rgba(200,165,90,0.25)]"
          >
            <Lock size={14} />
            Mejorar a Premium
          </Link>
        </div>
      </div>
    </div>
  );
}
