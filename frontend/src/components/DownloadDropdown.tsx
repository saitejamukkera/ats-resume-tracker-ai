"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileText, ChevronDown, Loader2 } from "lucide-react";

interface DownloadDropdownProps {
  onDownloadPdf: () => Promise<void>;
  onDownloadDocx: () => Promise<void>;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
}

export function DownloadDropdown({
  onDownloadPdf,
  onDownloadDocx,
  label = "Download",
  size = "md",
  variant = "primary",
}: DownloadDropdownProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleDownload = async (type: "pdf" | "docx") => {
    setDownloading(type);
    setOpen(false);
    try {
      if (type === "pdf") {
        await onDownloadPdf();
      } else {
        await onDownloadDocx();
      }
    } finally {
      setDownloading(null);
    }
  };

  const isSmall = size === "sm";
  const isPrimary = variant === "primary";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={downloading !== null}
        className={
          isPrimary
            ? `inline-flex items-center justify-center rounded-full font-semibold transition-all btn-primary ${
                isSmall
                  ? "text-xs gap-1 py-1.5 px-3"
                  : "gap-2 py-2 px-5 text-sm shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
              }`
            : `inline-flex items-center justify-center rounded-full font-semibold transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 ${
                isSmall
                  ? "text-xs gap-1 py-1.5 px-3"
                  : "gap-2 py-2 px-4 text-sm"
              }`
        }
      >
        {downloading ? (
          <Loader2 size={isSmall ? 12 : 16} className="animate-spin" />
        ) : (
          <Download size={isSmall ? 12 : 16} />
        )}
        {downloading ? `Downloading ${downloading.toUpperCase()}...` : label}
        <ChevronDown
          size={isSmall ? 10 : 14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 rounded-xl border border-border dark:border-gray-700 shadow-lg z-50 py-1 animate-fade-in text-gray-900 dark:text-white">
          <button
            onClick={() => handleDownload("pdf")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-red-500 dark:text-red-400" />
            </div>
            <div className="text-left">
              <p className="font-medium">PDF</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Best for sharing
              </p>
            </div>
          </button>
          <button
            onClick={() => handleDownload("docx")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              {/* Word Icon SVG */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-blue-600"
              >
                <path
                  d="M14 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7.5L14 4.5z"
                  fill="currentColor"
                  opacity="0.15"
                />
                <path
                  d="M14 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7.5L14 4.5z"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="none"
                />
                <path
                  d="M14 4.5H10.5V1"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="none"
                />
                <text
                  x="5"
                  y="11.5"
                  fontSize="4.5"
                  fontWeight="bold"
                  fill="currentColor"
                >
                  W
                </text>
              </svg>
            </div>
            <div className="text-left">
              <p className="font-medium">Word</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Best for ATS portals
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
