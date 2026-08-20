'use client';

import React, { RefObject } from 'react';
import { Send, Zap, Circle } from 'lucide-react';

// ─────────────────────────────────────────
// ChatInput — extracted from MentorChat (A-1)
// ─────────────────────────────────────────

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  isPremium: boolean;
  remaining: number | null;
  isArchived: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onShowLimitModal: () => void;
}

const ChatInput = React.memo(function ChatInput({
  input,
  onInputChange,
  onSend,
  sending,
  isPremium,
  remaining,
  isArchived,
  inputRef,
  onShowLimitModal,
}: ChatInputProps) {
  const disabled = sending || !input.trim() || (!isPremium && remaining === 0) || isArchived;
  const textareaDisabled = sending || (!isPremium && remaining === 0) || isArchived;

  let textareaClass = 'flex-1 bg-[#000000] border rounded-xl px-4 py-3 text-white text-base sm:text-sm placeholder-[#555] resize-none overflow-hidden leading-6 transition-colors ';
  if (isArchived) {
    textareaClass += 'border-[#333] cursor-not-allowed opacity-40';
  } else if (!isPremium && remaining === 0) {
    textareaClass += 'border-[#ef4444]/30 cursor-not-allowed opacity-50';
  } else {
    textareaClass += 'border-[#1a1a1a] focus:border-champagne focus:outline-none';
  }

  const placeholder = isArchived
    ? 'Conversación archivada'
    : !isPremium && remaining === 0
    ? 'Límite diario alcanzado'
    : 'Escribe tu mensaje...';

  return (
    <div className="p-3 sm:p-4 border-t border-[#1a1a1a] shrink-0 bg-[#0a0a0a] sm:bg-transparent" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      {/* Low message warning */}
      {!isPremium && remaining !== null && remaining <= 3 && remaining > 0 && (
        <div className="mb-2 flex items-center gap-2 text-[10px] text-champagne-warm bg-champagne-warm/5 border border-champagne-warm/10 rounded-lg px-3 py-1.5">
          <Zap size={10} className="shrink-0" />
          <span>Te quedan {remaining} mensaje{remaining !== 1 ? 's' : ''} hoy</span>
          <button
            onClick={onShowLimitModal}
            className="ml-auto text-champagne hover:text-champagne-hover flex items-center gap-1"
          >
            <Circle size={3} fill="currentColor" className="text-champagne/40" />
            Conocer Élite
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); onSend(); }}
        className="flex gap-2 items-end"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          enterKeyHint="send"
          autoComplete="off"
          placeholder={placeholder}
          rows={1}
          className={textareaClass}
          disabled={textareaDisabled}
        />
        <button
          type="submit"
          disabled={disabled}
          className="bg-champagne text-black font-semibold w-12 h-12 sm:w-auto sm:h-auto sm:px-5 sm:py-3 rounded-xl hover:bg-champagne-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center touch-press"
          aria-label="Enviar mensaje"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
});

export default ChatInput;