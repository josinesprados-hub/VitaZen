'use client';

import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-[#000000] border-b border-[#1a1a1a]">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-white hover:text-[#c8a55a] transition-colors"
        >
          <Menu size={24} />
        </button>

        <div className="hidden lg:block">
          <p className="text-sm text-[#999]">
            Bienvenido, <span className="text-[#c8a55a]">{user?.name || 'Usuario'}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {user?.plan === 'FREE' && (
            <span className="text-xs px-3 py-1 rounded-full border border-[#c8a55a]/30 text-[#c8a55a]">
              FREE
            </span>
          )}
          {user?.plan === 'PREMIUM' && (
            <span className="text-xs px-3 py-1 rounded-full bg-[#c8a55a] text-black font-semibold">
              PREMIUM
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
