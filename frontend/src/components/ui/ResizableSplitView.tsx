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
        className="w-4 bg-gray-50 dark:bg-zinc-900 border-l border-r border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-col-resize flex items-center justify-center transition-colors shrink-0 z-10"
        onMouseDown={handleMouseDown}
      >
        <GripVertical size={16} className="text-gray-400 dark:text-gray-500" />
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
