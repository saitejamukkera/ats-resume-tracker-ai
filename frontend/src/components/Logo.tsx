"use client";

import { BriefcaseBusiness } from "lucide-react";

interface LogoProps {
  size?: "xs" | "sm" | "lg";
  showSubtitle?: boolean;
  className?: string;
  iconOnly?: boolean;
}

const sizes = {
  xs: { icon: 17, text: "text-[18px]", subtitle: "text-[10px]" },
  sm: { icon: 18, text: "text-[20px]", subtitle: "text-[11px]" },
  lg: { icon: 20, text: "text-[24px]", subtitle: "text-xs" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-border text-primary-600 ${className ?? ""}`}
      aria-hidden="true"
    >
      <BriefcaseBusiness size={17} strokeWidth={1.65} />
    </span>
  );
}

export function Logo({
  size = "lg",
  showSubtitle = false,
  className = "",
  iconOnly = false,
}: LogoProps) {
  const style = sizes[size];

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2.5 text-text-primary ${className}`}
      translate="no"
    >
      {iconOnly && <LogoIcon />}
      {!iconOnly && (
        <span className="flex min-w-0 flex-col">
          <span
            className={`${style.text} font-display font-medium leading-none tracking-[-0.025em]`}
          >
            TrackHire AI
          </span>
          {showSubtitle && (
            <span
              className={`${style.subtitle} mt-1 font-medium leading-none text-text-muted`}
            >
              Job Application Manager
            </span>
          )}
        </span>
      )}
    </span>
  );
}
