"use client";

import { useState } from "react";
import { FileText, Pencil, Copy, Check, X, Save } from "lucide-react";
import { api } from "../../../lib/api";

interface ResumeEditorProps {
  applicationId: number;
  initialContent: string | null;
  hasGeneratedResume: boolean;
  onContentUpdate: (newContent: string) => void;
}

export function ResumeEditor({
  applicationId,
  initialContent,
  hasGeneratedResume,
  onContentUpdate,
}: ResumeEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialContent || "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!initialContent) return;
    await navigator.clipboard.writeText(initialContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.resumes.updateContent(applicationId, draft, null);
      onContentUpdate(draft);
      setEditing(false);
      setSaveMsg({ type: "success", text: "Resume saved" });
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save resume" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {hasGeneratedResume && initialContent ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {editing ? "Editing LaTeX" : "Generated LaTeX"}
            </label>
            <div className="flex items-center gap-2">
              {saveMsg && (
                <span
                  className={`text-xs font-medium ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}
                >
                  {saveMsg.text}
                </span>
              )}
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setDraft(initialContent);
                      setSaveMsg(null);
                    }}
                    className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold gap-1.5 inline-flex items-center transition-all"
                  >
                    <Save size={14} /> {saving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setDraft(initialContent);
                      setEditing(true);
                      setSaveMsg(null);
                    }}
                    className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                  >
                    {copied ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            readOnly={!editing}
            className={`flex-1 w-full px-4 py-3 border rounded-2xl font-mono text-xs resize-none transition-colors focus:outline-none ${
              editing
                ? "bg-white dark:bg-zinc-900 border-primary-300 dark:border-primary-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900/30"
                : "bg-gray-50/80 dark:bg-zinc-800/50 border-gray-200/60 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
            }`}
            value={editing ? draft : initialContent}
            onChange={(e) => setDraft(e.target.value)}
          />
        </>
      ) : (
        <div className="flex-1 bg-gray-50/80 dark:bg-zinc-800/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 flex items-center justify-center">
          <div className="text-center p-8">
            <FileText
              size={48}
              className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
            />
            <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">
              No Resume Generated
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
              Generate a resume from the New Application page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
