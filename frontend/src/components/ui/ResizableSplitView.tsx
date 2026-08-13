"use client";

import { useState, useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

interface ResizableSplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftWidth?: number; // percentage
  minLeftWidth?: number; // percentage
  maxLeftWidth?: number; // percentage
}

export default function ResizableSplitView({
  left,
  right,
  initialLeftWidth = 50,
  minLeftWidth = 20,
  maxLeftWidth = 80,
}: ResizableSplitViewProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth =
        ((e.clientX - containerRect.left) / containerRect.width) * 100;

      if (newLeftWidth >= minLeftWidth && newLeftWidth <= maxLeftWidth) {
        setLeftWidth(newLeftWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minLeftWidth, maxLeftWidth, isDragging]);

  const handleMouseDown = () => {
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -2 : 2;
    setLeftWidth((current) => Math.min(maxLeftWidth, Math.max(minLeftWidth, current + direction)));
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden relative"
    >
      <div
        style={{ width: `${leftWidth}%` }}
        className="h-full overflow-hidden"
      >
        {left}
      </div>

      <div
        className="z-10 flex w-4 shrink-0 cursor-col-resize items-center justify-center border-x border-border bg-surface-muted transition-colors hover:bg-background-alt"
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        role="separator"
        aria-label="Resize resume and preview panels"
        aria-orientation="vertical"
        aria-valuemin={minLeftWidth}
        aria-valuemax={maxLeftWidth}
        aria-valuenow={Math.round(leftWidth)}
        tabIndex={0}
      >
        <GripVertical size={16} className="text-text-muted" />
      </div>

      <div
        style={{ width: `${100 - leftWidth}%` }}
        className="h-full overflow-hidden"
      >
        {right}
      </div>

      {/* Overlay to prevent iframe interference during drag */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-transparent cursor-col-resize" />
      )}
    </div>
  );
}
