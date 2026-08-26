'use client';

import React, { useEffect, RefObject, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

// ─────────────────────────────────────────
// DeleteConfirmModal — extracted from MentorChat (A-1)
// ─────────────────────────────────────────

interface DeleteConfirmModalProps {
  threadId: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onConfirm: (threadId: string) => void;
  onClose: () => void;
}

const DeleteConfirmModal = React.memo(function DeleteConfirmModal({
  threadId,
  modalRef,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const dialogRef = (modalRef as React.RefObject<HTMLDivElement | null>) ?? internalRef;
  useDialogA11y(dialogRef, true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="modal-content-destructive p-8 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
        </div>
        <h3 id="delete-modal-title" className="text-lg font-bold text-white mb-2">Eliminar conversación</h3>
        <p className="text-[#999] mb-6 text-sm leading-relaxed">
          Esta acción eliminará la conversación y todos sus mensajes de forma permanente. No se puede deshacer.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onConfirm(threadId)}
            className="bg-red-500/90 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-red-500 transition-colors text-sm"
          >
            Eliminar
          </button>
          <button
            onClick={onClose}
            className="text-[#999] px-5 py-2.5 hover:text-white transition-colors text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
});

export default DeleteConfirmModal;
