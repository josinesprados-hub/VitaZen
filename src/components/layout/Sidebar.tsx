'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Shield,
  Brain,
  Zap,
  Gem,
  TrendingUp,
  Sparkles,
  LayoutDashboard,
  CreditCard,
  LogOut,
  X,
} from 'lucide-react';

const EMPIRES = [
  { name: 'Disciplina', href: '/imperio/disciplina', icon: Shield, emoji: '⚔️' },
  { name: 'Mente', href: '/imperio/mente', icon: Brain, emoji: '🧠' },
  { name: 'Energía', href: '/imperio/energia', icon: Zap, emoji: '⚡' },
  { name: 'Finanzas', href: '/imperio/riqueza', icon: Gem, emoji: '💎' },
  { name: 'Crecimiento', href: '/imperio/crecimiento', icon: TrendingUp, emoji: '📈' },
  { name: 'Mentor', href: '/imperio/mentor', icon: Sparkles, emoji: '✨' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-[#0a0a0a] border-r border-[#1a1a1a] z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-[#1a1a1a]">
            <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
              <img src="/images/vitazen-logo.png" alt="VitaZen" className="w-10 h-10" />
              <span className="text-[#c8a55a] text-xl font-bold tracking-widest">VITAZEN</span>
            </Link>
            <button onClick={onClose} className="lg:hidden text-white hover:text-[#c8a55a]">
              <X size={20} />
            </button>
          </div>

          {/* Dashboard link */}
          <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
            <Link
              href="/dashboard"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </Link>

            <div className="pt-5 pb-2">
              <p className="px-4 text-xs text-[#555] uppercase tracking-widest font-semibold">Imperios</p>
            </div>

            {EMPIRES.map((empire) => {
              const isActive = pathname.startsWith(empire.href);
              return (
                <Link
                  key={empire.name}
                  href={empire.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                      : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
                  }`}
                >
                  <empire.icon size={18} />
                  {empire.name}
                </Link>
              );
            })}

            {user?.plan === 'FREE' && (
              <>
                <div className="pt-5 pb-2">
                  <p className="px-4 text-xs text-[#555] uppercase tracking-widest font-semibold">Suscripción</p>
                </div>
                <Link
                  href="/pricing"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/pricing'
                      ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                      : 'text-[#c8a55a] hover:bg-[#c8a55a]/10'
                  }`}
                >
                  <CreditCard size={20} />
                  Mejorar a Premium
                </Link>
              </>
            )}
          </nav>

          {/* User section */}
          <div className="border-t border-[#1a1a1a] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#c8a55a]/20 flex items-center justify-center text-[#c8a55a] text-sm font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'V'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{user?.name || 'Usuario'}</p>
                <p className="text-xs text-[#c8a55a]">{user?.plan || 'FREE'}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[#999] hover:text-white hover:bg-[#1a1a1a] rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
