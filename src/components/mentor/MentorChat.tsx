'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { MentorSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import {
  Brain,
  Send,
  Plus,
  Trash2,
  MessageCircle,
  Lock,
  Pencil,
  Check,
  X,
  ChevronLeft,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Archive,
  ArchiveRestore,
  MoreVertical,
  AlertTriangle,
  Inbox,
  MessageSquareOff,
  BrainCircuit,
  Crown,
  Zap,
  Infinity as InfinityIcon,
  ShieldCheck,
  BookOpen,
  Lightbulb,
} from 'lucide-react';
import Link from 'next/link';
import ContextualHelp from '@/components/ui/ContextualHelp';
import PremiumGate, { PremiumHistoryGate, PremiumInlineBadge } from '@/components/ui/PremiumGate';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface Thread {
  id: string;
  title: string;
  archived: boolean;
  updatedAt: string;
  createdAt: string;
  messages?: { content: string; role: string; createdAt: string }[];
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

// ─────────────────────────────────────────
// Relative date helper
// ─────────────────────────────────────────

function getRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return 'Esta semana';
  if (diffDays < 30) return 'Este mes';
  return 'Anterior';
}

// ─────────────────────────────────────────
// Component Props
// ─────────────────────────────────────────

interface MentorChatProps {
  backHref: string;
  headerIcon?: 'brain' | 'sparkles';
}

// ─────────────────────────────────────────
// Module-level constants & helpers
// ─────────────────────────────────────────

const STORAGE_KEY = 'vitazen_active_thread';
const DATE_GROUP_ORDER = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Anterior'];

function getProgressColor(rem: number, limit: number): string {
  if (!isFinite(limit)) return '#c8a55a';
  const pct = rem / limit;
  if (pct > 0.5) return '#c8a55a';
  if (pct > 0.25) return '#e8a849';
  return '#ef4444';
}

// ─────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────

export default function MentorChat({ backHref, headerIcon = 'sparkles' }: MentorChatProps) {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number>(15);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [historyLimited, setHistoryLimited] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');

  // Tab: 'active' | 'archived'
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Contextual indicator
  const [isContextual, setIsContextual] = useState(false);
  const [showContextTooltip, setShowContextTooltip] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const activeThreadRef = useRef<string | null>(null);
  const fetchIdRef = useRef(0);
  const lastSendTime = useRef(0);

  const isPremium = user?.plan === 'PREMIUM';

  // Lock body scroll when any modal (delete confirm or limit modal) is open
  useEffect(() => {
    if (deleteConfirm || showLimitModal) {
      document.body.classList.add('scroll-locked');
      return () => document.body.classList.remove('scroll-locked');
    }
  }, [deleteConfirm, showLimitModal]);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    activeThreadRef.current = activeThread;
    if (activeThread) {
      setMessages([]); // Clear immediately to avoid flash of old messages
      setLoadError(false); // Clear any previous load error when switching threads
      fetchMessages(activeThread);
      try { localStorage.setItem(STORAGE_KEY, activeThread); } catch {}
    }
  }, [activeThread]);

  useEffect(() => {
    // Use scrollTo on the scroll container instead of scrollIntoView.
    // scrollIntoView causes viewport jumps on iOS Safari when the
    // virtual keyboard is open, because it tries to scroll the
    // entire document, not just the chat container.
    const container = scrollContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages]);

  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingThreadId]);

  // Auto-dismiss action errors after 3s
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(''), 3000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Refresh data when app comes back to foreground (mobile resume)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeThread) {
        // Silently refresh messages and threads when returning to the app
        fetchMessages(activeThread);
        fetchThreads();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeThread, fetchMessages, fetchThreads]);

  // Network status detection for mobile resilience
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    // Set initial state
    setIsOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────

  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai/threads');
      if (res.ok) {
        const data = await res.json();
        const allThreads: Thread[] = data.threads;
        setThreads(allThreads);
        setHistoryLimited(!!data.historyLimited);
        // Initialize remaining/limit from server if available
        if (data.remaining !== undefined && data.remaining !== null) {
          setRemaining(data.remaining);
          setDailyLimit(data.limit || 15);
        }
        // Only set active thread on initial load (when none is set)
        if (allThreads.length > 0 && !activeThreadRef.current) {
          let savedThreadId: string | null = null;
          try { savedThreadId = localStorage.getItem(STORAGE_KEY); } catch {}

          // Only restore if saved thread is active (not archived)
          const savedExists = savedThreadId && allThreads.some((t: Thread) => t.id === savedThreadId && !t.archived);
          const activeThreads = allThreads.filter((t: Thread) => !t.archived);
          setActiveThread(savedExists ? savedThreadId! : (activeThreads.length > 0 ? activeThreads[0].id : null));
        }
      }
    } catch (e) { 
      console.error(e); 
      setLoadError(true);
    }
    finally { setLoading(false); }
  }, [apiFetch]);

  const fetchMessages = useCallback(async (threadId: string) => {
    const thisFetchId = ++fetchIdRef.current;
    try {
      const res = await apiFetch(`/api/ai/threads/${threadId}/messages`);
      // Only apply if this is still the latest fetch (prevents stale overwrites on rapid thread switching)
      if (res.ok && fetchIdRef.current === thisFetchId) {
        const data = await res.json();
        setMessages(data.messages);
        setHistoryLimited(!!data.historyLimited);
      }
    } catch (e) { console.error(e); }
  }, [apiFetch]);

  // ─────────────────────────────────────────
  // Thread actions
  // ─────────────────────────────────────────

  const createThread = async () => {
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nueva conversación' }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(prev => [data.thread, ...prev]);
        setActiveThread(data.thread.id);
        setMessages([]);
        setTab('active');
        setTimeout(() => chatInputRef.current?.focus(), 100);
      } else {
        const data = await res.json();
        if (data.error?.includes('Maximum')) {
          setActionError('Límite de conversaciones alcanzado');
        }
      }
    } catch (e) { console.error(e); setActionError('No se pudo crear la conversación'); }
  };

  const deleteThread = async (threadId: string) => {
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'DELETE',
        body: JSON.stringify({ threadId }),
      });
      if (res.ok) {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        if (activeThread === threadId) {
          const remainingThreads = threads.filter(t => t.id !== threadId && !t.archived);
          setActiveThread(remainingThreads.length > 0 ? remainingThreads[0].id : null);
          setMessages([]);
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
        }
      }
    } catch (e) { console.error(e); setActionError('No se pudo eliminar'); }
    finally { setDeleteConfirm(null); }
  };

  const archiveThread = async (threadId: string) => {
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'PATCH',
        body: JSON.stringify({ threadId, archived: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, archived: true } : t));
        // If the archived thread was active, switch to the next active one
        if (activeThread === threadId) {
          const activeThreads = threads.filter(t => t.id !== threadId && !t.archived);
          if (activeThreads.length > 0) {
            setActiveThread(activeThreads[0].id);
          } else {
            setActiveThread(null);
            setMessages([]);
          }
        }
      }
    } catch (e) { console.error(e); setActionError('No se pudo archivar'); }
  };

  const unarchiveThread = async (threadId: string) => {
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'PATCH',
        body: JSON.stringify({ threadId, archived: false }),
      });
      if (res.ok) {
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, archived: false } : t));
      }
    } catch (e) { console.error(e); setActionError('No se pudo restaurar'); }
  };

  const renameThread = async (threadId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'PATCH',
        body: JSON.stringify({ threadId, title: newTitle.trim() }),
      });
      if (res.ok) {
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle.trim() } : t));
      }
    } catch (e) { console.error(e); setActionError('No se pudo renombrar'); }
    finally { setEditingThreadId(null); }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !activeThread || sendingRef.current) return;

    const now = Date.now();
    if (now - lastSendTime.current < 1000) return; // Debounce: 1s between sends
    lastSendTime.current = now;

    const sentThreadId = activeThread;
    sendingRef.current = true;

    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ threadId: sentThreadId, content }),
      });

      if (res.status === 403) {
        const data = await res.json();
        setShowLimitModal(true);
        setRemaining(0);
        setDailyLimit(data.limit || 15);
        // Remove the optimistic user message since it was blocked
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          id: 'resp-' + Date.now(),
          role: 'assistant',
          content: data.message,
          createdAt: new Date().toISOString(),
        };
        // Only add response if still on the same thread
        if (activeThreadRef.current === sentThreadId) {
          setMessages(prev => [...prev, assistantMessage]);
          setRemaining(data.remaining);
          setDailyLimit(data.limit || 15);
          setIsContextual(!!data.contextual);
        }

        // Refresh threads to get updated title and updatedAt
        const threadsRes = await apiFetch('/api/ai/threads');
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json();
          setThreads(threadsData.threads);
          setHistoryLimited(!!threadsData.historyLimited);
        }
      } else if (res.status !== 403) {
        // Non-403 error: remove optimistic message and show error
        if (activeThreadRef.current === sentThreadId) {
          setMessages(prev => prev.filter(m => m.id !== userMessage.id));
          setInput(content);
          setActionError('Error al enviar. Inténtalo de nuevo.');
        }
      }
    } catch (e) {
      console.error(e);
      // Remove optimistic user message on network error if still on same thread
      if (activeThreadRef.current === sentThreadId) {
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setInput(content); // Restore input so user can retry
        setActionError('Sin conexión. Tu mensaje se ha restaurado.');
      }
    }
    finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  // ─────────────────────────────────────────
  // Computed (memoized to avoid re-filtering on every render)
  // ─────────────────────────────────────────

  const activeThreads = useMemo(() => threads.filter(t => !t.archived), [threads]);
  const archivedThreads = useMemo(() => threads.filter(t => t.archived), [threads]);
  const visibleThreads = useMemo(() => tab === 'active' ? activeThreads : archivedThreads, [tab, activeThreads, archivedThreads]);

  // Group visible threads by date
  const groupedThreads = useMemo(() => visibleThreads.reduce<Record<string, Thread[]>>((acc, thread) => {
    const group = getDateGroup(thread.updatedAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(thread);
    return acc;
  }, {}), [visibleThreads]);

  const activeThreadData = useMemo(() => threads.find(t => t.id === activeThread) ?? null, [threads, activeThread]);

  const IconComponent = useMemo(() => headerIcon === 'brain' ? Brain : Sparkles, [headerIcon]);

  // ─────────────────────────────────────────
  // Context menu handler
  // ─────────────────────────────────────────

  const handleContextMenu = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).closest('.sidebar-area')?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;
    setContextMenu({ threadId, x, y });
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  if (loading) {
    return <MentorSkeleton />;
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto min-h-[60dvh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="El mentor no está disponible"
          subtitle="No se pudo conectar con el asistente. Tu historial está a salvo."
          onRetry={() => {
            setLoadError(false);
            setLoading(true);
            fetchThreads();
          }}
          secondaryAction={{
            label: 'Volver al dashboard',
            href: backHref,
          }}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] -m-4 lg:-m-6 overflow-hidden sm:max-w-6xl sm:mx-auto sm:h-[100dvh]">
      {/* Offline indicator — subtle top banner */}
      {isOffline && (
        <div className="px-3 py-1.5 bg-[#e8a849]/10 border-b border-[#e8a849]/20 text-[#e8a849] text-xs text-center shrink-0">
          Sin conexión — los mensajes se enviarán cuando vuelva la red
        </div>
      )}
      {/* Header — compact on mobile */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-0 sm:py-0 sm:mb-5 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
            <IconComponent size={18} className="text-[#c8a55a] sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-2xl font-bold text-white">Mentor IA</h1>
              {/* Discreet Premium badge */}
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 px-2 py-0.5 rounded-full">
                  <Crown size={10} className="shrink-0" />
                  Premium
                </span>
              )}
            </div>
            <p className="text-[#999] text-xs sm:text-sm hidden sm:block">
              {isPremium
                ? 'Tu mentor experto con memoria avanzada'
                : 'Tu guía de desarrollo personal'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Message counter pill for FREE users */}
          {!isPremium && remaining !== null && (
            <div className="message-counter-pill flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]">
              <Zap size={12} className={remaining <= 3 ? 'text-red-400' : 'text-[#c8a55a]'} />
              <span className={remaining <= 3 ? 'text-red-400' : 'text-[#c8a55a]'}>
                {remaining}/{dailyLimit}
              </span>
            </div>
          )}
          {/* Premium infinity indicator */}
          {isPremium && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[#c8a55a]/5 border border-[#c8a55a]/15">
              <InfinityIcon size={12} className="text-[#c8a55a]" />
              <span className="text-[#c8a55a] hidden sm:inline">Sin límite</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 sm:p-2 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors hidden sm:flex"
            title={sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Contextual Help — desktop only, saves mobile vertical space */}
      <div className="hidden sm:block">
        <ContextualHelp
          storageKey="vitazen_help_mentor"
          title="Mentor IA"
          text="Escribe tu pregunta y el mentor te responderá. Crea nuevas conversaciones, renómbralas o archívalas desde el menú lateral."
        />
      </div>

      {/* Main content — flex-1 with min-h-0 for proper overflow */}
      <div className="flex flex-1 gap-0 sm:gap-4 min-h-0 overflow-hidden">
        {/* ────────── Sidebar (desktop only) ────────── */}
        <div
          className={`shrink-0 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative sidebar-area ${
            sidebarOpen ? 'w-72' : 'w-0 border-0'
          } hidden sm:flex`}
        >
          {/* Back + New button */}
          <div className="p-3 border-b border-[#1a1a1a] space-y-2">
            <Link
              href={backHref}
              className="text-[#666] text-xs hover:text-[#c8a55a] flex items-center gap-1 transition-colors"
            >
              <ChevronLeft size={12} /> Volver
            </Link>
            <button
              onClick={createThread}
              className="w-full flex items-center justify-center gap-2 bg-[#c8a55a] text-black font-semibold py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
            >
              <Plus size={16} /> Nueva conversación
            </button>
          </div>

          {/* Tab selector: Todas / Archivadas */}
          <div className="flex border-b border-[#1a1a1a]">
            <button
              onClick={() => setTab('active')}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                tab === 'active'
                  ? 'text-[#c8a55a]'
                  : 'text-[#666] hover:text-[#999]'
              }`}
            >
              Todas
              {activeThreads.length > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === 'active' ? 'bg-[#c8a55a]/20 text-[#c8a55a]' : 'bg-[#1a1a1a] text-[#555]'
                }`}>
                  {activeThreads.length}
                </span>
              )}
              {tab === 'active' && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[#c8a55a] rounded-full" />
              )}
            </button>
            <button
              onClick={() => setTab('archived')}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                tab === 'archived'
                  ? 'text-[#c8a55a]'
                  : 'text-[#666] hover:text-[#999]'
              }`}
            >
              Archivadas
              {archivedThreads.length > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === 'archived' ? 'bg-[#c8a55a]/20 text-[#c8a55a]' : 'bg-[#1a1a1a] text-[#555]'
                }`}>
                  {archivedThreads.length}
                </span>
              )}
              {tab === 'archived' && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[#c8a55a] rounded-full" />
              )}
            </button>
          </div>

          {/* Thread list grouped by date */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-hide">
            {DATE_GROUP_ORDER.map((group, groupIdx) => {
              const groupThreads = groupedThreads[group];
              if (!groupThreads || groupThreads.length === 0) return null;
              // FREE users: blur groups beyond "Esta semana" (index 3+)
              const isOldGroup = !isPremium && groupIdx >= 3;
              return (
                <div key={group} className="animate-in" style={{ animationDelay: '50ms' }}>
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <p className="text-[10px] text-[#555] uppercase tracking-widest font-semibold">
                      {group}
                    </p>
                    {groupIdx === 0 && !isPremium && visibleThreads.length > 5 && (
                      <PremiumInlineBadge isPremium={isPremium} freeLabel="7 días" premiumLabel="Ilimitado" />
                    )}
                  </div>
                  {isOldGroup ? (
                    <PremiumGate isPremium={isPremium} intensity="medium" compact label="Historial completo">
                      <div className="space-y-0.5">
                        {groupThreads.map((thread) => (
                          <div
                            key={thread.id}
                            className="group flex items-center rounded-lg px-3 py-2.5 text-[#ccc]"
                          >
                            <MessageCircle size={14} className="shrink-0 mr-2.5 text-[#555]" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate leading-tight">{thread.title}</p>
                              <p className="text-[10px] text-[#555] mt-0.5">{getRelativeDate(thread.updatedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PremiumGate>
                  ) : (
                    <div className="space-y-0.5">
                      {groupThreads.map((thread) => (
                        <div
                          key={thread.id}
                          className={`group flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-200 ${
                            activeThread === thread.id
                              ? 'bg-[#c8a55a]/10 text-[#c8a55a]'
                              : tab === 'archived'
                              ? 'text-[#888] hover:bg-[#1a1a1a]/40'
                              : 'text-[#ccc] hover:bg-[#1a1a1a]/60'
                          }`}
                          onClick={() => {
                            if (editingThreadId !== thread.id) {
                              setActiveThread(thread.id);
                            }
                          }}
                        >
                          {thread.archived ? (
                            <Archive size={14} className="shrink-0 mr-2.5 text-[#555]" />
                          ) : (
                            <MessageCircle
                              size={14}
                              className={`shrink-0 mr-2.5 ${
                                activeThread === thread.id ? 'text-[#c8a55a]' : 'text-[#555]'
                              }`}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            {editingThreadId === thread.id ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') renameThread(thread.id, editTitle);
                                    if (e.key === 'Escape') setEditingThreadId(null);
                                  }}
                                  className="flex-1 bg-[#000] border border-[#c8a55a] rounded px-2 py-0.5 text-base sm:text-xs text-white focus:outline-none"
                                  maxLength={100}
                                />
                                <button
                                  onClick={() => renameThread(thread.id, editTitle)}
                                  className="text-[#c8a55a] hover:text-[#d4b468] p-0.5"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => setEditingThreadId(null)}
                                  className="text-[#666] hover:text-white p-0.5"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className={`text-sm truncate leading-tight ${thread.archived ? 'italic opacity-70' : ''}`}>
                                  {thread.title}
                                </p>
                                <p className="text-[10px] text-[#555] mt-0.5">
                                  {getRelativeDate(thread.updatedAt)}
                                </p>
                              </>
                            )}
                          </div>
                          {/* Context menu trigger (⋯) */}
                          {editingThreadId !== thread.id && (
                            <button
                              onClick={(e) => handleContextMenu(e, thread.id)}
                              className="text-[#444] hover:text-[#c8a55a] p-1 rounded transition-all opacity-0 group-hover:opacity-100 ml-1"
                              title="Más opciones"
                            >
                              <MoreVertical size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Premium history gate at bottom of sidebar */}
            {!isPremium && tab === 'active' && activeThreads.length > 3 && (
              <PremiumHistoryGate isPremium={isPremium} label="historial completo de conversaciones" />
            )}

            {/* Empty state: active tab */}
            {tab === 'active' && activeThreads.length === 0 && (
              <div className="text-center py-12 animate-in">
                <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                  <Inbox size={24} className="text-[#444]" />
                </div>
                <p className="text-[#555] text-sm font-medium mb-1">Sin conversaciones</p>
                <p className="text-[#444] text-xs">Crea una nueva para empezar</p>
              </div>
            )}

            {/* Empty state: archived tab */}
            {tab === 'archived' && archivedThreads.length === 0 && (
              <div className="text-center py-12 animate-in">
                <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                  <MessageSquareOff size={24} className="text-[#444]" />
                </div>
                <p className="text-[#555] text-sm font-medium mb-1">Sin archivadas</p>
                <p className="text-[#444] text-xs">Las conversaciones archivadas aparecerán aquí</p>
              </div>
            )}
          </div>

          {/* Message counter for FREE users — elegant bottom bar */}
          {!isPremium && remaining !== null && (
            <div className="p-3 border-t border-[#1a1a1a]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#666] flex items-center gap-1.5">
                  <Zap size={10} />
                  Mensajes hoy
                </span>
                <span className={`font-semibold ${
                  remaining === 0 ? 'text-red-400' :
                  remaining <= 3 ? 'text-[#e8a849]' :
                  'text-[#c8a55a]'
                }`}>
                  {remaining}/{dailyLimit}
                </span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.max((remaining / dailyLimit) * 100, 0)}%`,
                    backgroundColor: getProgressColor(remaining, dailyLimit),
                  }}
                />
              </div>
              {remaining <= 3 && remaining > 0 && (
                <p className="text-[10px] text-[#e8a849] mt-1.5 flex items-center gap-1">
                  <Crown size={10} />
                  Premium sin límites
                </p>
              )}
              {remaining === 0 && (
                <button
                  onClick={() => setShowLimitModal(true)}
                  className="w-full mt-2 text-[10px] text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 rounded-lg py-1.5 hover:bg-[#c8a55a]/15 transition-colors flex items-center justify-center gap-1"
                >
                  <Crown size={10} />
                  Desbloquear mensajes ilimitados
                </button>
              )}
            </div>
          )}

          {/* Premium contextual memory indicator in sidebar */}
          {isPremium && (
            <div className="p-3 border-t border-[#1a1a1a]">
              <div className="flex items-center gap-2 text-[10px] text-[#c8a55a]/70">
                <BrainCircuit size={12} className="shrink-0" />
                <span>Memoria contextual avanzada</span>
              </div>
            </div>
          )}
        </div>

        {/* ────────── Context Menu ────────── */}
        {contextMenu && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            {/* Menu */}
            <div
              className="fixed z-50 bg-[#111] border border-[#2a2a2a] rounded-xl py-1.5 shadow-2xl shadow-black/60 min-w-[180px] animate-in context-menu"
              style={{
                top: Math.min(contextMenu.y + 50, window.innerHeight - 200),
                left: Math.max(8, Math.min(contextMenu.x + 16, window.innerWidth - 200)),
              }}
            >
              {/* Find the thread to check archived status */}
              {(() => {
                const thread = threads.find(t => t.id === contextMenu.threadId);
                if (!thread) return null;
                return (
                  <>
                    {/* Rename */}
                    <button
                      onClick={() => {
                        setEditingThreadId(thread.id);
                        setEditTitle(thread.title);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-white transition-colors"
                    >
                      <Pencil size={14} className="text-[#666]" />
                      Renombrar
                    </button>

                    {/* Archive / Unarchive */}
                    {thread.archived ? (
                      <button
                        onClick={() => {
                          unarchiveThread(thread.id);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-[#c8a55a] transition-colors"
                      >
                        <ArchiveRestore size={14} className="text-[#666]" />
                        Restaurar
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          archiveThread(thread.id);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-[#c8a55a] transition-colors"
                      >
                        <Archive size={14} className="text-[#666]" />
                        Archivar
                      </button>
                    )}

                    {/* Divider */}
                    <div className="my-1.5 border-t border-[#1a1a1a]" />

                    {/* Delete */}
                    <button
                      onClick={() => {
                        setDeleteConfirm(thread.id);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} className="text-[#666]" />
                      Eliminar
                    </button>
                  </>
                );
              })()}
            </div>
          </>
        )}

        {/* ────────── Delete Confirmation Modal ────────── */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
            <div className="modal-content-destructive p-8 max-w-sm w-full text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Eliminar conversación</h3>
              <p className="text-[#999] mb-6 text-sm leading-relaxed">
                Esta acción eliminará la conversación y todos sus mensajes de forma permanente. No se puede deshacer.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => deleteThread(deleteConfirm)}
                  className="bg-red-500/90 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-red-500 transition-colors text-sm"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="text-[#999] px-5 py-2.5 hover:text-white transition-colors text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ────────── Mobile Thread Picker — now above chat area ────────── */}
        <div className="sm:hidden shrink-0 px-2 py-1.5 flex items-center gap-2 border-b border-[#1a1a1a] bg-[#0a0a0a]">
          <select
            value={activeThread || ''}
            onChange={(e) => setActiveThread(e.target.value)}
            className="flex-1 bg-[#000] border border-[#1a1a1a] rounded-lg px-3 py-2 text-sm text-white appearance-none focus:border-[#c8a55a] focus:outline-none"
          >
            {activeThreads.length === 0 && (
              <option value="">Sin conversaciones</option>
            )}
            {activeThreads.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <button
            onClick={createThread}
            className="shrink-0 flex items-center justify-center w-10 h-10 bg-[#c8a55a] text-black font-semibold rounded-lg text-sm touch-press"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* ────────── Chat Area — full flex column ────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden sm:bg-[#0a0a0a] sm:border sm:border-[#1a1a1a] sm:rounded-xl">
          {activeThread ? (
            <>
              {/* Chat header bar — compact on mobile */}
              <div className="px-3 py-2 sm:px-5 sm:py-3 border-b border-[#1a1a1a] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle size={14} className="text-[#c8a55a] shrink-0" />
                  <p className="text-sm text-white truncate">
                    {activeThreadData?.title || 'Conversación'}
                  </p>
                  {activeThreadData?.archived && (
                    <span className="shrink-0 text-[10px] bg-[#c8a55a]/10 text-[#c8a55a] px-2 py-0.5 rounded-full border border-[#c8a55a]/20">
                      Archivada
                    </span>
                  )}
                </div>
                {/* Contextual indicator */}
                {isContextual && (
                  <div className="relative shrink-0">
                    <button
                      onMouseEnter={() => setShowContextTooltip(true)}
                      onMouseLeave={() => setShowContextTooltip(false)}
                      className={`flex items-center gap-1.5 text-[10px] transition-colors px-2 py-1 rounded-full border ${
                        isPremium
                          ? 'text-[#c8a55a]/80 hover:text-[#c8a55a] border-[#c8a55a]/20 hover:border-[#c8a55a]/40'
                          : 'text-[#c8a55a]/60 hover:text-[#c8a55a] border-[#c8a55a]/15 hover:border-[#c8a55a]/30'
                      }`}
                    >
                      <BrainCircuit size={12} className="shrink-0" />
                      <span className="hidden sm:inline">
                        {isPremium ? 'Contexto avanzado' : 'Contextual activo'}
                      </span>
                    </button>
                    {/* Tooltip */}
                    {showContextTooltip && (
                      <div className="absolute right-0 top-full mt-2 w-60 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 shadow-xl context-menu z-10">
                        <p className="text-[11px] text-[#999] leading-relaxed">
                          {isPremium
                            ? 'El mentor usa tu actividad, emociones y conversaciones previas para ofrecerte respuestas profundas y personalizadas.'
                            : 'El mentor usa tu actividad reciente para personalizar respuestas.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Messages — single scroll container with overscroll containment */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4 overscroll-contain scroll-smooth">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center animate-in">
                      <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
                        <IconComponent size={32} className="text-[#c8a55a]" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Tu Mentor IA</h3>
                      <p className="text-[#999] text-sm max-w-sm mx-auto leading-relaxed">
                        {isPremium
                          ? 'Tu mentor experto con memoria avanzada. Pregúntame lo que necesites.'
                          : 'Tu asistente de bienestar. Pregúntame sobre hábitos y bienestar.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {[
                          '¿Cómo mejorar mi disciplina?',
                          'Crear nuevos hábitos',
                          'Necesito motivación',
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => {
                              setInput(suggestion);
                              setTimeout(() => chatInputRef.current?.focus(), 50);
                            }}
                            className="text-xs text-[#999] bg-[#1a1a1a] border border-[#222] px-3 py-1.5 rounded-full hover:border-[#c8a55a]/30 hover:text-[#c8a55a] transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                      {!isPremium && (
                        <p className="text-[10px] text-[#555] mt-4 flex items-center justify-center gap-1">
                          <Crown size={9} className="text-[#c8a55a]/40" />
                          Premium: memoria avanzada y contexto personalizado
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}
                    style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 ${
                        msg.role === 'user'
                          ? 'bg-[#c8a55a]/10 border border-[#c8a55a]/20 rounded-br-md'
                          : isPremium
                          ? 'bg-[#080808] border border-[#c8a55a]/10 rounded-bl-md'
                          : 'bg-[#000000] border border-[#1a1a1a] rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm sm:text-sm text-white whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start animate-in">
                    <div className={`border rounded-2xl rounded-bl-md p-4 ${
                      isPremium ? 'bg-[#080808] border-[#c8a55a]/10' : 'bg-[#000000] border-[#1a1a1a]'
                    }`}>
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area — safe-area for iPhone home indicator */}
              <div className="p-3 sm:p-4 border-t border-[#1a1a1a] shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {/* Low message warning */}
                {!isPremium && remaining !== null && remaining <= 3 && remaining > 0 && (
                  <div className="mb-2 flex items-center gap-2 text-[10px] text-[#e8a849] bg-[#e8a849]/5 border border-[#e8a849]/10 rounded-lg px-3 py-1.5">
                    <Zap size={10} className="shrink-0" />
                    <span>Te quedan {remaining} mensaje{remaining !== 1 ? 's' : ''} hoy</span>
                    <button
                      onClick={() => setShowLimitModal(true)}
                      className="ml-auto text-[#c8a55a] hover:text-[#d4b468] flex items-center gap-1"
                    >
                      <Crown size={10} />
                      Premium
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    enterKeyHint="send"
                    autoComplete="off"
                    placeholder={
                      activeThreadData?.archived
                        ? 'Conversación archivada'
                        : !isPremium && remaining === 0
                        ? 'Límite diario alcanzado'
                        : 'Escribe tu mensaje...'
                    }
                    className={`flex-1 bg-[#000000] border rounded-xl px-4 py-3 text-white text-base sm:text-sm placeholder-[#555] transition-colors ${
                      activeThreadData?.archived
                        ? 'border-[#333] cursor-not-allowed opacity-40'
                        : !isPremium && remaining === 0
                        ? 'border-[#ef4444]/30 cursor-not-allowed opacity-50'
                        : 'border-[#1a1a1a] focus:border-[#c8a55a] focus:outline-none'
                    }`}
                    disabled={sending || (!isPremium && remaining === 0) || !!activeThreadData?.archived}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim() || (!isPremium && remaining === 0) || !!activeThreadData?.archived}
                    className="bg-[#c8a55a] text-black font-semibold w-12 h-12 sm:w-auto sm:h-auto sm:px-5 sm:py-3 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center touch-press"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center animate-in px-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
                  <IconComponent size={28} className="text-[#c8a55a] sm:size-8" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Mentor IA</h3>
                <p className="text-[#999] text-sm mb-4">Crea una conversación para comenzar</p>
                <button
                  onClick={createThread}
                  className="inline-flex items-center gap-2 bg-[#c8a55a] text-black font-semibold px-5 py-3 rounded-xl hover:bg-[#d4b468] transition-colors text-sm touch-press"
                >
                  <Plus size={16} /> Nueva conversación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action error toast — auto-dismisses */}
      {actionError && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-[#c8a55a]/20 text-[#c8a55a] text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in"
          onClick={() => setActionError('')}
        >
          {actionError}
        </div>
      )}

      {/* ────────── Premium Limit Modal ────────── */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 premium-modal-backdrop">
          <div className="premium-modal bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-2xl max-w-md w-full overflow-hidden context-menu">
            {/* Gradient top accent */}
            <div className="h-1 bg-gradient-to-r from-[#c8a55a]/0 via-[#c8a55a] to-[#c8a55a]/0" />

            <div className="p-8 text-center">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 border border-[#c8a55a]/20 flex items-center justify-center mx-auto mb-5">
                <Crown size={28} className="text-[#c8a55a]" />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                Has alcanzado el límite diario
              </h3>
              <p className="text-[#999] mb-6 text-sm leading-relaxed">
                Tu plan Free incluye {dailyLimit} mensajes diarios con el Mentor IA. Con Premium, disfrutarás de una experiencia sin límites y mucho más personal.
              </p>

              {/* Benefits grid */}
              <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <MessageCircle size={16} className="text-[#c8a55a] mb-2" />
                  <p className="text-xs text-white font-medium mb-0.5">Mensajes ilimitados</p>
                  <p className="text-[10px] text-[#666]">Conversaciones sin límite diario</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <BrainCircuit size={16} className="text-[#c8a55a] mb-2" />
                  <p className="text-xs text-white font-medium mb-0.5">Memoria avanzada</p>
                  <p className="text-[10px] text-[#666]">Mentor que recuerda tu progreso</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <BookOpen size={16} className="text-[#c8a55a] mb-2" />
                  <p className="text-xs text-white font-medium mb-0.5">Historial completo</p>
                  <p className="text-[10px] text-[#666]">Acceso a todas tus conversaciones</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <Lightbulb size={16} className="text-[#c8a55a] mb-2" />
                  <p className="text-xs text-white font-medium mb-0.5">Insights inteligentes</p>
                  <p className="text-[10px] text-[#666]">Respuestas más profundas y útiles</p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="space-y-3">
                <Link
                  href="/pricing"
                  className="block w-full bg-[#c8a55a] text-black font-semibold py-3.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm text-center"
                  onClick={() => setShowLimitModal(false)}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Crown size={16} />
                    Mejorar a Premium
                  </span>
                </Link>
                <button
                  onClick={() => setShowLimitModal(false)}
                  className="w-full text-[#666] py-2.5 hover:text-[#999] transition-colors text-sm"
                >
                  Continuar con el plan Free
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
