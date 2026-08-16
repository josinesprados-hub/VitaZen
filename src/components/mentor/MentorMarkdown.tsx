'use client';

import React, { useMemo } from 'react';
import Markdown from 'react-markdown';

// ─────────────────────────────────────────
// MentorMarkdown — Premium markdown renderer for VitaZen Mentor IA
//
// Design principles:
//   • Only assistant messages use markdown (user messages stay plain text)
//   • react-markdown v10 does NOT render raw HTML by default (XSS-safe)
//   • No rehype-raw, no dangerouslySetInnerHTML, no HTML passthrough
//   • All links open in new tab with security attributes
//   • Code blocks: lazy-loaded syntax highlighter (rare, keeps bundle light)
//   • Styles match VitaZen's dark champagne editorial identity
//
// Security model (3 layers):
//   1. react-markdown v10 without rehype-raw: ALL HTML tags are escaped.
//      <script>, <iframe>, <img onerror>, <a href="javascript:"> — none execute.
//      The markdown parser only produces standard AST nodes (headings, paragraphs, etc.)
//   2. MentorLink: protocol whitelist (only https://) — blocks javascript:, data:, vbscript:
//   3. Code: static display only, no eval/execution, no dangerouslySetInnerHTML
// ─────────────────────────────────────────

// ── Link component: secure, VitaZen-styled ──
function MentorLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  // Only allow http/https protocols — block javascript:, data:, vbscript:, etc.
  const safeHref = href && /^https?:\/\//i.test(href) ? href : undefined;

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className="text-champagne/90 hover:text-champagne-hover underline underline-offset-2 decoration-champagne/20 hover:decoration-champagne/50 transition-colors"
      {...props}
    >
      {children}
    </a>
  );
}

// ── Code block: lazy-loaded syntax highlighter ──
// Dynamically imported so the heavy syntax-highlighter bundle only loads
// when a fenced code block actually appears in a message (rare).
// react-syntax-highlighter is already in package.json.
const LazyCodeBlock = React.lazy(async () => {
  const { Prism: SyntaxHighlighter } = await import('react-syntax-highlighter');
  const { vscDarkPlus } = await import('react-syntax-highlighter/dist/esm/styles/prism');
  return {
    default: function MentorCodeBlock({ lang, code }: { lang: string; code: string }) {
      return (
        <div className="my-3 rounded-lg overflow-hidden border border-[#222]">
          <div className="flex items-center px-3 py-1.5 bg-[#111] border-b border-[#222]">
            <span className="text-[10px] text-[#888] uppercase tracking-wider font-medium">{lang}</span>
          </div>
          <SyntaxHighlighter
            language={lang}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '0.75rem 1rem',
              background: '#0d0d0d',
              fontSize: '0.8rem',
              lineHeight: '1.6',
            }}
            codeTagProps={{ style: { fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace" } }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );
    },
  };
});

// ── Markdown component map: each element styled to match VitaZen ──
const mentorComponents = {
  // Headings — editorial, calm, premium. Scaled for chat context (not documentation).
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="text-base font-semibold text-white mt-4 mb-2 pb-1.5 border-b border-champagne/15"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="text-[0.9rem] font-semibold text-white mt-3 mb-1.5"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="text-[0.85rem] font-medium text-champagne/90 mt-2.5 mb-1"
      {...props}
    >
      {children}
    </h3>
  ),

  // Paragraph — the default text block, matching existing message style
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className="text-sm text-white/90 leading-relaxed mb-2 last:mb-0"
      {...props}
    >
      {children}
    </p>
  ),

  // Bold — subtle emphasis
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-white" {...props}>
      {children}
    </strong>
  ),

  // Italic — slight warmth
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-white/80" {...props}>
      {children}
    </em>
  ),

  // Unordered lists — breathe with spacing, champagne markers
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-2 ml-4 space-y-1 list-disc marker:text-champagne/50" {...props}>
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-sm text-white/90 leading-relaxed pl-1" {...props}>
      {children}
    </li>
  ),

  // Ordered lists — champagne numbers
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-2 ml-4 space-y-1 list-decimal marker:text-champagne/50" {...props}>
      {children}
    </ol>
  ),

  // Blockquote — elegant left accent, editorial feel
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-3 pl-3 py-1 border-l-2 border-champagne/25 bg-champagne/[0.03] rounded-r-md"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Horizontal rule — subtle champagne line
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-4 border-0 h-px bg-champagne/15" {...props} />
  ),

  // Code — handles BOTH inline and block contexts
  // react-markdown calls code() first; its result becomes pre's children.
  // Block: className contains "language-xxx" → lazy-loaded syntax highlighter
  // Inline: no className → styled <code> element
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      const lang = className.replace(/language-/, '') || 'text';
      const code = String(children).replace(/\n$/, '');
      return (
        <React.Suspense
          fallback={
            <pre className="my-3 p-3 rounded-lg bg-[#0d0d0d] border border-[#222] text-sm text-white/80 overflow-x-auto font-mono">
              {code}
            </pre>
          }
        >
          <LazyCodeBlock lang={lang} code={code} />
        </React.Suspense>
      );
    }
    return (
      <code
        className="text-[0.8rem] text-champagne/90 bg-champagne/[0.08] px-1.5 py-0.5 rounded font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Pre — stripped. The code component handles everything for code blocks.
  // Without this, react-markdown wraps code blocks in <pre><code>...</code></pre>
  // which would double-wrap our styled code block.
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
    return <>{children}</>;
  },

  // Links — secure, champagne-styled
  a: MentorLink,

  // Tables — minimal, clean (unlikely in mentor responses but handled)
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[#222]">
      <table className="w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-[#111] border-b border-[#222]" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-3 py-2 text-left text-xs font-medium text-champagne/70 uppercase tracking-wider" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-3 py-2 text-white/80 border-t border-[#1a1a1a]" {...props}>
      {children}
    </td>
  ),
};

// ── Main component ──
interface MentorMarkdownProps {
  content: string;
}

export default function MentorMarkdown({ content }: MentorMarkdownProps) {
  // Quick optimization: skip markdown parsing entirely for plain text.
  // Most short mentor responses are simple paragraphs — no need for
  // the react-markdown AST parser to process them.
  // Only triggers on characters that indicate actual markdown syntax.
  const hasMarkdown = useMemo(() => {
    return /[*_`#>\[\-!~|]/.test(content);
  }, [content]);

  if (!hasMarkdown) {
    // Plain text — render identically to the original <p> behavior
    return (
      <p className="text-sm text-white whitespace-pre-wrap leading-relaxed break-words">
        {content}
      </p>
    );
  }

  return (
    <div className="mentor-markdown">
      <Markdown components={mentorComponents}>{content}</Markdown>
    </div>
  );
}