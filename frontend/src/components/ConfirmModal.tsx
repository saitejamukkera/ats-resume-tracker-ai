"use client";

import { useEffect, useRef, useCallback } from "react";
import { AlertTriangle, LogOut } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  icon?: "delete" | "logout";
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: {
    button: "bg-red-600 hover:bg-red-700 focus:ring-red-300 text-white",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  warning: {
    button: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-300 text-white",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  default: {
    button:
      "bg-primary-600 hover:bg-primary-700 focus:ring-primary-300 text-white",
    iconBg: "bg-primary-100 dark:bg-primary-900/30",
    iconColor: "text-primary-600 dark:text-primary-400",
  },
};

const ICONS = {
  delete: AlertTriangle,
  logout: LogOut,
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  icon = "delete",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const styles = VARIANT_STYLES[variant];
  const Icon = ICONS[icon];

  // Stable reference to onCancel for the escape key handler
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus cancel button on open, handle Escape, lock body scroll
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancelRef.current();
      };
      document.addEventListener("keydown", handleKey);
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-border/60 dark:border-gray-700 w-full max-w-100 mx-4 p-6 animate-scale-in">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.iconBg}`}
          >
            <Icon size={22} className={styles.iconColor} />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
