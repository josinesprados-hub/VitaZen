'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import FavoriteButton from './FavoriteButton';
import CopyMessageButton from './CopyMessageButton';
import { markdownComponents } from './markdownComponents';
import type { Message } from './MentorChatTypes';

// ─────────────────────────────────────────
// MessageBubble — extracted from MentorChat (A-1)
// B-3 FIX: Wrapped with React.memo to prevent re-rendering
// existing messages when a new message is added.
// M-04: Uses CopyMessageButton instead of inline copy logic.
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
  const bubbleClass = msg.role === 'user'
    ? 'bg-champagne/10 border border-champagne/20 rounded-br-md'
    : isPremium
    ? 'bg-[#080808] border border-champagne/10 rounded-bl-md'
    : 'bg-[#000000] border border-[#1a1a1a] rounded-bl-md';

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
          {/* M-04: Use CopyMessageButton (includes stripMarkdown, clipboard API, fallback, a11y) */}
          <CopyMessageButton content={msg.content} />
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