"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface DuplicateJobModalProps {
  open: boolean;
  position: string;
  company: string;
  appliedOn: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicateJobModal({
  open,
  position,
  company,
  appliedOn,
  onConfirm,
  onCancel,
}: DuplicateJobModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      document.addEventListener("keydown", handleKey);
      const timer = setTimeout(() => cancelRef.current?.focus(), 100);

      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
        previouslyFocused?.focus();
      };
    }
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Clean overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40"
            onClick={onCancel}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="duplicate-job-title"
            aria-describedby="duplicate-job-message"
            className="modal-surface relative w-full max-w-sm rounded-[6px] border border-border bg-surface-raised p-6 shadow-[0_20px_50px_rgba(24,21,18,0.18)]"
          >
            {/* Icon + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-border bg-warning-bg">
                <AlertTriangle size={18} className="text-warning-text" />
              </div>
              <h3 id="duplicate-job-title" className="font-display text-2xl font-medium text-text-primary">
                Already Applied
              </h3>
            </div>

            {/* Message */}
            <p id="duplicate-job-message" className="mb-5 text-sm leading-relaxed text-text-secondary">
              You already applied for{" "}
              <span className="font-medium text-text-primary">
                {position || "this position"}
              </span>{" "}
              at{" "}
              <span className="font-medium text-text-primary">
                {company || "this company"}
              </span>{" "}
              on{" "}
              <span className="font-medium text-text-primary">
                {appliedOn || "an earlier date"}
              </span>
              . Generate another resume?
            </p>

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                ref={cancelRef}
                onClick={onCancel}
                className="button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="button-primary flex-1"
              >
                Generate Anyway
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
