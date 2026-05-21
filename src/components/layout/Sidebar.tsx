'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Shield,
  Brain,
  Zap,
  Gem,
  TrendingUp,
  Sparkles,
  LayoutDashboard,
  Clock,
  Trophy,
  Sunrise,
  Layers,
  Circle,
  LogOut,
  X,
  Lightbulb,
  UserCircle,
  Settings,
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
  const router = useRouter();
  const { user, signOut } = useAuth();

  // Lock body scroll when sidebar is open on mobile.
  // overflow:hidden prevents background scrolling without position:fixed,
  // which breaks Android TWA/WebView compositor.
  useEffect(() => {
    if (open) {
      document.body.classList.add('scroll-locked');
      return () => {
        document.body.classList.remove('scroll-locked');
      };
    }
  }, [open]);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden sidebar-overlay"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-72 sm:w-64 bg-[#0a0a0a] border-r border-[#1a1a1a] z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 safe-top safe-bottom ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-[#1a1a1a]">
            <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
              <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-10 h-10 rounded-[20%]" />
              <span className="text-[#c8a55a] text-xl font-bold tracking-widest">VITAZEN</span>
            </Link>
            <button onClick={onClose} className="lg:hidden text-white hover:text-[#c8a55a] close-btn">
              <X size={20} />
            </button>
          </div>

          {/* Dashboard link */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scroll-contain">
            <Link
              href="/dashboard"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/dashboard'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </Link>

            <Link
              href="/timeline"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/timeline'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Clock size={18} />
              Memoria
            </Link>

            <Link
              href="/logros"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/logros'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Trophy size={18} />
              Logros
            </Link>

            <Link
              href="/checkin"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/checkin'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Sunrise size={18} />
              Check-in
            </Link>

            <Link
              href="/insights"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/insights'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Lightbulb size={18} />
              Insights
            </Link>

            <Link
              href="/memoria-de-vida"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/memoria-de-vida'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Layers size={18} />
              Etapas
            </Link>

            <Link
              href="/perfil"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/perfil'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <UserCircle size={18} />
              Perfil
            </Link>

            <Link
              href="/ajustes"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
                pathname === '/ajustes'
                  ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                  : 'text-white hover:bg-[#1a1a1a] hover:text-[#c8a55a]'
              }`}
            >
              <Settings size={18} />
              Ajustes
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-press ${
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
          </nav>

          {/* User section */}
          <div className="border-t border-[#1a1a1a] p-4">
            <Link
              href="/perfil"
              onClick={onClose}
              className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-full bg-[#c8a55a]/20 flex items-center justify-center text-[#c8a55a] text-sm font-bold overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.charAt(0)?.toUpperCase() || 'V'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{user?.name || 'Usuario'}</p>
                <p className="text-xs text-[#c8a55a]/50">{user?.plan === 'PREMIUM' ? 'Élite' : 'Free'}</p>
              </div>
            </Link>

            {/* Élite entry — navigates to Élite page, not Stripe direct */}
            {user?.plan === 'FREE' ? (
              <button
                onClick={() => {
                  onClose();
                  router.push('/elite');
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-[#c8a55a] hover:bg-[#c8a55a]/10 rounded-lg transition-colors touch-press"
              >
                <Circle size={4} fill="currentColor" className="text-[#c8a55a]/40" />
                Élite
              </button>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  router.push('/elite');
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-[#999] hover:text-[#c8a55a] hover:bg-[#1a1a1a] rounded-lg transition-colors touch-press"
              >
                <Circle size={4} fill="currentColor" className="text-[#c8a55a]/30" />
                Tu espacio Élite
              </button>
            )}

            <button
              onClick={async () => {
                await signOut();
                router.replace('/login');
              }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-[#666] hover:text-[#999] hover:bg-[#1a1a1a] rounded-lg transition-colors touch-press mt-1"
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
