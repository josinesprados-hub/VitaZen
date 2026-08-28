'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { MentorSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import {
  Brain,
  MessageCircle,
  X,
  ChevronLeft,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  BrainCircuit,
  Circle,
  Zap,
  Infinity as InfinityIcon,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import ContextualHelp from '@/components/ui/ContextualHelp';
import { useDialogA11y } from '@/hooks/useDialogA11y';

// A-1: Extracted components
import type { Thread, Message, Favorite } from './MentorChatTypes';
import { STORAGE_KEY_PREFIX, VISIBILITY_DEBOUNCE_MS, getDateGroup } from './MentorChatTypes';
import ThreadSidebar from './ThreadSidebar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import DeleteConfirmModal from './DeleteConfirmModal';
import LimitModal from './LimitModal';
import ThreadContextMenu from './ThreadContextMenu';

// ─────────────────────────────────────────
// Component Props
// ─────────────────────────────────────────

interface MentorChatProps {
  backHref: string;
  headerIcon?: 'brain' | 'sparkles';
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
  const [dailyLimit, setDailyLimit] = useState<number>(10);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [historyLimited, setHistoryLimited] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');

  // BUG-04: Real thread counts from server (independent of pagination cap)
  const [totalActiveCount, setTotalActiveCount] = useState<number>(0);
  const [totalArchivedCount, setTotalArchivedCount] = useState<number>(0);

  // Tab: 'active' | 'archived' | 'favorites'
  const [tab, setTab] = useState<'active' | 'archived' | 'favorites'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

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

  // Debounce feedback state
  const [debounceBlocked, setDebounceBlocked] = useState(false);

  // M-3: Action-in-progress refs (prevent duplicate destructive requests)
  const deletingThreadRef = useRef<string | null>(null);
  const archivingThreadRef = useRef<string | null>(null);
  const renamingThreadRef = useRef<string | null>(null);

  // M-7: Timeout refs for cleanup on unmount
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NOTE: copiedId removed — B-3 FIX: copy state is now self-contained in MessageBubble

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const limitModalRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // M-06: Ref to the trigger button that opened the context menu (for focus restoration)
  const contextMenuTriggerRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useDialogA11y(drawerRef, drawerOpen, () => { setDrawerOpen(false); setContextMenu(null); });

  /** Sync textarea height with content (no-op if empty → collapses to 1 line) */
  const syncTextareaHeight = useCallback(() => {
    const ta = chatInputRef.current;
    if (!ta) return;
    if (!ta.value) {
      ta.style.height = 'auto';
      ta.style.overflowY = 'hidden';
      return;
    }
    const maxH = 10 * 24; // ~6-8 visible lines at leading-6 (24px)
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);
  const sendingRef = useRef(false);
  const activeThreadRef = useRef<string | null>(null);
  const fetchIdRef = useRef(0);
  const lastSendTime = useRef(0);
  const prevUserIdRef = useRef<string | null>(null);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // M-7: Cleanup all timeout refs on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const isPremium = displayUser?.plan === 'PREMIUM';

  // User-scoped storage key: prevents cross-user thread leaks on shared devices
  const storageKey = user?.id ? STORAGE_KEY_PREFIX + '_' + user.id : STORAGE_KEY_PREFIX;

  // ─────────────────────────────────────────
  // Data fetching (MUST be defined BEFORE useEffect hooks that reference them)
  // ─────────────────────────────────────────
  // NOTE: useCallback hooks must be defined BEFORE useEffect hooks that
  // reference them in dependency arrays. Otherwise, the dependency array
  // evaluates the const variable before it's initialized → TDZ crash:
  //   "Cannot access 'eB' before initialization"

  // M-6 FIX: Extracted thread data processing to eliminate duplication.
  // Both the initial fetch and the retry used identical 20-line blocks.
  const processThreadsData = useCallback((data: any, isInitialLoad: boolean) => {
    const allThreads: Thread[] = data.threads;
    setThreads(allThreads);
    // M-5 FIX: historyLimited set only here (single source of truth: threads API)
    setHistoryLimited(!!data.historyLimited);
    // BUG-04: Store real counts from server for tab badges
    if (data.totalActiveCount !== undefined) setTotalActiveCount(data.totalActiveCount);
    if (data.totalArchivedCount !== undefined) setTotalArchivedCount(data.totalArchivedCount);
    // Initialize remaining/limit from server if available
    if (data.remaining !== undefined && data.remaining !== null) {
      setRemaining(data.remaining);
      setDailyLimit(data.limit || 10);
    }
    // MENTOR-01: On initial load, do NOT auto-select any thread.
    // User always starts with a fresh empty conversation (ChatGPT pattern).
    // Previous conversations remain accessible from the sidebar.
    if (isInitialLoad && !activeThreadRef.current) {
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }, [storageKey]);

  const fetchThreads = useCallback(async (isRetry = false) => {
    try {
      const res = await apiFetch('/api/ai/threads');
      if (res.ok) {
        const data = await res.json();
        processThreadsData(data, !isRetry);
        return;
      }
      // M-4 FIX: Show error on non-retry server failure
      if (isRetry) {
        setLoadError(true);
        return;
      }
      // Auto-retry once on server error (transient failures)
      await new Promise(r => setTimeout(r, 1000));
      return fetchThreads(true);
    } catch (e) {
      console.error(e);
      if (isRetry) {
        // M-4: Final retry failed — user already sees loadError from the retry
        setLoadError(true);
        return;
      }
      // Auto-retry once on network error
      await new Promise(r => setTimeout(r, 1500));
      try {
        const res = await apiFetch('/api/ai/threads');
        if (res.ok) {
          const data = await res.json();
          processThreadsData(data, true);
          setLoadError(false);
          return;
        }
      } catch (retryErr) {
        // M-4 FIX: Log retry failure (user sees loadError state)
        console.error('Thread fetch retry failed:', retryErr);
      }
      setLoadError(true);
    }
    finally { setLoading(false); }
  }, [apiFetch, processThreadsData]);

  const fetchMessages = useCallback(async (threadId: string) => {
    const thisFetchId = ++fetchIdRef.current;
    try {
      const res = await apiFetch('/api/ai/threads/' + threadId + '/messages');
      // Only apply if this is still the latest fetch (prevents stale overwrites on rapid thread switching)
      // and no message is currently in flight (prevents overwriting the optimistic user message
      // that hasn't been saved to DB yet — the API saves both user + assistant atomically
      // AFTER Groq returns, so a fetch that started before the send will return stale data).
      if (res.ok && fetchIdRef.current === thisFetchId && !sendingRef.current) {
        const data = await res.json();
        setMessages(data.messages);
        // M-5 FIX: Removed setHistoryLimited here — single source is fetchThreads
      }
      // M-4 FIX: Silent is intentional — stale data is acceptable for background refresh
    } catch (e) { console.error(e); }
  }, [apiFetch]);

  // Fetch favorites when tab switches to 'favorites'
  // M-4: Silent catch is intentional — favorites are non-critical auxiliary data
  const fetchFavorites = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai/favorites');
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
        setFavoritesLoaded(true);
      }
    } catch (e) { console.error(e); }
  }, [apiFetch]);

  useEffect(() => {
    if (tab === 'favorites' && !favoritesLoaded) {
      fetchFavorites();
    }
  }, [tab, favoritesLoaded, fetchFavorites]);

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

  // A-2: Close modals and context menu on Escape key
  useEffect(() => {
    if (!deleteConfirm && !showLimitModal && !contextMenu && !drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) { setDeleteConfirm(null); return; }
      if (showLimitModal) { setShowLimitModal(false); return; }
      if (contextMenu) { setContextMenu(null); return; }
      if (drawerOpen) { setDrawerOpen(false); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deleteConfirm, showLimitModal, contextMenu, drawerOpen]);

  // A-2: Focus trap — return focus to the first focusable element inside the modal
  useEffect(() => {
    const container = deleteConfirm ? deleteModalRef.current : showLimitModal ? limitModalRef.current : null;
    if (!container) return;
    // Move focus to the first focusable element inside the modal
    const focusable = container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();
  }, [deleteConfirm, showLimitModal]);

  // NOTE: Context menu click-outside and keyboard nav effects
  // removed — now handled inside ThreadContextMenu component.

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

  // Auto-scroll to bottom on new messages — only if user is near bottom
  // (within 150px). Preserves scroll position when reading history.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
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
        // M-7 FIX: Store timeout ref for cleanup on unmount
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => chatInputRef.current?.focus(), 100);
      } else {
        const data = await res.json();
        if (data.error?.includes('Maximum')) {
          // MENTOR-01: Actionable error — tell user to delete first
          setActionError('Límite de 5 conversaciones. Elimina una para crear otra.');
        }
      }
    } catch (e) { console.error(e); setActionError('No se pudo crear la conversación'); }
  };

  const deleteThread = async (threadId: string) => {
    // M-3 FIX: Prevent duplicate delete requests
    if (deletingThreadRef.current === threadId) return;
    deletingThreadRef.current = threadId;
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'DELETE',
        body: JSON.stringify({ threadId }),
      });
      if (res.ok) {
        // MENTOR-01: Remove thread and go to empty state (ChatGPT pattern).
        // After deletion, user sees fresh conversation instead of auto-opening next.
        setThreads(prev => prev.filter(t => t.id !== threadId));
        if (activeThreadRef.current === threadId) {
          setActiveThread(null);
          setMessages([]);
          try { localStorage.removeItem(storageKey); } catch {}
        }
      } else {
        // M-4 FIX: Show error on non-OK response
        setActionError('No se pudo eliminar la conversación');
      }
    } catch (e) { console.error(e); setActionError('No se pudo eliminar'); }
    finally { setDeleteConfirm(null); deletingThreadRef.current = null; }
  };

  const archiveThread = async (threadId: string) => {
    // M-3 FIX: Prevent duplicate archive requests
    if (archivingThreadRef.current === threadId) return;
    archivingThreadRef.current = threadId;
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'PATCH',
        body: JSON.stringify({ threadId, archived: true }),
      });
      if (res.ok) {
        // C-4 FIX: Use functional updater to read the LATEST threads state.
        let nextActiveId: string | null = null;
        setThreads(prev => {
          const updated = prev.map(t => t.id === threadId ? { ...t, archived: true } : t);
          nextActiveId = updated.filter(t => !t.archived)[0]?.id ?? null;
          return updated;
        });
        // If the archived thread was active, switch to the next active one
        if (activeThreadRef.current === threadId) {
          if (nextActiveId) {
            setActiveThread(nextActiveId);
          } else {
            setActiveThread(null);
            setMessages([]);
          }
        }
      } else {
        // M-4 FIX: Show error on non-OK response
        setActionError('No se pudo archivar la conversación');
      }
    } catch (e) { console.error(e); setActionError('No se pudo archivar'); }
    finally { archivingThreadRef.current = null; }
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
    // M-3 FIX: Prevent duplicate rename requests
    if (renamingThreadRef.current === threadId) return;
    renamingThreadRef.current = threadId;
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'PATCH',
        body: JSON.stringify({ threadId, title: newTitle.trim() }),
      });
      if (res.ok) {
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle.trim() } : t));
      } else {
        // M-4 FIX: Show error on non-OK response
        setActionError('No se pudo renombrar');
      }
    } catch (e) { console.error(e); setActionError('No se pudo renombrar'); }
    finally { setEditingThreadId(null); renamingThreadRef.current = null; }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sendingRef.current) return;

    // MENTOR-01: Auto-create thread if none is active (ChatGPT pattern).
    // User can type in the empty state; a thread is created on first send.
    let targetThreadId = activeThread;
    if (!targetThreadId) {
      try {
        const res = await apiFetch('/api/ai/threads', {
          method: 'POST',
          body: JSON.stringify({ title: 'Nueva conversación' }),
        });
        if (res.ok) {
          const data = await res.json();
          targetThreadId = data.thread.id;
          setThreads(prev => [data.thread, ...prev]);
          setActiveThread(targetThreadId);
          setMessages([]);
          setTab('active');
          setDrawerOpen(false);
        } else {
          const data = await res.json();
          if (data.error?.includes('Maximum')) {
            // MENTOR-01: Actionable error — tell user to delete first
            setActionError('Límite de 5 conversaciones. Elimina una para crear otra.');
          }
          return;
        }
      } catch (e) {
        console.error(e);
        setActionError('No se pudo crear la conversación');
        return;
      }
    }

    const now = Date.now();
    if (now - lastSendTime.current < 1000) {
      // BUG-06: Show discrete feedback when blocked by debounce
      setDebounceBlocked(true);
      // M-7 FIX: Store timeout ref for cleanup on unmount
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => setDebounceBlocked(false), 800);
      return;
    }
    lastSendTime.current = now;

    const sentThreadId = targetThreadId;
    sendingRef.current = true;

    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    requestAnimationFrame(syncTextareaHeight);
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
        setDailyLimit(data.limit || 10);
        // Remove the optimistic user message since it was blocked
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        // L-4 FIX: Restore the input text so the user doesn't lose their message.
        setInput(content);
        requestAnimationFrame(syncTextareaHeight);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          id: data.messageId || 'resp-' + Date.now(),
          role: 'assistant',
          content: data.message,
          createdAt: new Date().toISOString(),
        };
        // Only add response if still on the same thread
        if (activeThreadRef.current === sentThreadId) {
          setMessages(prev => [...prev, assistantMessage]);
          setRemaining(data.remaining);
          setDailyLimit(data.limit || 10);
          setIsContextual(!!data.contextual);
        }

        // M-2 FIX: Refresh threads to get updated title and updatedAt.
        // Wrapped in own try/catch — a failure here MUST NOT remove
        // the message that was already sent successfully.
        try {
          const threadsRes = await apiFetch('/api/ai/threads');
          if (threadsRes.ok) {
            const threadsData = await threadsRes.json();
            setThreads(threadsData.threads);
          }
        } catch {
          // M-4: Silent — thread list refresh is non-critical after successful send
        }
      } else if (res.status !== 403) {
        // Non-403 error: remove optimistic message and show error
        if (activeThreadRef.current === sentThreadId) {
          setMessages(prev => prev.filter(m => m.id !== userMessage.id));
          setInput(content);
          requestAnimationFrame(syncTextareaHeight);
          setActionError('Error al enviar. Inténtalo de nuevo.');
        }
      }
    } catch (e) {
      console.error(e);
      // Remove optimistic user message on network error if still on same thread
      if (activeThreadRef.current === sentThreadId) {
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setInput(content); // Restore input so user can retry
        requestAnimationFrame(syncTextareaHeight);
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
  const searchedThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleThreads;
    return visibleThreads.filter(t => t.title.toLowerCase().includes(q));
  }, [visibleThreads, searchQuery]);

  // Group visible threads by date
  const groupedThreads = useMemo(() => searchedThreads.reduce<Record<string, Thread[]>>((acc, thread) => {
    const group = getDateGroup(thread.updatedAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(thread);
    return acc;
  }, {}), [searchedThreads]);

  const activeThreadData = useMemo(() => threads.find(t => t.id === activeThread) ?? null, [threads, activeThread]);

  const IconComponent = useMemo(() => headerIcon === 'brain' ? Brain : Sparkles, [headerIcon]);

  // B-3 FIX: Stable callback for favorite toggling — prevents MessageBubble re-render
  const handleToggleFavorite = useCallback((id: string, fav: boolean) => {
    setFavorites(prev => fav ? prev : prev.filter(f => f.id !== id));
    setFavoritesLoaded(false);
  }, []);

  // ─────────────────────────────────────────
  // Context menu handler
  // ─────────────────────────────────────────

  const handleContextMenu = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    e.preventDefault();
    // M-06: Capture trigger element for focus restoration
    contextMenuTriggerRef.current = e.currentTarget as HTMLElement;
    const rect = (e.currentTarget as HTMLElement).closest('.sidebar-area')?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;
    setContextMenu({ threadId, x, y });
  };

  // ─────────────────────────────────────────
  // Sidebar props — computed once per render
  // ─────────────────────────────────────────

  const sidebarProps = {
    backHref,
    tab,
    searchQuery,
    threads,
    activeThread,
    totalActiveCount,
    totalArchivedCount,
    isPremium,
    remaining,
    dailyLimit,
    editingThreadId,
    editTitle,
    activeThreads,
    archivedThreads,
    groupedThreads,
    searchedThreads,
    favorites,
    onCreateThread: createThread,
    onSelectThread: setActiveThread,
    onTabChange: setTab,
    onSearchChange: setSearchQuery,
    onContextMenu: handleContextMenu,
    onRenameThread: renameThread,
    onCancelEdit: () => setEditingThreadId(null),
    onEditTitleChange: setEditTitle,
    onSelectFavorite: (threadId: string, isArchived: boolean) => {
      setActiveThread(threadId);
      setTab(isArchived ? 'archived' : 'active');
      setDrawerOpen(false);
    },
    onShowLimitModal: () => setShowLimitModal(true),
    editInputRef,
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
    <div className="mentor-full-viewport safe-top sm:relative sm:inset-auto sm:z-auto sm:h-auto flex flex-col overflow-hidden sm:max-w-6xl sm:mx-auto sm:flex-1 sm:min-h-0">
      {/* Offline indicator — subtle top banner */}
      {isOffline && (
        <div className="px-3 py-1.5 bg-champagne-warm/10 border-b border-champagne-warm/20 text-champagne-warm text-xs text-center shrink-0">
          Sin conexión — verifica tu red para enviar mensajes
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
            {activeThreadData?.title || 'Mentor IA'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Message counter pill — mobile compact */}
          {!isPremium && remaining !== null && (
            <span className={"text-[10px] font-medium px-2 py-0.5 rounded-full " + (
              remaining <= 3 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#1a1a1a] text-champagne border border-[#2a2a2a]'
            )}>
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
            aria-label="Abrir conversaciones"
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
            aria-label={sidebarOpen ? 'Ocultar panel de conversaciones' : 'Mostrar panel de conversaciones'}
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

        {/* ────────── Desktop Sidebar (A-6: memoized ThreadSidebar) ────────── */}
        <div
          className={"hidden sm:flex shrink-0 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex-col transition-all duration-300 ease-in-out overflow-hidden relative sidebar-area " + (
            sidebarOpen ? 'w-72' : 'w-0 border-0'
          )}
        >
          <ThreadSidebar {...sidebarProps} />
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
                    {activeThreadData?.title || 'Conversación'}
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
                      className={"flex items-center gap-1.5 text-[10px] transition-colors px-2 py-1 rounded-full border " + (
                        isPremium
                          ? 'text-champagne/80 hover:text-champagne border-champagne/20 hover:border-champagne/40'
                          : 'text-champagne/60 hover:text-champagne border-champagne/15 hover:border-champagne/30'
                      )}
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

              {/* A-1: MessageList (B-3: memoized MessageBubbles inside) */}
              <MessageList
                messages={messages}
                isPremium={isPremium}
                sending={sending}
                apiFetch={apiFetch}
                onToggleFavorite={handleToggleFavorite}
                onSetInput={setInput}
                scrollContainerRef={scrollContainerRef}
                messagesEndRef={messagesEndRef}
                chatInputRef={chatInputRef}
                IconComponent={IconComponent}
              />

              {/* A-1: ChatInput */}
              <ChatInput
                input={input}
                onInputChange={(v) => { setInput(v); requestAnimationFrame(syncTextareaHeight); }}
                onSend={sendMessage}
                sending={sending}
                isPremium={isPremium}
                remaining={remaining}
                isArchived={!!activeThreadData?.archived}
                inputRef={chatInputRef}
                onShowLimitModal={() => setShowLimitModal(true)}
              />
            </>
          ) : (
            /* No active thread — empty state with input (MENTOR-01: ChatGPT pattern) */
            <>
              <div className="flex items-center justify-center flex-1 min-h-0">
                <div className="text-center animate-in px-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-champagne/10 flex items-center justify-center mx-auto mb-4">
                    <IconComponent size={28} className="text-champagne sm:size-8" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Mentor IA</h3>
                  <p className="text-[#999] text-sm">Escribe tu mensaje para comenzar una nueva conversación</p>
                </div>
              </div>
              <ChatInput
                input={input}
                onInputChange={(v) => { setInput(v); requestAnimationFrame(syncTextareaHeight); }}
                onSend={sendMessage}
                sending={sending}
                isPremium={isPremium}
                remaining={remaining}
                isArchived={false}
                inputRef={chatInputRef}
                onShowLimitModal={() => setShowLimitModal(true)}
              />
            </>
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
            onClick={() => { setDrawerOpen(false); setContextMenu(null); }}
            aria-hidden="true"
          />
          {/* Drawer panel — slides from left */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Conversaciones"
            className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col sm:hidden animate-in drawer-enter sidebar-area"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
              <h2 className="text-sm font-semibold text-white">Conversaciones</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
                aria-label="Cerrar conversaciones"
              >
                <X size={18} />
              </button>
            </div>
            {/* A-6: Reuse memoized ThreadSidebar */}
            <ThreadSidebar {...sidebarProps} />
          </div>
        </>
      )}

      {/* ────────── A-1: Context Menu (ThreadContextMenu) ────────── */}
      {contextMenu && (
        <ThreadContextMenu
          threadId={contextMenu.threadId}
          x={contextMenu.x}
          y={contextMenu.y}
          threads={threads}
          menuRef={contextMenuRef}
          triggerRef={contextMenuTriggerRef}
          onRename={renameThread}
          onArchive={archiveThread}
          onUnarchive={unarchiveThread}
          onDeleteRequest={setDeleteConfirm}
          onClose={() => setContextMenu(null)}
          onEditStart={(id, title) => { setEditingThreadId(id); setEditTitle(title); }}
        />
      )}

      {/* ────────── A-1: Delete Confirmation Modal ────────── */}
      {deleteConfirm && (
        <DeleteConfirmModal
          threadId={deleteConfirm}
          modalRef={deleteModalRef}
          onConfirm={deleteThread}
          onClose={() => setDeleteConfirm(null)}
        />
      )}

      {/* BUG-06: Debounce blocked feedback — subtle and discrete */}
      {debounceBlocked && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in">
          Espera un momento entre mensajes
        </div>
      )}

      {/* Action error toast — auto-dismisses */}
      {actionError && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-champagne/20 text-champagne text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in flex items-center gap-2"
        >
          {actionError}
          <button
            onClick={() => setActionError('')}
            className="underline text-champagne/80 hover:text-champagne"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      {/* ────────── A-1: Premium Limit Modal ────────── */}
      {showLimitModal && (
        <LimitModal
          modalRef={limitModalRef}
          onClose={() => setShowLimitModal(false)}
        />
      )}
    </div>
  );
}