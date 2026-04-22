"use client";

import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";

interface SessionExpiredModalProps {
  open: boolean;
  onLogin: () => void;
}

export function SessionExpiredModal({ open, onLogin }: SessionExpiredModalProps) {
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-border/60 dark:border-gray-700 w-full max-w-[380px] mx-4 p-6 animate-scale-in">
        {/* Animated icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30 ring-4 ring-amber-50 dark:ring-amber-900/10">
            <ShieldAlert size={26} className="text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-1.5">
          Session Expired
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed mb-6">
          Your session has ended for security reasons. Please sign in again to
          continue where you left off.
        </p>

        {/* Action */}
        <button
          ref={buttonRef}
          onClick={onLogin}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300 shadow-sm shadow-primary-500/20"
        >
          Sign In Again
        </button>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-3">
          Don&apos;t worry — your unsaved work is safe.
        </p>
      </div>
    </div>
  );
}
