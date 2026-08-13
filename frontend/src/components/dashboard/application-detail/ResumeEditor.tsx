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
  const lineCount = Math.max(1, (editing ? draft : initialContent || "").split("\n").length);

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
    <div className="resume-editor">
      {hasGeneratedResume && initialContent ? (
        <>
          <div className="resume-editor-toolbar">
            <label>
              {editing ? "Editing LaTeX" : "Generated LaTeX"}
            </label>
            <div className="flex items-center gap-2">
              {saveMsg && (
                <span
                  className={`text-xs font-medium ${saveMsg.type === "success" ? "text-success" : "text-danger"}`}
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
                    className="resume-editor-action"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="button-primary resume-editor-action"
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
                    className="resume-editor-action"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={handleCopy}
                    className="resume-editor-action"
                  >
                    {copied ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="resume-editor-code">
            <div className="resume-editor-lines" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <textarea
              readOnly={!editing}
              className={editing ? "is-editing" : ""}
              value={editing ? draft : initialContent}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Generated LaTeX"
            />
          </div>
        </>
      ) : (
        <div className="editor-empty-state">
          <div className="text-center p-8">
            <FileText
              size={48}
              className="mx-auto mb-4 text-text-muted"
            />
            <p className="mb-2 font-medium text-text-secondary">
              No Resume Generated
            </p>
            <p className="mx-auto max-w-xs text-xs text-text-muted">
              Generate a resume from the New Application page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
