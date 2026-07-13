'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
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
  Circle,
  Zap,
  Infinity as InfinityIcon,
  ShieldCheck,
  BookOpen,
  Lightbulb,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import ContextualHelp from '@/components/ui/ContextualHelp';
import PremiumGate, { PremiumHistoryGate, PremiumInlineBadge } from '@/components/ui/PremiumGate';
import { getMadridDateKey, getTodayDateKey } from '@/lib/deterministic';

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
// Suggestion pool — reuses real strings from the project
// (3 existing mentor starters + 8 onboarding goals)
// ─────────────────────────────────────────

const MENTOR_SUGGESTIONS = [
  '¿Cómo mejorar mi disciplina?',
  'Crear nuevos hábitos',
  'Necesito motivación',
  'Reducir el estrés',
  'Dormir mejor',
  'Ser más constante',
  'Mejorar mi enfoque',
  'Cuidar mi cuerpo',
  'Organizar mis finanzas',
  'Meditar regularmente',
  'Escribir un diario',
];

function pickSuggestions(count: number): string[] {
  const shuffled = [...MENTOR_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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

  // Calendar-day difference using Madrid-normalized dates
  const entryKey = getMadridDateKey(date);
  const todayKey = getTodayDateKey();
  const [eY, eM, eD] = entryKey.split('-').map(Number);
  const [tY, tM, tD] = todayKey.split('-').map(Number);
  const entryDate = new Date(eY, eM - 1, eD);
  const todayDate = new Date(tY, tM - 1, tD);
  const diffDays = Math.round((todayDate.getTime() - entryDate.getTime()) / 86400000);

  if (diffMins < 1 && diffDays === 0) return 'Ahora';
  if (diffMins < 60 && diffDays === 0) return `Hace ${diffMins} min`;
  if (diffHours < 24 && diffDays === 0) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  return entryDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function getDateGroup(dateStr: string): string {
  // Calendar-day difference using Madrid-normalized dates
  const entryKey = getMadridDateKey(new Date(dateStr));
  const todayKey = getTodayDateKey();

  if (entryKey === todayKey) return 'Hoy';

  const [eY, eM, eD] = entryKey.split('-').map(Number);
  const [tY, tM, tD] = todayKey.split('-').map(Number);
  const entryDate = new Date(eY, eM - 1, eD);
  const todayDate = new Date(tY, tM - 1, tD);
  const diffDays = Math.round((todayDate.getTime() - entryDate.getTime()) / 86400000);

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

const STORAGE_KEY_PREFIX = 'vitazen_active_thread';
const VISIBILITY_DEBOUNCE_MS = 1500;
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
  const { displayUser } = useScreenshotMode();
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
  const [suggestions] = useState(() => pickSuggestions(3));
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [historyLimited, setHistoryLimited] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');

  // Tab: 'active' | 'archived'
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  // Mobile drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  const prevUserIdRef = useRef<string | null>(null);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPremium = displayUser?.plan === 'PREMIUM';

  // User-scoped storage key: prevents cross-user thread leaks on shared devices
  const storageKey = user?.id ? `${STORAGE_KEY_PREFIX}_${user.id}` : STORAGE_KEY_PREFIX;

  // ─────────────────────────────────────────
  // Data fetching (MUST be defined BEFORE useEffect hooks that reference them)
  // ─────────────────────────────────────────
  // NOTE: useCallback hooks must be defined BEFORE useEffect hooks that
  // reference them in dependency arrays. Otherwise, the dependency array
  // evaluates the const variable before it's initialized → TDZ crash:
  //   "Cannot access 'eB' before initialization"

  const fetchThreads = useCallback(async (isRetry = false) => {
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
        // Clear stale localStorage if no threads exist
        if (allThreads.length === 0) {
          try { localStorage.removeItem(storageKey); } catch {}
        }
      } else if (!isRetry) {
        // Auto-retry once on server error (transient failures)
        await new Promise(r => setTimeout(r, 1000));
        return fetchThreads(true);
      }
    } catch (e) { 
      console.error(e); 
      if (!isRetry) {
        // Auto-retry once on network error
        await new Promise(r => setTimeout(r, 1500));
        try {
          const res = await apiFetch('/api/ai/threads');
          if (res.ok) {
            const data = await res.json();
            setThreads(data.threads);
            setHistoryLimited(!!data.historyLimited);
            if (data.remaining !== undefined && data.remaining !== null) {
              setRemaining(data.remaining);
              setDailyLimit(data.limit || 15);
            }

            setLoadError(false);
            setLoading(false);
            return;
          }
        } catch {}
      }
      setLoadError(true);
    }
    finally { setLoading(false); }
  }, [apiFetch, storageKey]);

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
  // Effects (defined AFTER useCallback hooks that they reference)
  // ─────────────────────────────────────────

  // Lock body scroll when any modal (delete confirm or limit modal) is open — save/restore scroll position
  useEffect(() => {
    if (deleteConfirm || showLimitModal || drawerOpen) {
      document.body.classList.add('scroll-locked');
      return () => {
        document.body.classList.remove('scroll-locked');
      };
    }
  }, [deleteConfirm, showLimitModal, drawerOpen]);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  // Initial thread fetch
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Detect user change and clean up stale state
  useEffect(() => {
    if (user?.id && user.id !== prevUserIdRef.current) {
      // User changed (login/logout/different account) — clear stale thread state
      if (prevUserIdRef.current) {
        setActiveThread(null);
        setMessages([]);
        setThreads([]);
      }
      prevUserIdRef.current = user.id;
    }
  }, [user?.id]);

  // Fetch messages when active thread changes
  useEffect(() => {
    activeThreadRef.current = activeThread;
    if (activeThread) {
      setMessages([]); // Clear immediately to avoid flash of old messages
      setLoadError(false); // Clear any previous load error when switching threads
      fetchMessages(activeThread);
      try { localStorage.setItem(storageKey, activeThread); } catch {}
      // Close drawer on mobile when selecting a thread
      setDrawerOpen(false);
    }
  }, [activeThread, fetchMessages, storageKey]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages]);

  // Focus edit input when editing
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

  // Refresh data when app comes back to foreground (mobile resume)
  // Debounced to prevent race conditions from rapid visibility changes
  // M-4 FIX: Skip the messages refetch if a message is currently in flight
  // (sendingRef.current = true). Previously, the visibilitychange handler
  // could overwrite the optimistic user message that hasn't been saved to
  // the DB yet (messages are saved atomically with the assistant response
  // AFTER Groq returns). Now we only refetch threads (which is safe) and
  // skip fetchMessages when sending. We also check activeThreadRef.current
  // to ensure we only refetch for the thread that's still active when the
  // debounce fires — the user may have switched threads during the 1.5s delay.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeThread) {
        // Clear any pending refresh from previous visibility change
        if (visibilityTimerRef.current) {
          clearTimeout(visibilityTimerRef.current);
        }
        // Debounce the refresh to avoid rapid re-fetches
        visibilityTimerRef.current = setTimeout(() => {
          // M-4 FIX: Only fetch messages if no message is in flight AND
          // the active thread hasn't changed during the debounce delay.
          if (!sendingRef.current && activeThreadRef.current === activeThread) {
            fetchMessages(activeThread);
          }
          fetchThreads();
        }, VISIBILITY_DEBOUNCE_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
      }
    };
  }, [activeThread, fetchMessages, fetchThreads]);

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
        setDrawerOpen(false);
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
        // M-3 FIX: Calculate nextActiveId from the CURRENT threads state
        // BEFORE calling setThreads. Previously, nextActiveId was assigned
        // inside the setThreads updater as a side effect, but React 19's
        // automatic batching defers updater execution — the variable was
        // read as null before the updater ran.
        const remaining = threads.filter(t => t.id !== threadId);
        const nextActiveId = remaining.filter(t => !t.archived)[0]?.id ?? null;
        setThreads(remaining);
        if (activeThread === threadId) {
          setActiveThread(nextActiveId);
          setMessages([]);
          try { localStorage.removeItem(storageKey); } catch {}
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
        // M-3 FIX: Calculate nextActiveId from the CURRENT threads state
        // BEFORE calling setThreads. Same fix as deleteThread.
        const updated = threads.map(t => t.id === threadId ? { ...t, archived: true } : t);
        const nextActiveId = updated.filter(t => !t.archived)[0]?.id ?? null;
        setThreads(updated);
        // If the archived thread was active, switch to the next active one
        if (activeThread === threadId) {
          if (nextActiveId) {
            setActiveThread(nextActiveId);
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
        // L-4 FIX: Restore the input text so the user doesn't lose their message.
        // Previously the input was cleared (line 547) and never restored on 403.
        setInput(content);
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
  // Shared: Sidebar content (used in desktop sidebar & mobile drawer)
  // ─────────────────────────────────────────

  const sidebarContent = (
    <>
      {/* Back + New button */}
      <div className="p-3 border-b border-[#1a1a1a] space-y-2">
        <Link
          href={backHref}
          className="text-[#666] text-xs hover:text-champagne flex items-center gap-1 transition-colors"
        >
          <ChevronLeft size={12} /> Volver
        </Link>
        <button
          onClick={createThread}
          className="w-full flex items-center justify-center gap-2 bg-champagne text-black font-semibold py-2.5 rounded-lg hover:bg-champagne-hover transition-colors text-sm"
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
              ? 'text-champagne'
              : 'text-[#666] hover:text-[#999]'
          }`}
        >
          Todas
          {activeThreads.length > 0 && (
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === 'active' ? 'bg-champagne/20 text-champagne' : 'bg-[#1a1a1a] text-[#555]'
            }`}>
              {activeThreads.length}
            </span>
          )}
          {tab === 'active' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-champagne rounded-full" />
          )}
        </button>
        <button
          onClick={() => setTab('archived')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
            tab === 'archived'
              ? 'text-champagne'
              : 'text-[#666] hover:text-[#999]'
          }`}
        >
          Archivadas
          {archivedThreads.length > 0 && (
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === 'archived' ? 'bg-champagne/20 text-champagne' : 'bg-[#1a1a1a] text-[#555]'
            }`}>
              {archivedThreads.length}
            </span>
          )}
          {tab === 'archived' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-champagne rounded-full" />
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
            <div key={group}>
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
                          <p className="text-sm truncate leading-tight">{thread.title.replace(/[*#_`~]/g, '')}</p>
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
                          ? 'bg-champagne/10 text-champagne'
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
                            activeThread === thread.id ? 'text-champagne' : 'text-[#555]'
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
                              className="flex-1 bg-[#000] border border-champagne rounded px-2 py-0.5 text-base sm:text-xs text-white focus:outline-none"
                              maxLength={100}
                            />
                            <button
                              onClick={() => renameThread(thread.id, editTitle)}
                              className="text-champagne hover:text-champagne-hover p-0.5"
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
                              {thread.title.replace(/[*#_`~]/g, '')}
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
                          className="text-[#444] hover:text-champagne p-1 rounded transition-all opacity-60 group-hover:opacity-100 ml-1"
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
              remaining <= 3 ? 'text-champagne-warm' :
              'text-champagne'
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
            <p className="text-[10px] text-champagne-warm mt-1.5 flex items-center gap-1">
              <Circle size={3} fill="currentColor" className="text-champagne/40" />
              Más conexiones con Élite
            </p>
          )}
          {remaining === 0 && (
            <button
              onClick={() => setShowLimitModal(true)}
              className="w-full mt-2 text-[10px] text-champagne bg-champagne/10 border border-champagne/20 rounded-lg py-1.5 hover:bg-champagne/15 transition-colors flex items-center justify-center gap-1"
            >
              <Circle size={3} fill="currentColor" className="text-champagne/40" />
              Conversaciones sin límite
            </button>
          )}
        </div>
      )}

      {/* Premium contextual memory indicator in sidebar */}
      {isPremium && (
        <div className="p-3 border-t border-[#1a1a1a]">
          <div className="flex items-center gap-2 text-[10px] text-champagne/70">
            <BrainCircuit size={12} className="shrink-0" />
            <span>Memoria contextual profunda</span>
          </div>
        </div>
      )}
    </>
  );

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
    <div className="mentor-full-viewport sm:relative sm:inset-auto sm:z-auto sm:h-auto flex flex-col overflow-hidden sm:max-w-6xl sm:mx-auto sm:flex-1 sm:min-h-0">
      {/* Offline indicator — subtle top banner */}
      {isOffline && (
        <div className="px-3 py-1.5 bg-champagne-warm/10 border-b border-champagne-warm/20 text-champagne-warm text-xs text-center shrink-0">
          Sin conexión — los mensajes se enviarán cuando vuelva la red
        </div>
      )}

      {/* ═══════════════════════════════════════════
          MOBILE LAYOUT: Single panel, full viewport
          ═══════════════════════════════════════════ */}

      {/* Mobile header — ultra compact */}
      <div className="flex sm:hidden items-center justify-between px-3 py-2 border-b border-[#1a1a1a] shrink-0 bg-[#0a0a0a]">
        <div className="flex items-center gap-2 min-w-0">
          <Link href={backHref} className="p-1.5 -ml-1 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors shrink-0">
            <ChevronLeft size={20} />
          </Link>
          <IconComponent size={16} className="text-champagne shrink-0" />
          <p className="text-sm font-semibold text-white truncate">
            {activeThreadData?.title?.replace(/[*#_`~]/g, '') || 'Mentor IA'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Message counter pill — mobile compact */}
          {!isPremium && remaining !== null && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              remaining <= 3 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#1a1a1a] text-champagne border border-[#2a2a2a]'
            }`}>
              {remaining}
            </span>
          )}
          {isPremium && (
            <InfinityIcon size={14} className="text-champagne" />
          )}
          {/* Drawer toggle */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          DESKTOP LAYOUT: Header + sidebar + chat
          ═══════════════════════════════════════════ */}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-champagne/10 flex items-center justify-center">
            <IconComponent size={28} className="text-champagne" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Mentor IA</h1>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-champagne/50 px-2 py-0.5">
                  <Circle size={3} fill="currentColor" className="text-champagne/40" />
                  Élite
                </span>
              )}
            </div>
            <p className="text-[#999] text-sm">
              {isPremium
                ? 'Tu mentor con memoria profunda'
                : 'Tu guía de desarrollo personal'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPremium && remaining !== null && (
            <div className="message-counter-pill flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]">
              <Zap size={12} className={remaining <= 3 ? 'text-red-400' : 'text-champagne'} />
              <span className={remaining <= 3 ? 'text-red-400' : 'text-champagne'}>
                {remaining}/{dailyLimit}
              </span>
            </div>
          )}
          {isPremium && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-champagne/5 border border-champagne/15">
              <InfinityIcon size={12} className="text-champagne" />
              <span className="text-champagne">Sin límite</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            title={sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Contextual Help — desktop only */}
      <div className="hidden sm:block">
        <ContextualHelp
          storageKey="vitazen_help_mentor"
          title="Mentor IA"
          text="Escribe tu pregunta y el mentor te responderá. Crea nuevas conversaciones, renómbralas o archívalas desde el menú lateral."
        />
      </div>

      {/* ═══════════════════════════════════════════
          MAIN CONTENT AREA
          Mobile: only chat (full width)
          Desktop: sidebar + chat (flex-row)
          ═══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden sm:gap-4">

        {/* ────────── Desktop Sidebar ────────── */}
        <div
          className={`hidden sm:flex shrink-0 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex-col transition-all duration-300 ease-in-out overflow-hidden relative sidebar-area ${
            sidebarOpen ? 'w-72' : 'w-0 border-0'
          }`}
        >
          {sidebarContent}
        </div>

        {/* ────────── Chat Area — full width on both mobile and desktop ────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden sm:bg-[#0a0a0a] sm:border sm:border-[#1a1a1a] sm:rounded-xl">
          {activeThread ? (
            <>
              {/* Desktop: Chat header bar inside chat card */}
              <div className="hidden sm:flex px-5 py-3 border-b border-[#1a1a1a] items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle size={14} className="text-champagne shrink-0" />
                  <p className="text-sm text-white truncate">
                    {activeThreadData?.title?.replace(/[*#_`~]/g, '') || 'Conversación'}
                  </p>
                  {activeThreadData?.archived && (
                    <span className="shrink-0 text-[10px] bg-champagne/10 text-champagne px-2 py-0.5 rounded-full border border-champagne/20">
                      Archivada
                    </span>
                  )}
                </div>
                {/* Contextual indicator — desktop only */}
                {isContextual && (
                  <div className="relative shrink-0">
                    <button
                      onMouseEnter={() => setShowContextTooltip(true)}
                      onMouseLeave={() => setShowContextTooltip(false)}
                      className={`flex items-center gap-1.5 text-[10px] transition-colors px-2 py-1 rounded-full border ${
                        isPremium
                          ? 'text-champagne/80 hover:text-champagne border-champagne/20 hover:border-champagne/40'
                          : 'text-champagne/60 hover:text-champagne border-champagne/15 hover:border-champagne/30'
                      }`}
                    >
                      <BrainCircuit size={12} className="shrink-0" />
                      <span>
                        {isPremium ? 'Memoria contextual' : 'Contexto activo'}
                      </span>
                    </button>
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
                      <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center mx-auto mb-4">
                        <IconComponent size={32} className="text-champagne" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Tu Mentor IA</h3>
                      <p className="text-[#999] text-sm max-w-sm mx-auto leading-relaxed">
                        {isPremium
                          ? 'Tu mentor con memoria profunda. Pregúntame lo que necesites.'
                          : 'Tu asistente de bienestar. Pregúntame sobre hábitos y bienestar.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => {
                              setInput(suggestion);
                              setTimeout(() => chatInputRef.current?.focus(), 50);
                            }}
                            className="text-xs text-[#999] bg-[#1a1a1a] border border-[#222] px-3 py-1.5 rounded-full hover:border-champagne/30 hover:text-champagne transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                      {!isPremium && (
                        <p className="text-[10px] text-[#555] mt-4 flex items-center justify-center gap-1">
                          <Circle size={3} fill="currentColor" className="text-champagne/30" />
                          El mentor recuerda más cuando profundizas
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
                          ? 'bg-champagne/10 border border-champagne/20 rounded-br-md'
                          : isPremium
                          ? 'bg-[#080808] border border-champagne/10 rounded-bl-md'
                          : 'bg-[#000000] border border-[#1a1a1a] rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm text-white whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start animate-in">
                    <div className={`border rounded-2xl rounded-bl-md p-4 ${
                      isPremium ? 'bg-[#080808] border-champagne/10' : 'bg-[#000000] border-[#1a1a1a]'
                    }`}>
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-champagne rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-champagne rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-champagne rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area — safe-area for iPhone home indicator */}
              <div className="p-3 sm:p-4 border-t border-[#1a1a1a] shrink-0 bg-[#0a0a0a] sm:bg-transparent" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {/* Low message warning */}
                {!isPremium && remaining !== null && remaining <= 3 && remaining > 0 && (
                  <div className="mb-2 flex items-center gap-2 text-[10px] text-champagne-warm bg-champagne-warm/5 border border-champagne-warm/10 rounded-lg px-3 py-1.5">
                    <Zap size={10} className="shrink-0" />
                    <span>Te quedan {remaining} mensaje{remaining !== 1 ? 's' : ''} hoy</span>
                    <button
                      onClick={() => setShowLimitModal(true)}
                      className="ml-auto text-champagne hover:text-champagne-hover flex items-center gap-1"
                    >
                      <Circle size={3} fill="currentColor" className="text-champagne/40" />
                      Conocer Élite
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
                        : 'border-[#1a1a1a] focus:border-champagne focus:outline-none'
                    }`}
                    disabled={sending || (!isPremium && remaining === 0) || !!activeThreadData?.archived}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim() || (!isPremium && remaining === 0) || !!activeThreadData?.archived}
                    className="bg-champagne text-black font-semibold w-12 h-12 sm:w-auto sm:h-auto sm:px-5 sm:py-3 rounded-xl hover:bg-champagne-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center touch-press"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* No active thread — empty state */
            <div className="flex items-center justify-center flex-1 min-h-0">
              <div className="text-center animate-in px-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-champagne/10 flex items-center justify-center mx-auto mb-4">
                  <IconComponent size={28} className="text-champagne sm:size-8" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Mentor IA</h3>
                <p className="text-[#999] text-sm mb-4">Crea una conversación para comenzar</p>
                <button
                  onClick={createThread}
                  className="inline-flex items-center gap-2 bg-champagne text-black font-semibold px-5 py-3 rounded-xl hover:bg-champagne-hover transition-colors text-sm touch-press"
                >
                  <Plus size={16} /> Nueva conversación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MOBILE DRAWER — slide-in conversations panel
          ═══════════════════════════════════════════ */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel — slides from left */}
          <div className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col sm:hidden animate-in drawer-enter sidebar-area">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
              <h2 className="text-sm font-semibold text-white">Conversaciones</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {/* Reuse sidebar content */}
            {sidebarContent}
          </div>
        </>
      )}

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
            {(() => {
              const thread = threads.find(t => t.id === contextMenu.threadId);
              if (!thread) return null;
              return (
                <>
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

                  {thread.archived ? (
                    <button
                      onClick={() => {
                        unarchiveThread(thread.id);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-champagne transition-colors"
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-champagne transition-colors"
                    >
                      <Archive size={14} className="text-[#666]" />
                      Archivar
                    </button>
                  )}

                  <div className="my-1.5 border-t border-[#1a1a1a]" />

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content-destructive p-8 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
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

      {/* Action error toast — auto-dismisses */}
      {actionError && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-champagne/20 text-champagne text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in"
          onClick={() => setActionError('')}
        >
          {actionError}
        </div>
      )}

      {/* ────────── Premium Limit Modal ────────── */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
          <div className="modal-content bg-[#0a0a0a] border border-champagne/20 rounded-2xl max-w-md w-full overflow-hidden context-menu">
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-champagne/8 flex items-center justify-center mx-auto mb-5">
                <Circle size={5} fill="currentColor" className="text-champagne/40" />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                Tu ritmo de hoy se ha completado
              </h3>
              <p className="text-[#999] mb-6 text-sm leading-relaxed">
                Has conversado lo que corresponde a hoy. Si quieres seguir profundizando, hay un camino.
              </p>

              <div className="space-y-3 mb-6 text-left">
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <p className="text-xs text-[#999] font-medium mb-0.5">Conversaciones sin límite diario</p>
                  <p className="text-[10px] text-[#555]">El mentor está cuando lo necesitas</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
                  <p className="text-xs text-[#999] font-medium mb-0.5">Memoria que acumula contexto</p>
                  <p className="text-[10px] text-[#555]">Cada conversación profundiza la anterior</p>
                </div>
              </div>

              <div className="space-y-3">
                <Link
                  href="/elite"
                  className="block w-full bg-champagne/10 border border-champagne/20 text-champagne font-medium py-3 rounded-xl hover:bg-champagne/15 transition-colors text-sm text-center"
                  onClick={() => setShowLimitModal(false)}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Circle size={4} fill="currentColor" />
                    Conocer Élite
                  </span>
                </Link>
                <button
                  onClick={() => setShowLimitModal(false)}
                  className="w-full text-[#666] py-2.5 hover:text-[#999] transition-colors text-sm"
                >
                  Volver mañana
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
