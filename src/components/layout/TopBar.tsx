'use client';

import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-[#000000]/95 backdrop-blur-md border-b border-[#1a1a1a] safe-top">
      <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-4 lg:px-6">
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center justify-center w-11 h-11 -ml-1 rounded-xl text-white hover:text-[#c8a55a] hover:bg-[#1a1a1a]/50 transition-colors touch-press"
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>

        <div className="hidden lg:block">
          <p className="text-sm text-[#999]">
            Bienvenido, <span className="text-[#c8a55a]">{user?.name || 'Usuario'}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {user?.plan === 'FREE' && (
            <span className="badge-free">
              FREE
            </span>
          )}
          {user?.plan === 'PREMIUM' && (
            <span className="badge-premium">
              PREMIUM
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
