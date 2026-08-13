"use client";

import { useEffect, useRef, useEffectEvent } from "react";
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
    button: "bg-danger text-white",
    iconBg: "bg-danger-bg",
    iconColor: "text-danger",
  },
  warning: {
    button: "bg-warning text-white",
    iconBg: "bg-warning-bg",
    iconColor: "text-warning-text",
  },
  default: {
    button:
      "bg-primary-600 hover:bg-primary-700 focus:ring-primary-300 text-white",
    iconBg: "bg-primary-50",
    iconColor: "text-primary-600",
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
  const cancelFromEffect = useEffectEvent(onCancel);

  // Focus cancel button on open, handle Escape, lock body scroll
  useEffect(() => {
    if (open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      cancelRef.current?.focus();

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancelFromEffect();
      };
      document.addEventListener("keydown", handleKey);
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = originalOverflow;
        previouslyFocused?.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 dark:bg-black/60 animate-fade-in"
        onClick={onCancel}
      />

      {/* Modal */}
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="modal-surface relative mx-4 w-full max-w-100 rounded-[6px] border border-border bg-surface-raised p-6 shadow-[0_20px_50px_rgba(24,21,18,0.18)] animate-scale-in">
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-[4px] border border-border ${styles.iconBg}`}
          >
            <Icon size={22} className={styles.iconColor} />
          </div>
        </div>

        {/* Content */}
        <h2 id="confirm-title" className="font-display text-2xl font-medium text-center mb-2">
          {title}
        </h2>
        <p id="confirm-message" className="text-sm text-text-secondary text-center leading-relaxed mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="button-secondary flex-1"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 min-h-11 rounded-[6px] px-4 text-sm font-semibold transition-colors ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
