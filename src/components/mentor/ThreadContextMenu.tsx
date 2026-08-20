'use client';

import React, { useEffect, RefObject } from 'react';
import { Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { Thread } from './MentorChatTypes';

// ─────────────────────────────────────────
// ThreadContextMenu — extracted from MentorChat (A-1)
// Includes A-4 keyboard navigation from FASE 7A.
// ─────────────────────────────────────────

interface ThreadContextMenuProps {
  threadId: string;
  x: number;
  y: number;
  threads: Thread[];
  menuRef: RefObject<HTMLDivElement | null>;
 onRename: (threadId: string, newTitle: string) => void;
  onArchive: (threadId: string) => void;
  onUnarchive: (threadId: string) => void;
  onDeleteRequest: (threadId: string) => void;
  onClose: () => void;
  onEditStart: (threadId: string, title: string) => void;
}

const ThreadContextMenu = React.memo(function ThreadContextMenu({
  threadId,
  x,
  y,
  threads,
  menuRef,
  onRename,
  onArchive,
  onUnarchive,
  onDeleteRequest,
  onClose,
  onEditStart,
}: ThreadContextMenuProps) {
  const thread = threads.find(t => t.id === threadId);

  // A-4: Keyboard navigation for context menu
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (items.length === 0) return;
    let index = -1;
    const setIndex = (i: number) => {
      index = i;
      items.forEach((el, idx) => el.setAttribute('aria-selected', idx === i ? 'true' : 'false'));
      if (i >= 0 && i < items.length) items[i].focus();
    };
    setIndex(0);
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setIndex(index < items.length - 1 ? index + 1 : 0); break;
        case 'ArrowUp': e.preventDefault(); setIndex(index > 0 ? index - 1 : items.length - 1); break;
        case 'Enter': case ' ': e.preventDefault(); if (index >= 0) items[index].click(); break;
      }
    };
    menu.addEventListener('keydown', handler);
    return () => menu.removeEventListener('keydown', handler);
  }, [menuRef]);

  if (!thread) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        role="menu"
        aria-label="Opciones de conversación"
        className="fixed z-50 bg-[#111] border border-[#2a2a2a] rounded-xl py-1.5 shadow-2xl shadow-black/60 min-w-[180px] max-w-[calc(100vw-16px)] animate-in context-menu"
        style={{
          // M-9 FIX: Clamp to viewport bounds, prevent overflow in mobile drawer
          top: Math.min(y + 50, window.innerHeight - 200),
          left: Math.max(8, Math.min(x + 16, window.innerWidth - 200)),
        }}
      >
        <button
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onEditStart(thread.id, thread.title);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-white transition-colors"
        >
          <Pencil size={14} className="text-[#888]" />
          Renombrar
        </button>

        {thread.archived ? (
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onUnarchive(thread.id);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-champagne transition-colors"
          >
            <ArchiveRestore size={14} className="text-[#888]" />
            Restaurar
          </button>
        ) : (
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onArchive(thread.id);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#1a1a1a] hover:text-champagne transition-colors"
          >
            <Archive size={14} className="text-[#888]" />
            Archivar
          </button>
        )}

        <div className="my-1.5 border-t border-[#1a1a1a]" role="separator" />

        <button
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onDeleteRequest(thread.id);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#ccc] hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} className="text-[#888]" />
          Eliminar
        </button>
      </div>
    </>
  );
});

export default ThreadContextMenu;