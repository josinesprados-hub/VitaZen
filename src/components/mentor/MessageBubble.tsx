'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, X } from 'lucide-react';
import FavoriteButton from './FavoriteButton';
import { markdownComponents } from './markdownComponents';
import type { Message } from './MentorChatTypes';

// ─────────────────────────────────────────
// MessageBubble — extracted from MentorChat (A-1)
// B-3 FIX: Wrapped with React.memo to prevent re-rendering
// existing messages when a new message is added.
// Copy state is self-contained (no parent re-render).
// A-7 FIX: Uses module-level markdownComponents.
// ─────────────────────────────────────────

interface MessageBubbleProps {
  msg: Message;
  isPremium: boolean;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onToggleFavorite: (id: string, isFavorited: boolean) => void;
  animationDelay: number;
}

const MessageBubble = React.memo(function MessageBubble({
  msg,
  isPremium,
  apiFetch,
  onToggleFavorite,
  animationDelay,
}: MessageBubbleProps) {
  // Self-contained copy state — B-3: no parent re-render needed
  const [copied, setCopied] = useState(false);
  // B-2 FIX: Show copy failure feedback
  const [copyError, setCopyError] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // B-2 FIX: Inform user that copy failed
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
    }
  }, [msg.content]);

  const bubbleClass = msg.role === 'user'
    ? 'bg-champagne/10 border border-champagne/20 rounded-br-md'
    : isPremium
    ? 'bg-[#080808] border border-champagne/10 rounded-bl-md'
    : 'bg-[#000000] border border-[#1a1a1a] rounded-bl-md';

  const copyBtnClass = copied
    ? 'text-green-400 opacity-100'
    : 'text-[#999] opacity-60 hover:opacity-100 hover:text-champagne/50';

  const flexClass = msg.role === 'user' ? 'justify-end' : 'justify-start';

  return (
    <div className={"flex " + flexClass + " animate-in"} style={{ animationDelay: animationDelay + 'ms' }}>
      <div className={"max-w-[88%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 " + bubbleClass}>
        {msg.role === 'assistant' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {msg.content}
          </ReactMarkdown>
        ) : (
          <p className="text-sm text-white whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
        )}
      </div>
      {msg.role === 'assistant' && (
        <div className="flex justify-end pr-1 pt-0.5 gap-0.5">
          {/* BUG-02: Copy response button */}
          <button
            onClick={handleCopy}
            aria-label={copied ? 'Copiado' : copyError ? 'Error al copiar' : 'Copiar respuesta'}
            className={"w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none " + copyBtnClass}
          >
            {copied ? (
              <Check size={13} className="text-green-400" />
            ) : copyError ? (
              <X size={13} className="text-red-400" />
            ) : (
              <Copy size={13} />
            )}
          </button>
          <FavoriteButton
            messageId={msg.id}
            isFavorited={msg.isFavorited ?? false}
            apiFetch={apiFetch}
            onToggle={onToggleFavorite}
          />
        </div>
      )}
    </div>
  );
});

export default MessageBubble;