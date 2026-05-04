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
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-6"
          >
            {/* Icon + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Already Applied
              </h3>
            </div>

            {/* Message */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
              You already applied for{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {position || "this position"}
              </span>{" "}
              at{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {company || "this company"}
              </span>{" "}
              on{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {appliedOn || "an earlier date"}
              </span>
              . Generate another resume?
            </p>

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                ref={cancelRef}
                onClick={onCancel}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-neutral-800 dark:bg-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-zinc-200 transition-colors"
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
