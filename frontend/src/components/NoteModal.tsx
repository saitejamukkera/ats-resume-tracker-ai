import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StickyNote, CornerDownRight, Trash2 } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { JobApplicationResponse } from "../types/dtos";

interface NotePopoverProps {
  application: JobApplicationResponse;
  onSave: (note: string) => Promise<void>;
  triggerButton: React.ReactNode;
}

export function NotePopover({
  application,
  onSave,
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
        <div
          className="inline-block relative cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {triggerButton}
        </div>
      </Popover.Trigger>

      <AnimatePresence>
        {isOpen && (
          <Popover.Portal forceMount>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={8}
              asChild
              className="z-50 w-80 bg-white dark:bg-zinc-900 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-zinc-800 flex flex-col overflow-hidden outline-none"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/20">
                  <StickyNote
                    size={14}
                    className="text-primary-600 dark:text-primary-400"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Quick Note
                  </span>
                </div>

                <div className="p-3">
                  <textarea
                    ref={textareaRef}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Type your note here..."
                    className="w-full h-32 p-3 text-sm transition-all border rounded-lg bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:text-gray-100 resize-none placeholder-gray-400 dark:placeholder-gray-500"
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
                            <span className="text-xs text-gray-500 mr-1 dark:text-gray-400">
                              Sure?
                            </span>
                            <button
                              onClick={handleDelete}
                              disabled={isSaving}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setIsConfirmingDelete(false)}
                              disabled={isSaving}
                              className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-gray-500 outline-none"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsConfirmingDelete(true)}
                            disabled={isSaving}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            title="Delete note"
                          >
                            <Trash2 size={16} />
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsOpen(false)}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
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
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
