"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

// --- Context ---
interface DropdownContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  menuPosition: { top: number; left: number; placement: "top" | "bottom" };
}

const DropdownContext = createContext<DropdownContextType | null>(null);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error("Dropdown components must be used within a Dropdown.Root");
  }
  return context;
}

// --- Components ---

interface RootProps {
  children: ReactNode;
}

function Root({ children }: RootProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  }>({ top: 0, left: 0, placement: "bottom" });

  const calculatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement = spaceBelow < 250 ? "top" : "bottom";

      setMenuPosition({
        top: placement === "bottom" ? rect.bottom + 8 : rect.top - 8,
        left: rect.left,
        placement,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleScroll = () => setIsOpen(false);
      window.addEventListener("scroll", handleScroll, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", handleScroll);
      return () => {
        window.removeEventListener("scroll", handleScroll, { capture: true });
        window.removeEventListener("resize", handleScroll);
      };
    }
  }, [isOpen]);

  // Close on outside click is handled by the Menu backdrop in this implementation
  // equivalent to the earlier implementation using createPortal overlay

  return (
    <DropdownContext.Provider
      value={{ isOpen, setIsOpen, triggerRef, menuPosition }}
    >
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

interface TriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  hideChevron?: boolean;
}

function Trigger({
  children,
  className = "",
  hideChevron = false,
  ...props
}: TriggerProps) {
  const { isOpen, setIsOpen, triggerRef } = useDropdown();

  return (
    <button
      ref={triggerRef}
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
      }}
      className={`inline-flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
      {!hideChevron && (
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      )}
    </button>
  );
}

interface MenuProps {
  children: ReactNode;
  width?: string;
}

function Menu({ children, width = "w-48" }: MenuProps) {
  const { isOpen, setIsOpen, menuPosition } = useDropdown();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={() => setIsOpen(false)}>
      <div
        className={`absolute ${width} ${menuPosition.placement === "top" ? "-translate-y-full" : ""}`}
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-lg shadow-black/5 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden animate-scale-in origin-top-left py-1">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: React.ElementType;
}

function Item({
  children,
  className = "",
  icon: Icon,
  onClick,
  ...props
}: ItemProps) {
  const { setIsOpen } = useDropdown();

  return (
    <button
      onClick={(e) => {
        onClick?.(e);
        setIsOpen(false);
      }}
      className={`
        w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
        text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800
        ${className}
      `}
      {...props}
    >
      {Icon && <Icon size={16} className="text-gray-400 dark:text-gray-500" />}
      {children}
    </button>
  );
}

export const Dropdown = {
  Root,
  Trigger,
  Menu,
  Item,
};
