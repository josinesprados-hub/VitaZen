'use client';

import React, { RefObject } from 'react';
import Link from 'next/link';
import {
  Plus,
  ChevronLeft,
  Search,
  Star,
  X,
  Check,
  MessageCircle,
  Archive,
  MoreVertical,
  Inbox,
  MessageSquareOff,
  Zap,
  Circle,
  BrainCircuit,
} from 'lucide-react';
import PremiumGate, { PremiumInlineBadge, PremiumHistoryGate } from '@/components/ui/PremiumGate';
import { getRelativeDate, DATE_GROUP_ORDER, getProgressColor } from './MentorChatTypes';
import type { Thread, Favorite } from './MentorChatTypes';

// ─────────────────────────────────────────
// ThreadSidebar — extracted from MentorChat (A-1)
// A-6 FIX: Wrapped with React.memo so the sidebar
// is not reconstructed on every parent render.
// ─────────────────────────────────────────

interface ThreadSidebarProps {
  backHref: string;
  tab: 'active' | 'archived' | 'favorites';
  searchQuery: string;
  threads: Thread[];
  activeThread: string | null;
  totalActiveCount: number;
  totalArchivedCount: number;
  isPremium: boolean;
  remaining: number | null;
  dailyLimit: number;
  editingThreadId: string | null;
  editTitle: string;
  activeThreads: Thread[];
  archivedThreads: Thread[];
  groupedThreads: Record<string, Thread[]>;
  searchedThreads: Thread[];
  favorites: Favorite[];
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onTabChange: (tab: 'active' | 'archived' | 'favorites') => void;
  onSearchChange: (q: string) => void;
  onContextMenu: (e: React.MouseEvent, threadId: string) => void;
  onRenameThread: (id: string, title: string) => void;
  onCancelEdit: () => void;
  onEditTitleChange: (title: string) => void;
  onSelectFavorite: (threadId: string, isArchived: boolean) => void;
  onShowLimitModal: () => void;
  editInputRef: RefObject<HTMLInputElement | null>;
}

const ThreadSidebar = React.memo(function ThreadSidebar({
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
  onCreateThread,
  onSelectThread,
  onTabChange,
  onSearchChange,
  onContextMenu,
  onRenameThread,
  onCancelEdit,
  onEditTitleChange,
  onSelectFavorite,
  onShowLimitModal,
  editInputRef,
}: ThreadSidebarProps) {
  return (
    <>
      {/* Back + New button */}
      <div className="p-3 border-b border-[#1a1a1a] space-y-2">
        <Link
          href={backHref}
          className="text-[#888] text-xs hover:text-champagne flex items-center gap-1 transition-colors"
        >
          <ChevronLeft size={12} /> Volver
        </Link>
        {/* MENTOR-01: Free users at 5/5 threads — button disabled with actionable message */}
        {!isPremium && totalActiveCount >= 5 ? (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 bg-champagne/30 text-black/50 font-semibold py-2.5 rounded-lg cursor-not-allowed text-sm"
            aria-disabled="true"
          >
            <Plus size={16} /> 5/5 conversaciones
          </button>
        ) : (
        <button
          onClick={onCreateThread}
          className="w-full flex items-center justify-center gap-2 bg-champagne text-black font-semibold py-2.5 rounded-lg hover:bg-champagne-hover transition-colors text-sm"
        >
          <Plus size={16} /> Nueva conversación
        </button>
        )}
      </div>

      {/* Tab selector: Todas / Archivadas / Favoritos */}
      <div className="flex border-b border-[#1a1a1a]">
        <button
          onClick={() => onTabChange('active')}
          className={"flex-1 py-2.5 text-xs font-medium transition-colors relative " + (
            tab === 'active'
              ? 'text-champagne'
              : 'text-[#888] hover:text-[#999]'
          )}
        >
          Todas
          {totalActiveCount > 0 && (
            <span className={"ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full " + (
              tab === 'active' ? 'bg-champagne/20 text-champagne' : 'bg-[#1a1a1a] text-[#888]'
            )}>
              {totalActiveCount}
            </span>
          )}
          {tab === 'active' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-champagne rounded-full" />
          )}
        </button>
        <button
          onClick={() => onTabChange('archived')}
          className={"flex-1 py-2.5 text-xs font-medium transition-colors relative " + (
            tab === 'archived'
              ? 'text-champagne'
              : 'text-[#888] hover:text-[#999]'
          )}
        >
          Archivadas
          {totalArchivedCount > 0 && (
            <span className={"ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full " + (
              tab === 'archived' ? 'bg-champagne/20 text-champagne' : 'bg-[#1a1a1a] text-[#888]'
            )}>
              {totalArchivedCount}
            </span>
          )}
          {tab === 'archived' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-champagne rounded-full" />
          )}
        </button>
        <button
          onClick={() => onTabChange('favorites')}
          className={"flex-1 py-2.5 text-xs font-medium transition-colors relative " + (
            tab === 'favorites'
              ? 'text-champagne'
              : 'text-[#888] hover:text-[#999]'
          )}
        >
          <Star size={12} className="inline -mt-px" />
          {tab === 'favorites' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-champagne rounded-full" />
          )}
        </button>
      </div>

      {/* Search bar (hidden in favorites tab) */}
      {tab !== 'favorites' && (
      <div className="px-3 py-2 border-b border-[#1a1a1a]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar conversación..."
            className="w-full bg-[#111] border border-[#1a1a1a] rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-[#555] focus:border-champagne/40 focus:outline-none transition-colors"
            aria-label="Buscar conversaciones por título"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-white transition-colors p-0.5"
              aria-label="Limpiar búsqueda"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Thread list / Favorites list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-hide">
        {tab === 'favorites' ? (
          // Favorites list
          <>
            {favorites.length === 0 && (
              <div className="text-center py-12 animate-in">
                <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                  <Star size={24} className="text-[#999]" />
                </div>
                <p className="text-[#888] text-sm font-medium mb-1">Sin favoritos</p>
                <p className="text-[#999] text-xs">Marca respuestas del mentor para guardarlas aquí</p>
              </div>
            )}
            {favorites.map((fav) => {
              // BUG-05: Check if the thread is archived to navigate to correct tab
              const favThread = threads.find(t => t.id === fav.thread.id);
              const isArchived = favThread?.archived ?? false;
              return (
              <div
                key={fav.id}
                role="button"
                tabIndex={0}
                className="rounded-lg px-3 py-2.5 cursor-pointer text-[#ccc] hover:bg-[#1a1a1a]/60 transition-all duration-200"
                onClick={() => {
                  onSelectFavorite(fav.thread.id, isArchived);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFavorite(fav.thread.id, isArchived);
                  }
                }}
              >
                <p className="text-xs text-champagne/70 mb-1 truncate">{fav.thread.title}</p>
                <p className="text-[13px] leading-snug line-clamp-2">{fav.content.slice(0, 120)}</p>
                <p className="text-[10px] text-[#888] mt-1">{getRelativeDate(fav.favoritedAt)}</p>
              {isArchived && (
                <span className="inline-block mt-1 text-[9px] bg-champagne/10 text-champagne/60 px-1.5 py-0.5 rounded-full border border-champagne/15">
                  Archivada
                </span>
              )}
              </div>
              );
            })}
          </>
        ) : (
          // Thread list grouped by date (only for active/archived tabs)
          DATE_GROUP_ORDER.map((group, groupIdx) => {
          const groupThreads = groupedThreads[group];
          if (!groupThreads || groupThreads.length === 0) return null;
          // FREE users: blur groups beyond "Esta semana" (index 3+)
          const isOldGroup = !isPremium && groupIdx >= 3;
          return (
            <div key={group} className="animate-in" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center justify-between px-3 py-1.5">
                <p className="text-[10px] text-[#888] uppercase tracking-widest font-semibold">
                  {group}
                </p>
                {groupIdx === 0 && !isPremium && searchedThreads.length > 5 && (
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
                        <MessageCircle size={14} className="shrink-0 mr-2.5 text-[#888]" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate leading-tight">{thread.title}</p>
                          <p className="text-[10px] text-[#888] mt-0.5">{getRelativeDate(thread.updatedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </PremiumGate>
              ) : (
                <div className="space-y-0.5">
                  {groupThreads.map((thread) => {
                    let threadClass = 'group flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-200 ';
                    if (activeThread === thread.id) {
                      threadClass += 'bg-champagne/10 text-champagne';
                    } else if (tab === 'archived') {
                      threadClass += 'text-[#888] hover:bg-[#1a1a1a]/40';
                    } else {
                      threadClass += 'text-[#ccc] hover:bg-[#1a1a1a]/60';
                    }

                    return (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      className={threadClass}
                      onClick={() => {
                        if (editingThreadId !== thread.id) {
                          onSelectThread(thread.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && editingThreadId !== thread.id) {
                          e.preventDefault();
                          onSelectThread(thread.id);
                        }
                      }}
                    >
                      {thread.archived ? (
                        <Archive size={14} className="shrink-0 mr-2.5 text-[#888]" />
                      ) : (
                        <MessageCircle
                          size={14}
                          className={"shrink-0 mr-2.5 " + (
                            activeThread === thread.id ? 'text-champagne' : 'text-[#888]'
                          )}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {editingThreadId === thread.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editTitle}
                              onChange={(e) => onEditTitleChange(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onRenameThread(thread.id, editTitle);
                                if (e.key === 'Escape') onCancelEdit();
                              }}
                              className="flex-1 bg-[#000] border border-champagne rounded px-2 py-0.5 text-base sm:text-sm text-white focus:outline-none"
                              maxLength={100}
                            />
                            <button
                              onClick={() => onRenameThread(thread.id, editTitle)}
                              className="text-champagne hover:text-champagne-hover p-0.5"
                              aria-label="Guardar nombre"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={onCancelEdit}
                              className="text-[#888] hover:text-white p-0.5"
                              aria-label="Cancelar edición"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className={"text-sm truncate leading-tight " + (thread.archived ? 'italic opacity-70' : '')}>
                              {thread.title}
                            </p>
                            <p className="text-[10px] text-[#888] mt-0.5">
                              {getRelativeDate(thread.updatedAt)}
                            </p>
                          </>
                        )}
                      </div>
                      {/* Context menu trigger (⋯) */}
                      {editingThreadId !== thread.id && (
                        <button
                          onClick={(e) => onContextMenu(e, thread.id)}
                          className="text-[#999] hover:text-champagne p-1 rounded transition-all opacity-60 group-hover:opacity-100 ml-1"
                          aria-label="Más opciones"
                        >
                          <MoreVertical size={14} />
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
        )}

        {/* Premium history gate at bottom of sidebar */}
        {!isPremium && tab === 'active' && activeThreads.length > 3 && (
          <PremiumHistoryGate isPremium={isPremium} label="historial completo de conversaciones" />
        )}

        {/* Empty state: active tab (hide when searching) */}
        {tab === 'active' && activeThreads.length === 0 && !searchQuery && (
          <div className="text-center py-12 animate-in">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
              <Inbox size={24} className="text-[#999]" />
            </div>
            <p className="text-[#888] text-sm font-medium mb-1">Sin conversaciones</p>
            <p className="text-[#999] text-xs">Crea una nueva para empezar</p>
          </div>
        )}

        {/* Empty state: archived tab (hide when searching) */}
        {tab === 'archived' && archivedThreads.length === 0 && !searchQuery && (
          <div className="text-center py-12 animate-in">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
              <MessageSquareOff size={24} className="text-[#999]" />
            </div>
            <p className="text-[#888] text-sm font-medium mb-1">Sin archivadas</p>
            <p className="text-[#999] text-xs">Las conversaciones archivadas aparecerán aquí</p>
          </div>
        )}

        {/* Empty state: search no results */}
        {searchQuery.trim() && searchedThreads.length === 0 && (
          <div className="text-center py-12 animate-in">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
              <Search size={24} className="text-[#999]" />
            </div>
            <p className="text-[#888] text-sm font-medium mb-1">Sin resultados</p>
            <p className="text-[#999] text-xs">No se encontró "{searchQuery.trim()}"</p>
          </div>
        )}
      </div>

      {/* Message counter for FREE users — elegant bottom bar */}
      {!isPremium && remaining !== null && (
        <div className="p-3 border-t border-[#1a1a1a]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[#888] flex items-center gap-1.5">
              <Zap size={10} />
              Mensajes hoy
            </span>
            <span className={"font-semibold " + (
              remaining === 0 ? 'text-red-400' :
              remaining <= 3 ? 'text-champagne-warm' :
              'text-champagne'
            )}>
              {remaining}/{dailyLimit}
            </span>
          </div>
          <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: Math.max((remaining / dailyLimit) * 100, 0) + '%',
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
              onClick={onShowLimitModal}
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
});

export default ThreadSidebar;
