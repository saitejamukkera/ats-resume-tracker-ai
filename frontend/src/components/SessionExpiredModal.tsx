"use client";

import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";

interface SessionExpiredModalProps {
  open: boolean;
  onLogin: () => void;
  onSaveWork?: () => void;
}

export function SessionExpiredModal({ open, onLogin, onSaveWork }: SessionExpiredModalProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      buttonRef.current?.focus();

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalOverflow;
        previouslyFocused?.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/60 animate-fade-in" />

      <div role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title" aria-describedby="session-expired-message" className="modal-surface relative mx-4 w-full max-w-[380px] rounded-[6px] border border-border bg-surface-raised p-6 shadow-[0_20px_50px_rgba(24,21,18,0.18)] animate-scale-in">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[4px] border border-border bg-warning-bg">
            <Clock size={24} className="text-warning-text" />
          </div>
        </div>

        <h3 id="session-expired-title" className="mb-2 text-center font-display text-2xl font-medium text-text-primary">
          Session Timed Out
        </h3>
        <p id="session-expired-message" className="mb-6 text-center text-sm leading-relaxed text-text-secondary">
          Your session timed out while you were away. Sign in again to pick up
          right where you left off.
        </p>

        <button
          ref={buttonRef}
          onClick={() => {
            onSaveWork?.();
            onLogin();
          }}
          className="button-primary w-full"
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}
