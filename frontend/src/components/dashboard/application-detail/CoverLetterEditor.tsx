"use client";

import { useState } from "react";
import { Mail, Pencil, Copy, Check, X, Save } from "lucide-react";
import { api } from "../../../lib/api";
import { DownloadDropdown } from "../../DownloadDropdown";

interface CoverLetterEditorProps {
  applicationId: number;
  initialContent: string | null;
  hasCoverLetter: boolean;
  onContentUpdate: (newContent: string) => void;
  onDownloadPdf: () => Promise<void>;
  onDownloadDocx: () => Promise<void>;
}

export function CoverLetterEditor({
  applicationId,
  initialContent,
  hasCoverLetter,
  onContentUpdate,
  onDownloadPdf,
  onDownloadDocx,
}: CoverLetterEditorProps) {
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
      await api.resumes.updateContent(applicationId, null, draft);
      onContentUpdate(draft);
      setEditing(false);
      setSaveMsg({ type: "success", text: "Cover Letter saved" });
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save cover letter" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  return (
    <div className="cover-letter-editor">
      {hasCoverLetter && initialContent ? (
        <>
          <div className="resume-editor-toolbar">
            <label>
              {editing ? "Editing Cover Letter" : "Generated Cover Letter"}
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
                  <DownloadDropdown
                    onDownloadPdf={onDownloadPdf}
                    onDownloadDocx={onDownloadDocx}
                    label="Download"
                    size="sm"
                    variant="ghost"
                  />
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
          {editing ? (
            <textarea
              className="cover-letter-textarea"
              value={editing ? draft : initialContent}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <div className="cover-letter-document">
              <div className="whitespace-pre-wrap break-words">
                {initialContent}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="editor-empty-state">
          <div className="text-center p-8">
            <Mail
              size={48}
              className="mx-auto mb-4 text-text-muted"
            />
            <p className="mb-2 font-medium text-text-secondary">
              No Cover Letter Generated
            </p>
            <p className="mx-auto max-w-xs text-xs text-text-muted">
              Set up your profile in Settings to enable personalized cover
              letters.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
