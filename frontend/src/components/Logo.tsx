"use client";

interface LogoProps {
  size?: "xs" | "sm" | "lg";
  showSubtitle?: boolean;
  className?: string;
}

const sizes = {
  xs: {
    container: "w-7 h-7",
    inner: "w-[13px] h-[13px]",
    rounded: "rounded-lg",
    shadow: "shadow-md shadow-primary-500/20",
    text: "text-sm",
  },
  sm: {
    container: "w-9 h-9",
    inner: "w-[17px] h-[17px]",
    rounded: "rounded-xl",
    shadow: "shadow-lg shadow-primary-500/25",
    text: "text-sm",
  },
  lg: {
    container: "w-10 h-10",
    inner: "w-5 h-5",
    rounded: "rounded-xl",
    shadow: "shadow-lg shadow-primary-500/30",
    text: "text-xl",
  },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="3.5" y="9.5" width="25" height="19" rx="2.5" fill="white" />
      <path
        d="M10.5 10V6.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2V10"
        fill="none"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect
        x="7"
        y="20"
        width="12"
        height="1.5"
        rx="0.75"
        fill="white"
        fillOpacity={0.5}
      />
      <path
        d="M27 2L27.6 3.5L29.5 4L27.6 4.5L27 6L26.4 4.5L24.5 4L26.4 3.5Z"
        fill="white"
        fillOpacity={0.75}
      />
    </svg>
  );
}

export function Logo({
  size = "lg",
  showSubtitle = false,
  className = "",
}: LogoProps) {
  const s = sizes[size];

  return (
    <div className={`inline-flex items-center gap-3 group ${className}`}>
      <div
        className={`${s.container} ${s.rounded} bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center ${s.shadow} transition-all duration-300 group-hover:scale-105`}
      >
        <LogoIcon className={s.inner} />
      </div>
      <div className="flex flex-col">
        <span
          className={`${s.text} font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400`}
        >
          TrackHire AI
        </span>
        {showSubtitle && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
            Job Application Manager
          </span>
        )}
      </div>
    </div>
  );
}
