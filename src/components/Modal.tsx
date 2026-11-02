/** Minimal accessible modal overlay shared by How-To-Play, Stats, and Results dialogs. */
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
