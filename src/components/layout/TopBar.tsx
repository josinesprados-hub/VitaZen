'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/checkin': 'Check-in',
  '/insights': 'Observaciones',
  '/timeline': 'Memoria',
  '/logros': 'Logros',
  '/perfil': 'Perfil',
  '/ajustes': 'Ajustes',
  '/elite': 'Élite',
  '/cierre-mensual': 'Cierre mensual',
  '/memoria-de-vida': 'Tu evolución',
  '/imperio/mente': 'Mente',
  '/imperio/energia': 'Energía',
  '/imperio/disciplina': 'Disciplina',
  '/imperio/riqueza': 'Finanzas',
  '/imperio/crecimiento': 'Crecimiento',
  '/imperio/mentor': 'Mentor',
};

function getPageTitle(pathname: string): string | null {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match for nested routes
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title;
  }
  return null;
}

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { displayUser } = useScreenshotMode();
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 bg-[#000000]/95 backdrop-blur-md border-b border-[#1a1a1a] safe-top">
      <div className="flex items-center justify-between h-12 sm:h-14 px-4 sm:px-4 lg:px-6">
        {/* Left: mobile hamburger + page title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-11 h-11 -ml-1 rounded-xl text-white hover:text-champagne hover:bg-[#1a1a1a]/50 transition-colors touch-press"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          {/* Page title on mobile — gives context without needing sidebar */}
          {pageTitle && (
            <span className="lg:hidden text-sm text-[#999] font-medium">
              {pageTitle}
            </span>
          )}
        </div>

        {/* Right: quiet Élite whisper — the only desktop element */}
        <div className="flex items-center">
          {displayUser?.plan === 'PREMIUM' && (
            <span className="text-[9px] font-medium text-champagne/40 tracking-wider">
              Élite
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
