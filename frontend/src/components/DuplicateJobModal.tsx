"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, Sparkles, Trash2 } from "lucide-react";

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

  // Lock body scroll and handle Escape
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      document.addEventListener("keydown", handleKey);

      // Focus cancel button after animation
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
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] sm:pt-[22vh]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/25 backdrop-blur-md"
            onClick={onCancel}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 30, scale: 0.95, rotateX: 4 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="relative w-full max-w-md mx-4 rounded-3xl border border-amber-200/60 dark:border-amber-800/40 shadow-2xl shadow-amber-900/10 dark:shadow-amber-950/30 overflow-hidden"
            style={{ perspective: 1000 }}
          >
            {/* Warm gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/80 to-rose-50/60 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/20" />

            {/* Decorative blurred orbs */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-300/20 dark:bg-amber-500/10 blur-2xl" />
            <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full bg-orange-300/20 dark:bg-orange-500/10 blur-2xl" />

            {/* Content */}
            <div className="relative p-7 sm:p-8">
              {/* Close button */}
              <button
                onClick={onCancel}
                className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>

              {/* Icon with glow */}
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-amber-400/30 dark:bg-amber-500/20 blur-lg scale-125" />
                  <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30 border border-amber-200/60 dark:border-amber-700/30 flex items-center justify-center shadow-sm">
                    <AlertCircle
                      size={26}
                      className="text-amber-600 dark:text-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-extrabold text-center text-gray-900 dark:text-white tracking-tight mb-2">
                Already Applied
              </h3>

              {/* Message */}
              <div className="text-center space-y-1 mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  This job,{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {position || "Unknown Position"}
                  </span>{" "}
                  at{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {company || "Unknown Company"}
                  </span>
                  , has already been applied on{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {appliedOn || "an unknown date"}
                  </span>
                  .
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to generate a resume again?
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button
                  ref={cancelRef}
                  onClick={onCancel}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-zinc-800/60 border border-gray-200/60 dark:border-gray-700/40 hover:bg-white dark:hover:bg-zinc-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm"
                >
                  <Trash2 size={15} />
                  No, Clear JD
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 dark:from-amber-600 dark:to-orange-600 dark:hover:from-amber-500 dark:hover:to-orange-500 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all"
                >
                  <Sparkles size={15} />
                  Yes, Generate Again
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
