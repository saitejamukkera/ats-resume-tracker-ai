"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

const TOAST_DURATION: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3500,
};

const TOAST_STYLES: Record<
  ToastType,
  { className: string; icon: typeof CheckCircle }
> = {
  success: {
    className: "toast-success",
    icon: CheckCircle,
  },
  error: {
    className: "toast-error",
    icon: XCircle,
  },
  warning: {
    className: "toast-warning",
    icon: AlertTriangle,
  },
  info: {
    className: "toast-info",
    icon: Info,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), TOAST_DURATION[type]);
    },
    [removeToast],
  );

  const toast = {
    success: (message: string) => addToast("success", message),
    error: (message: string) => addToast("error", message),
    warning: (message: string) => addToast("warning", message),
    info: (message: string) => addToast("info", message),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-9999 flex flex-col gap-2 pointer-events-none" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className={`toast-surface ${style.className} pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[6px] border animate-slide-in-right min-w-70 max-w-105`}
            >
              <Icon size={18} className="shrink-0" />
              <p className="flex-1 text-sm font-medium">
                {t.message}
              </p>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context.toast;
}
