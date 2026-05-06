'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
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
} from 'lucide-react';
import Link from 'next/link';

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
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Persist active thread in localStorage
  const STORAGE_KEY = 'vitazen_active_thread';

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
    if (activeThread) {
      fetchMessages(activeThread);
      try { localStorage.setItem(STORAGE_KEY, activeThread); } catch {}
    }
  }, [activeThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingThreadId]);

  // ─────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────

  const fetchThreads = async () => {
    try {
      const res = await apiFetch('/api/ai/threads');
      if (res.ok) {
        const data = await res.json();
        const allThreads: Thread[] = data.threads;
        setThreads(allThreads);
        if (allThreads.length > 0) {
          let savedThreadId: string | null = null;
          try { savedThreadId = localStorage.getItem(STORAGE_KEY); } catch {}

          // Only restore if saved thread is active (not archived)
          const savedExists = savedThreadId && allThreads.some((t: Thread) => t.id === savedThreadId && !t.archived);
          const activeThreads = allThreads.filter((t: Thread) => !t.archived);
          setActiveThread(savedExists ? savedThreadId! : (activeThreads.length > 0 ? activeThreads[0].id : null));
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchMessages = useCallback(async (threadId: string) => {
    try {
      const res = await apiFetch(`/api/ai/threads/${threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
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
        setThreads([data.thread, ...threads]);
        setActiveThread(data.thread.id);
        setMessages([]);
        setTab('active');
        setTimeout(() => chatInputRef.current?.focus(), 100);
      } else {
        const data = await res.json();
        if (data.error?.includes('Maximum')) {
          alert('Has alcanzado el límite de conversaciones. Elimina una para crear otra nueva.');
        }
      }
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
    finally { setEditingThreadId(null); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeThread || sending) return;

    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ threadId: activeThread, content: input }),
      });

      if (res.status === 403) {
        setShowLimitModal(true);
        setRemaining(0);
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
        setMessages(prev => [...prev, assistantMessage]);
        setRemaining(data.remaining);

        // Refresh threads to get updated title and updatedAt
        const threadsRes = await apiFetch('/api/ai/threads');
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json();
          setThreads(threadsData.threads);
        }
      }
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  // ─────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────

  const activeThreads = threads.filter(t => !t.archived);
  const archivedThreads = threads.filter(t => t.archived);
  const visibleThreads = tab === 'active' ? activeThreads : archivedThreads;

  // Group visible threads by date
  const groupedThreads = visibleThreads.reduce<Record<string, Thread[]>>((acc, thread) => {
    const group = getDateGroup(thread.updatedAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(thread);
    return acc;
  }, {});

  const dateGroupOrder = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Anterior'];

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
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Sparkles size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  const IconComponent = headerIcon === 'brain' ? Brain : Sparkles;

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
            <IconComponent size={24} className="text-[#c8a55a]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Mentor IA</h1>
            <p className="text-[#999] text-xs">Tu guía experto de desarrollo personal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            title={sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* ────────── Sidebar ────────── */}
        <div
          className={`shrink-0 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative sidebar-area ${
            sidebarOpen ? 'w-72' : 'w-0 border-0'
          }`}
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
            {dateGroupOrder.map(group => {
              const groupThreads = groupedThreads[group];
              if (!groupThreads || groupThreads.length === 0) return null;
              return (
                <div key={group} className="animate-in" style={{ animationDelay: '50ms' }}>
                  <p className="px-3 py-1.5 text-[10px] text-[#555] uppercase tracking-widest font-semibold">
                    {group}
                  </p>
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
                            // If opening an archived thread, keep it visible in chat
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
                                className="flex-1 bg-[#000] border border-[#c8a55a] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
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
                </div>
              );
            })}

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

          {/* Message counter for FREE users */}
          {user?.plan === 'FREE' && remaining !== null && (
            <div className="p-3 border-t border-[#1a1a1a]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#666]">Mensajes hoy</span>
                <span className="text-[#c8a55a] font-medium">
                  {remaining === Infinity ? '∞' : remaining}
                </span>
              </div>
              {remaining !== Infinity && (
                <div className="mt-1.5 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#c8a55a] rounded-full transition-all duration-500"
                    style={{ width: `${(remaining / 10) * 100}%` }}
                  />
                </div>
              )}
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
                top: contextMenu.y + 50,
                left: Math.min(contextMenu.x + 16, window.innerWidth - 200),
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
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in">
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-8 max-w-sm w-full text-center context-menu">
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

        {/* ────────── Chat Area ────────── */}
        <div className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col min-w-0">
          {activeThread ? (
            <>
              {/* Chat header bar with thread info */}
              <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle size={14} className="text-[#c8a55a] shrink-0" />
                  <p className="text-sm text-white truncate">
                    {threads.find(t => t.id === activeThread)?.title || 'Conversación'}
                  </p>
                  {threads.find(t => t.id === activeThread)?.archived && (
                    <span className="shrink-0 text-[10px] bg-[#c8a55a]/10 text-[#c8a55a] px-2 py-0.5 rounded-full border border-[#c8a55a]/20">
                      Archivada
                    </span>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center animate-in">
                      <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
                        <IconComponent size={32} className="text-[#c8a55a]" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Tu Mentor IA</h3>
                      <p className="text-[#999] text-sm max-w-sm mx-auto leading-relaxed">
                        {user?.plan === 'PREMIUM'
                          ? 'Soy tu mentor experto en desarrollo personal. Pregúntame lo que necesites sobre hábitos, mindset, productividad o crecimiento personal.'
                          : 'Soy tu asistente de bienestar. Pregúntame sobre hábitos y bienestar.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {[
                          '¿Cómo puedo mejorar mi disciplina?',
                          'Quiero crear nuevos hábitos',
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
                      className={`max-w-[80%] rounded-2xl p-4 ${
                        msg.role === 'user'
                          ? 'bg-[#c8a55a]/10 border border-[#c8a55a]/20 rounded-br-md'
                          : 'bg-[#000000] border border-[#1a1a1a] rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start animate-in">
                    <div className="bg-[#000000] border border-[#1a1a1a] rounded-2xl rounded-bl-md p-4">
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

              {/* Input */}
              <div className="p-4 border-t border-[#1a1a1a]">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="flex-1 bg-[#000000] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white text-sm placeholder-[#555] focus:border-[#c8a55a] transition-colors"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="bg-[#c8a55a] text-black font-semibold px-5 py-3 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-in">
                <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
                  <IconComponent size={32} className="text-[#c8a55a]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Mentor IA</h3>
                <p className="text-[#999] text-sm mb-4">Crea una conversación para comenzar</p>
                <button
                  onClick={createThread}
                  className="inline-flex items-center gap-2 bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
                >
                  <Plus size={16} /> Nueva conversación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ────────── Limit Modal ────────── */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-8 max-w-md w-full text-center context-menu">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Límite diario alcanzado</h3>
            <p className="text-[#999] mb-6 text-sm leading-relaxed">
              Has utilizado tus 10 mensajes diarios del plan Free. Mejora a Premium para disfrutar de mensajes ilimitados y un mentor más avanzado.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/pricing"
                className="bg-[#c8a55a] text-black font-semibold px-6 py-3 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
                onClick={() => setShowLimitModal(false)}
              >
                Mejorar a Premium
              </Link>
              <button
                onClick={() => setShowLimitModal(false)}
                className="text-[#999] px-6 py-3 hover:text-white transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
