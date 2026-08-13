"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Award,
  FileText,
} from "lucide-react";
import { ApplicationStatus } from "../types/dtos";

interface StatusDropdownProps {
  currentStatus: ApplicationStatus;
  onStatusChange: (status: ApplicationStatus) => void;
}

const statusConfig = {
  [ApplicationStatus.ACTIVE]: {
    label: "Active",
    icon: CheckCircle2,
    colorClass: "status-active",
  },
  [ApplicationStatus.IN_PROCESS]: {
    label: "In Process",
    icon: Clock,
    colorClass: "status-progress",
  },
  [ApplicationStatus.REJECTED]: {
    label: "Rejected",
    icon: XCircle,
    colorClass: "status-rejected",
  },
  [ApplicationStatus.OFFER_RECEIVED]: {
    label: "Offer Received",
    icon: Award,
    colorClass: "status-offer",
  },
  [ApplicationStatus.DRAFT]: {
    label: "Draft",
    icon: FileText,
    colorClass: "status-draft",
  },
};

export function StatusDropdown({
  currentStatus,
  onStatusChange,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    placement: "bottom",
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Update position when opening
  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement = spaceBelow < 250 ? "top" : "bottom";

      setMenuPosition({
        top: placement === "bottom" ? rect.bottom + 8 : rect.top - 8,
        left: rect.left,
        placement,
      });
    }
    setIsOpen(!isOpen);
  };

  // Close on window resize/scroll to avoid detached menu
  useEffect(() => {
    if (!isOpen) return;
    const currentIndex = Object.values(ApplicationStatus).indexOf(currentStatus);
    window.requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']");
      items?.[Math.max(0, currentIndex)]?.focus();
    });
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
  }, [isOpen, currentStatus]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") || []);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(currentIndex + direction + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  const currentConfig =
    statusConfig[currentStatus] || statusConfig[ApplicationStatus.ACTIVE];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        aria-label={`Change status from ${currentConfig.label}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`status-control ${currentConfig.colorClass}`}
      >
        <span>{currentConfig.label}</span>
      </button>

      {isOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-9999"
            onClick={() => setIsOpen(false)}
          >
            <div
              className={`absolute ${menuPosition.placement === "top" ? "-translate-y-full" : ""}`}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              <div
                ref={menuRef}
                role="menu"
                aria-label="Application status"
                className="surface-raised w-48 overflow-hidden rounded-[6px] animate-scale-in origin-top-left"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleMenuKeyDown}
              >
                <div className="py-1">
                  {Object.values(ApplicationStatus).map((status) => {
                    const config = statusConfig[status];
                    const Icon = config.icon;
                    const isSelected = currentStatus === status;

                    return (
                      <button
                        key={status}
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => {
                          onStatusChange(status);
                          setIsOpen(false);
                        }}
                        className={`
                        w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
                        ${isSelected ? "bg-primary-50 text-primary-700" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"}
                      `}
                      >
                        <Icon
                          size={16}
                          className={
                            isSelected
                              ? "text-primary-600"
                              : "text-text-muted"
                          }
                        />
                        <span className={isSelected ? "font-medium" : ""}>
                          {config.label}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="ml-auto text-primary-600" size={14} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
