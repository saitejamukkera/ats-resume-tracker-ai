"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Dropdown } from "./ui/Dropdown";

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
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  const handleDownload = async (type: "pdf" | "docx") => {
    setDownloading(type);
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
    <Dropdown.Root>
      <Dropdown.Trigger
        disabled={downloading !== null}
        className={
          isPrimary
            ? `button-primary font-semibold ${
                isSmall
                  ? "min-h-9 px-3 py-1.5 text-xs"
                  : "px-5 py-2 text-sm"
              }`
            : `button-quiet font-semibold ${
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
      </Dropdown.Trigger>

      <Dropdown.Menu width="w-56">
        <Dropdown.Item onClick={() => handleDownload("pdf")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border text-danger">
            <FileText size={16} />
          </div>
          <div className="text-left">
            <p className="font-medium text-text-primary">PDF</p>
            <p className="text-[10px] text-text-muted">
              Best for sharing
            </p>
          </div>
        </Dropdown.Item>

        <Dropdown.Item onClick={() => handleDownload("docx")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border text-info">
            {/* Word Icon SVG */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-info"
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
            <p className="font-medium text-text-primary">Word</p>
            <p className="text-[10px] text-text-muted">
              Best for ATS portals
            </p>
          </div>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
