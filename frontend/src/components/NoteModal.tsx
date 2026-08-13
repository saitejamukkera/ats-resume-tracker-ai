import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StickyNote, CornerDownRight, Trash2 } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { JobApplicationResponse } from "../types/dtos";

interface NotePopoverProps {
  application: JobApplicationResponse;
  onSave: (note: string) => Promise<void>;
  onDeleteApplication?: () => void;
  triggerButton: React.ReactNode;
}

export function NotePopover({
  application,
  onSave,
  onDeleteApplication,
  triggerButton,
}: NotePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [noteContent, setNoteContent] = useState(application.note || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNoteContent(application.note || "");
      setIsConfirmingDelete(false);
      // Small delay to ensure the content is mounted before focusing
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen, application.note]);

  const handleSave = async () => {
    if (!noteContent.trim()) {
      textareaRef.current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(noteContent.trim());
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await onSave("");
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        {triggerButton}
      </Popover.Trigger>

      <AnimatePresence>
        {isOpen && (
          <Popover.Portal forceMount>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={8}
              asChild
              className="surface-raised z-50 flex w-80 flex-col overflow-hidden outline-none"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-3">
                  <StickyNote
                    size={14}
                    className="text-primary-600 dark:text-primary-400"
                  />
                  <span className="text-sm font-medium text-text-primary">
                    Quick Note
                  </span>
                </div>

                <div className="p-3">
                  <a
                    href={`/applications/${application.id}`}
                    className="mb-3 block min-h-10 border-b border-border pb-3 text-sm font-medium text-primary-600"
                  >
                    View application
                  </a>
                  <textarea
                    ref={textareaRef}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Type your note here…"
                    className="field h-32 resize-none p-3 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                  />
                  <div className="flex justify-between items-center mt-3">
                    <div>
                      {application.note &&
                        (isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <span className="mr-1 text-xs text-text-muted">
                              Sure?
                            </span>
                            <button
                              onClick={handleDelete}
                              disabled={isSaving}
                              className="min-h-9 rounded-[5px] bg-danger px-3 text-xs font-medium text-white disabled:opacity-50"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setIsConfirmingDelete(false)}
                              disabled={isSaving}
                              className="button-secondary min-h-9 px-3 py-1 text-xs disabled:opacity-50"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsConfirmingDelete(true)}
                            disabled={isSaving}
                            className="icon-button text-text-muted hover:text-danger disabled:opacity-50"
                            aria-label="Delete note"
                          >
                            <Trash2 size={16} />
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsOpen(false)}
                        disabled={isSaving}
                        className="button-quiet min-h-9 px-3 py-1 text-sm disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`button-primary min-h-9 px-3 py-1 text-sm ${
                          !noteContent.trim() || isSaving
                            ? "bg-primary-400 opacity-50 cursor-not-allowed"
                            : "bg-primary-600 hover:bg-primary-700"
                        }`}
                      >
                        {isSaving ? "Saving..." : "Save"}
                        {!isSaving && <CornerDownRight size={14} />}
                      </button>
                    </div>
                  </div>
                  {onDeleteApplication && (
                    <button
                      type="button"
                      className="mt-3 flex min-h-10 w-full items-center gap-2 border-t border-border pt-3 text-sm font-medium text-danger"
                      onClick={() => {
                        setIsOpen(false);
                        onDeleteApplication();
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Delete application
                    </button>
                  )}
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
