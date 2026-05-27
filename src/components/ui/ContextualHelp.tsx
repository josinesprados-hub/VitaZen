'use client';

import { useEffect, useState } from 'react';
import { X, Info } from 'lucide-react';

// ─────────────────────────────────────────
// ContextualHelp — lightweight first-visit tip
// ─────────────────────────────────────────
//
// Shows a small, dismissible tip the first
// time a user visits a section. Persists
// dismissal in localStorage. Never blocks,
// never uses large modals.
//
// Usage:
//   <ContextualHelp
//     storageKey="vitazen_help_habits"
//     title="Mis Hábitos"
//     text="Crea hábitos y márcalos como completados cada día. La racha crece con la consistencia."
//   />

interface ContextualHelpProps {
  storageKey: string;
  title: string;
  text: string;
}

export default function ContextualHelp({ storageKey, title, text }: ContextualHelpProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(storageKey);
      if (!dismissed) {
        // Small delay so the page renders first, then the tip fades in
        const timer = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable — skip tip silently
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

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
        onClick={dismiss}
        className="shrink-0 p-1 rounded-lg text-[#555] hover:text-white hover:bg-[#1a1a1a] transition-colors"
        aria-label="Cerrar ayuda"
      >
        <X size={14} />
      </button>
    </div>
  );
}
