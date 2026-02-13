import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Award,
  ChevronDown,
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
    colorClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    dotClass: "bg-emerald-500",
  },
  [ApplicationStatus.IN_PROCESS]: {
    label: "In Process",
    icon: Clock,
    colorClass: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
    dotClass: "bg-blue-500",
  },
  [ApplicationStatus.REJECTED]: {
    label: "Rejected",
    icon: XCircle,
    colorClass: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
    dotClass: "bg-red-500",
  },
  [ApplicationStatus.OFFER_RECEIVED]: {
    label: "Offer Received",
    icon: Award,
    colorClass:
      "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
    dotClass: "bg-violet-500",
  },
  [ApplicationStatus.DRAFT]: {
    label: "Draft",
    icon: FileText,
    colorClass: "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
    dotClass: "bg-gray-500",
  },
};

export function StatusDropdown({
  currentStatus,
  onStatusChange,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    placement: "bottom",
  });

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
    const handleScroll = () => setIsOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  const currentConfig =
    statusConfig[currentStatus] || statusConfig[ApplicationStatus.ACTIVE];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500
          ${currentConfig.colorClass}
          ${isOpen ? "ring-2 ring-primary-200 ring-offset-1" : ""}
        `}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${currentConfig.dotClass}`}
        />
        <span className="min-w-[80px] text-left">{currentConfig.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999]"
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
                className="w-48 rounded-xl bg-white/95 backdrop-blur-md shadow-lg shadow-black/8 border border-gray-200/60 overflow-hidden animate-scale-in origin-top-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="py-1">
                  {Object.values(ApplicationStatus).map((status) => {
                    const config = statusConfig[status];
                    const Icon = config.icon;
                    const isSelected = currentStatus === status;

                    return (
                      <button
                        key={status}
                        onClick={() => {
                          onStatusChange(status);
                          setIsOpen(false);
                        }}
                        className={`
                        w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
                        ${isSelected ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"}
                      `}
                      >
                        <Icon
                          size={16}
                          className={
                            isSelected ? "text-primary-600" : "text-gray-400"
                          }
                        />
                        <span className={isSelected ? "font-medium" : ""}>
                          {config.label}
                        </span>
                        {isSelected && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
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
