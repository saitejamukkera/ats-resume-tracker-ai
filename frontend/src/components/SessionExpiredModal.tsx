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
      buttonRef.current?.focus();

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/60 animate-fade-in" />

      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-border/60 dark:border-gray-700 w-full max-w-[380px] mx-4 p-6 animate-scale-in">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30 ring-4 ring-amber-50 dark:ring-amber-900/10">
            <Clock size={26} className="text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-1.5">
          Session Timed Out
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed mb-6">
          Your session timed out while you were away. Sign in again to pick up
          right where you left off.
        </p>

        <button
          ref={buttonRef}
          onClick={() => {
            onSaveWork?.();
            onLogin();
          }}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300 shadow-sm shadow-primary-500/20"
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}
