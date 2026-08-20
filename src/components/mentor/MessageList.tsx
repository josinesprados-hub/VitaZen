'use client';

import React, { RefObject } from 'react';
import { Circle } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { Message } from './MentorChatTypes';
import type { LucideIcon } from 'lucide-react';

// ─────────────────────────────────────────
// MessageList — extracted from MentorChat (A-1)
// Includes empty state and typing indicator.
// ─────────────────────────────────────────

interface MessageListProps {
  messages: Message[];
  isPremium: boolean;
  sending: boolean;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onToggleFavorite: (id: string, isFavorited: boolean) => void;
  onSetInput: (value: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  IconComponent: LucideIcon;
}

const MessageList = React.memo(function MessageList({
  messages,
  isPremium,
  sending,
  apiFetch,
  onToggleFavorite,
  onSetInput,
  scrollContainerRef,
  messagesEndRef,
  chatInputRef,
  IconComponent,
}: MessageListProps) {
  return (
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
              {[
                '¿Cómo mantener la constancia?',
                'Crear nuevos hábitos',
                '¿Cómo manejar el estrés?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    onSetInput(suggestion);
                    setTimeout(() => chatInputRef.current?.focus(), 50);
                  }}
                  className="text-xs text-[#999] bg-[#1a1a1a] border border-[#222] px-3 py-1.5 rounded-full hover:border-champagne/30 hover:text-champagne transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {!isPremium && (
              <p className="text-[10px] text-[#888] mt-4 flex items-center justify-center gap-1">
                <Circle size={3} fill="currentColor" className="text-champagne/30" />
                El mentor recuerda más cuando profundizas
              </p>
            )}
          </div>
        </div>
      )}
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id}
          msg={msg}
          isPremium={isPremium}
          apiFetch={apiFetch}
          onToggleFavorite={onToggleFavorite}
          animationDelay={Math.min(idx * 30, 300)}
        />
      ))}
      {sending && (
        <div className="flex justify-start animate-in">
          <div className={"border rounded-2xl rounded-bl-md p-4 " + (
            isPremium ? 'bg-[#080808] border-champagne/10' : 'bg-[#000000] border-[#1a1a1a]'
          )}>
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
  );
});

export default MessageList;