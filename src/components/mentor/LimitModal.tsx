'use client';

import React, { RefObject } from 'react';
import { Circle } from 'lucide-react';
import Link from 'next/link';

// ─────────────────────────────────────────
// LimitModal — extracted from MentorChat (A-1)
// ─────────────────────────────────────────

interface LimitModalProps {
  modalRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

const LimitModal = React.memo(function LimitModal({ modalRef, onClose }: LimitModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-modal-title"
        className="modal-content bg-[#0a0a0a] border border-champagne/20 rounded-2xl max-w-md w-full overflow-hidden context-menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-champagne/8 flex items-center justify-center mx-auto mb-5">
            <Circle size={5} fill="currentColor" className="text-champagne/40" aria-hidden="true" />
          </div>

          <h3 id="limit-modal-title" className="text-xl font-bold text-white mb-2">
            Tu ritmo de hoy se ha completado
          </h3>
          <p className="text-[#999] mb-6 text-sm leading-relaxed">
            Has conversado lo que corresponde a hoy. Si quieres seguir profundizando, hay un camino.
          </p>

          <div className="space-y-3 mb-6 text-left">
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
              <p className="text-xs text-[#999] font-medium mb-0.5">Conversaciones sin límite diario</p>
              <p className="text-[10px] text-[#888]">El mentor está cuando lo necesitas</p>
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3.5">
              <p className="text-xs text-[#999] font-medium mb-0.5">Memoria que acumula contexto</p>
              <p className="text-[10px] text-[#888]">Cada conversación profundiza la anterior</p>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href="/elite"
              className="block w-full bg-champagne/10 border border-champagne/20 text-champagne font-medium py-3 rounded-xl hover:bg-champagne/15 transition-colors text-sm text-center"
              onClick={onClose}
            >
              <span className="flex items-center justify-center gap-2">
                <Circle size={4} fill="currentColor" aria-hidden="true" />
                Conocer Élite
              </span>
            </Link>
            <button
              onClick={onClose}
              className="w-full text-[#888] py-2.5 hover:text-[#999] transition-colors text-sm"
            >
              Volver mañana
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default LimitModal;
