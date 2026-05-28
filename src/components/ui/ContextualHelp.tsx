'use client';

import { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';
import { useProgressiveDisclosure } from '@/hooks/useProgressiveDisclosure';

// ═══════════════════════════════════════════
// ContextualHelp — progressive disclosure tip
// ═══════════════════════════════════════════
//
// Inspired by Notion, Headspace, Arc:
//   Level 1 (full):    Banner with title + text + dismiss
//   Level 2 (compact): Subtle info icon, shows text on hover/focus
//   Level 3 (hidden):  Nothing visible, small ? icon to re-open
//
// The user can always re-access help. Discoverability
// is never lost — it just gets quieter with familiarity.
//
// Usage (identical to before):
//   <ContextualHelp
//     storageKey="vitazen_help_habits"
//     title="Mis Hábitos"
//     text="Crea hábitos y márcalos como completados cada día."
//   />

interface ContextualHelpProps {
  storageKey: string;
  title: string;
  text: string;
}

export default function ContextualHelp({ storageKey, title, text }: ContextualHelpProps) {
  const { level, dismiss, reshown, ready } = useProgressiveDisclosure(storageKey);
  const [showFull, setShowFull] = useState(false);
  const [hovering, setHovering] = useState(false);

  // When progressive disclosure says "full" (level 1), show the banner
  // after a short delay — same as the original behavior
  useEffect(() => {
    if (ready && level === 1) {
      const timer = setTimeout(() => setShowFull(true), 600);
      return () => clearTimeout(timer);
    } else {
      setShowFull(false);
    }
  }, [ready, level]);

  // ─── Level 3 (hidden): tiny ? icon to re-engage ───
  // Only visible when level=3 and not reshown. Extremely subtle.
  if (ready && level === 3 && !showFull) {
    return (
      <button
        onClick={() => { reshown(); }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[#333] hover:text-champagne/60 hover:bg-champagne/5 transition-colors"
        aria-label={`Ayuda: ${title}`}
        title={title}
      >
        <span className="text-[9px] font-medium leading-none">?</span>
      </button>
    );
  }

  // ─── Level 2 (compact): info icon with hover tooltip ───
  if (ready && level === 2 && !showFull) {
    return (
      <div
        className="relative inline-flex"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
      >
        <button
          onClick={() => setShowFull(true)}
          className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-champagne/5 text-champagne/40 hover:text-champagne/70 hover:bg-champagne/10 transition-colors"
          aria-label={`Ayuda: ${title}`}
        >
          <Info size={12} />
        </button>

        {/* Hover/focus tooltip — compact text preview */}
        {hovering && (
          <div className="absolute left-0 top-8 z-20 w-56 bg-[#111] border border-[#222] rounded-lg px-3 py-2 shadow-lg animate-in pointer-events-none">
            <p className="text-[11px] text-[#888] leading-relaxed">{text}</p>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              className="text-[9px] text-[#444] hover:text-[#666] mt-1.5 transition-colors"
            >
              No mostrar más
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Level 1 (full): banner with title + text + dismiss ───
  // Same visual as the original, now with progressive disclosure
  if (showFull) {
    return (
      <div className="relative flex items-start gap-3 bg-[#0a0a0a] border border-champagne/15 rounded-xl px-4 py-3.5 animate-in">
        <div className="w-7 h-7 rounded-lg bg-champagne/10 flex items-center justify-center shrink-0 mt-0.5">
          <Info size={14} className="text-champagne" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-champagne mb-0.5">{title}</p>
          <p className="text-[11px] text-[#888] leading-relaxed">{text}</p>
        </div>
        <button
          onClick={() => { setShowFull(false); dismiss(); }}
          className="shrink-0 p-1 rounded-lg text-[#555] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          aria-label="Cerrar ayuda"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Not ready yet (SSR) — render nothing
  return null;
}
