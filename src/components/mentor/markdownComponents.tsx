'use client';

import React from 'react';

// ─────────────────────────────────────────
// A-7 FIX: Module-level ReactMarkdown components
// Extracted from the messages.map() loop to avoid
// recreating this object on every render.
// ─────────────────────────────────────────

export const markdownComponents: Record<string, React.ComponentType<any>> = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-white leading-relaxed break-words mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-champagne/90">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm text-white leading-relaxed">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const safeHref = href && /^https?:\/\//i.test(href) ? href : undefined;
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-champagne hover:text-champagne-hover underline underline-offset-2">{children}</a>
    );
  },
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-[#1a1a1a] text-champagne/80 px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>
      );
    }
    return (
      <code className={`${className} block text-sm font-mono`} {...props}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3 my-2 overflow-x-auto text-sm font-mono text-[#ccc]">{children}</pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b border-[#333]">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-1.5 text-left text-champagne/80 font-medium text-xs uppercase tracking-wider">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 text-white border-b border-[#1a1a1a]">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-champagne/30 pl-3 my-2 text-[#aaa] italic">{children}</blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-white mt-3 mb-1">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold text-white mt-3 mb-1">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold text-white mt-2 mb-1">{children}</h3>
  ),
};
