'use client';

import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

// ─────────────────────────────────────────
// CopyMessageButton — Discrete copy button for Mentor IA responses
//
// Design:
//   • Self-contained: manages its own state, zero parent re-renders
//   • React.memo: only re-renders on its own state change or content change
//   • Copies plain text (Markdown stripped) — exactly what the user reads
//   • Clipboard API with document.execCommand fallback for non-HTTPS
//   • Accessible: aria-label, keyboard, focus-visible
//   • Premium feedback: icon swap (Copy → Check) for 2 seconds
// ─────────────────────────────────────────

/**
 * Strips Markdown syntax to produce the exact readable text the user sees.
 * Removes formatting markers but preserves the text content and structure.
 */
function stripMarkdown(text: string): string {
  return text
    // Fenced code blocks: keep code, remove delimiters and language tag
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, code: string) => code.trimEnd())
    // Inline code: keep content, remove backticks
    .replace(/`([^`]+)`/g, '$1')
    // Headings: remove # ## ### markers
    .replace(/^#{1,3}\s+/gm, '')
    // Bold: remove ** markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Italic: remove * markers
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    // Links: keep text, remove URL
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Blockquotes: remove > prefix
    .replace(/^>\s?/gm, '')
    // Horizontal rules: remove ---
    .replace(/^[-*_]{3,}$/gm, '')
    // Excessive blank lines → max one
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface CopyMessageButtonProps {
  content: string;
}

const CopyMessageButton = React.memo(function CopyMessageButton({ content }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const plainText = stripMarkdown(content);

    try {
      await navigator.clipboard.writeText(plainText);
    } catch {
      // Fallback for non-secure contexts (HTTP, older browsers, some WebViews)
      const ta = document.createElement('textarea');
      ta.value = plainText;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Respuesta copiada' : 'Copiar respuesta'}
      className="
        flex items-center justify-center
        w-6 h-6 rounded-md
        text-[#999] hover:text-champagne/50
        transition-colors duration-200
        focus:outline-none focus-visible:ring-1 focus-visible:ring-champagne/30
        opacity-60 hover:opacity-100
      "
    >
      {copied ? (
        <Check size={13} strokeWidth={2} className="text-champagne/70" />
      ) : (
        <Copy size={13} strokeWidth={1.5} />
      )}
    </button>
  );
});

export default CopyMessageButton;