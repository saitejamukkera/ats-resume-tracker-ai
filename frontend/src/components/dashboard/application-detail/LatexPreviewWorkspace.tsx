"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, RotateCcw, Save, X } from "lucide-react";
import { api } from "../../../lib/api";
import type { PdfSyncDiagnostic, PdfSyncMapEntry } from "../../../types/dtos";
import ResizableSplitView from "../../ui/ResizableSplitView";
import {
  LatexEditor,
  type LatexEditorHandle,
} from "./LatexEditor";
import { SyncedPdfViewer } from "./SyncedPdfViewer";

interface CachedPdfSyncPreview {
  pdfBase64: string | null;
  syncMap: PdfSyncMapEntry[];
  diagnostics: PdfSyncDiagnostic[];
}

const pdfSyncPreviewCache = new Map<string, CachedPdfSyncPreview>();

interface LatexPreviewWorkspaceProps {
  applicationId: number;
  initialContent: string | null;
  hasGeneratedResume: boolean;
  onContentUpdate: (newContent: string) => void;
}

export function LatexPreviewWorkspace({
  applicationId,
  initialContent,
  hasGeneratedResume,
  onContentUpdate,
}: LatexPreviewWorkspaceProps) {
  const editorRef = useRef<LatexEditorHandle | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialContent || "");
  const [savedContent, setSavedContent] = useState(initialContent || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [syncMap, setSyncMap] = useState<PdfSyncMapEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<PdfSyncDiagnostic[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const stale = draft !== savedContent;
  const cacheKey = `${applicationId}:${savedContent}`;

  useEffect(() => {
    const nextContent = initialContent || "";
    setDraft(nextContent);
    setSavedContent(nextContent);
  }, [initialContent]);

  const loadSyncedPreview = useCallback(async () => {
    if (!hasGeneratedResume) return;
    const cached = pdfSyncPreviewCache.get(cacheKey);
    if (cached) {
      setPdfBase64(cached.pdfBase64);
      setSyncMap(cached.syncMap);
      setDiagnostics(cached.diagnostics);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setDiagnostics([]);

    try {
      const response = await api.resumes.getPdfSync(applicationId);
      const nextPreview = {
        pdfBase64: response?.pdfBase64 || null,
        syncMap: response?.syncMap || [],
        diagnostics: response?.compileDiagnostics || [],
      };
      pdfSyncPreviewCache.set(cacheKey, nextPreview);
      setPdfBase64(nextPreview.pdfBase64);
      setSyncMap(nextPreview.syncMap);
      setDiagnostics(nextPreview.diagnostics);
    } catch (error) {
      setPdfBase64(null);
      setSyncMap([]);
      setPreviewError(error instanceof Error ? error.message : "Failed to load synced preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [applicationId, cacheKey, hasGeneratedResume]);

  useEffect(() => {
    loadSyncedPreview();
  }, [loadSyncedPreview]);

  const handleCopy = async () => {
    if (!savedContent) return;
    await navigator.clipboard.writeText(savedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setPreviewError(null);
    try {
      await api.resumes.updateContent(applicationId, draft, null);
      pdfSyncPreviewCache.delete(cacheKey);
      setSavedContent(draft);
      onContentUpdate(draft);
      setEditing(false);
      setPdfBase64(null);
      setSyncMap([]);
      setDiagnostics([]);
    } catch {
      setPreviewError("Failed to save LaTeX content.");
    } finally {
      setSaving(false);
    }
  };

  const handleSourceHit = (entry: PdfSyncMapEntry) => {
    editorRef.current?.highlightSourceRange({
      startLine: entry.sourceLine,
      endLine: entry.sourceEndLine || entry.sourceLine,
      startColumn: entry.sourceColumn || 1,
      endColumn: entry.sourceEndColumn,
    });
  };

  const resolveTextHit = useCallback(
    (
      text: string,
      clickedWord: string,
      fallbackEntry: PdfSyncMapEntry | null,
    ): PdfSyncMapEntry | null => {
      const matchedRange = findBestLatexRangeForPdfText(savedContent, text, clickedWord);
      if (matchedRange) {
        return {
          page: fallbackEntry?.page || 1,
          x: fallbackEntry?.x || 0,
          y: fallbackEntry?.y || 0,
          width: fallbackEntry?.width || 1,
          height: fallbackEntry?.height || 1,
          sourceLine: matchedRange.line,
          sourceColumn: matchedRange.startColumn,
          sourceEndColumn: matchedRange.endColumn,
          sourceEndLine: matchedRange.line,
          confidence: "nearest",
        };
      }

      if (fallbackEntry && isMeaningfulLatexLine(getLatexLine(savedContent, fallbackEntry.sourceLine))) {
        return fallbackEntry;
      }

      return findNearbyMeaningfulEntry(savedContent, syncMap, fallbackEntry);
    },
    [savedContent, syncMap],
  );

  if (!hasGeneratedResume || !initialContent) {
    return (
      <div className="flex-1 bg-gray-50/80 dark:bg-zinc-800/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 flex items-center justify-center">
        <div className="text-center p-8">
          <FileText size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">
            No Resume Generated
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
            Generate a resume from the New Application page.
          </p>
        </div>
      </div>
    );
  }

  const leftPane = (
    <section className="h-full min-h-0 min-w-0 flex flex-col pr-3" aria-label="LaTeX source">
      <div className="h-12 shrink-0 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            LaTeX source
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {editing ? "Editing saved resume content" : "Click the PDF to reveal matching source"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(savedContent);
                  setPreviewError(null);
                }}
                className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center"
              >
                <X size={14} /> Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-full text-xs font-semibold gap-1.5 inline-flex items-center"
              >
                <Save size={14} /> {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs inline-flex items-center"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <LatexEditor
          ref={editorRef}
          value={draft}
          readOnly={!editing}
          onChange={setDraft}
        />
      </div>
    </section>
  );

  const rightPane = (
    <section className="h-full min-h-0 min-w-0 flex flex-col pl-3" aria-label="Synced PDF preview">
      <div className="h-12 shrink-0 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            PDF preview
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Source-linked compiled resume
          </p>
        </div>
        <button
          type="button"
          onClick={loadSyncedPreview}
          disabled={previewLoading || stale}
          className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 rounded-full text-xs gap-1.5 inline-flex items-center"
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>
      {diagnostics.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {diagnostics[0].line ? `Line ${diagnostics[0].line}: ` : ""}
          {diagnostics[0].message}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200/70 dark:border-gray-800">
        <SyncedPdfViewer
          pdfBase64={pdfBase64}
          syncMap={syncMap}
          loading={previewLoading}
          error={previewError}
          stale={stale}
          resolveTextHit={resolveTextHit}
          onSourceHit={handleSourceHit}
        />
      </div>
    </section>
  );

  return (
    <div className="h-full min-h-0 w-full">
      <ResizableSplitView
        left={leftPane}
        right={rightPane}
        initialLeftWidth={48}
        minLeftWidth={32}
        maxLeftWidth={68}
      />
    </div>
  );
}

function getLatexLine(source: string, oneBasedLine: number) {
  return source.split(/\r?\n/)[oneBasedLine - 1] || "";
}

function findNearbyMeaningfulEntry(
  source: string,
  syncMap: PdfSyncMapEntry[],
  fallbackEntry: PdfSyncMapEntry | null,
) {
  if (!fallbackEntry) return null;
  const samePageEntries = syncMap
    .filter((entry) => entry.page === fallbackEntry.page)
    .sort((a, b) => {
      const aDistance = Math.abs(a.y - fallbackEntry.y) + Math.abs(a.sourceLine - fallbackEntry.sourceLine) * 2;
      const bDistance = Math.abs(b.y - fallbackEntry.y) + Math.abs(b.sourceLine - fallbackEntry.sourceLine) * 2;
      return aDistance - bDistance;
    });

  return samePageEntries.find((entry) =>
    isMeaningfulLatexLine(getLatexLine(source, entry.sourceLine)),
  ) || null;
}

function findBestLatexRangeForPdfText(source: string, pdfText: string, clickedWord: string) {
  const pdfTokens = tokenizeVisibleText(pdfText);
  if (pdfTokens.length === 0) return null;

  let best: { line: number; score: number } | null = null;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!isMeaningfulLatexLine(line)) continue;
    const visibleLine = latexLineToVisibleText(line);
    const lineTokens = tokenizeVisibleText(visibleLine);
    if (lineTokens.length === 0) continue;

    const lineTokenSet = new Set(lineTokens);
    const shared = pdfTokens.filter((token) => lineTokenSet.has(token)).length;
    const substringBonus = visibleLine.includes(normalizeText(pdfText)) ? 3 : 0;
    const score = shared * 2 + substringBonus;
    if (score > 0 && (!best || score > best.score)) {
      best = { line: index + 1, score };
    }
  }

  if (!best || best.score < 2) return null;

  const sourceLine = getLatexLine(source, best.line);
  const wordRange = findWordColumnRange(sourceLine, clickedWord || pdfTokens[0]);
  return {
    line: best.line,
    startColumn: wordRange?.startColumn || 1,
    endColumn: wordRange?.endColumn,
  };
}

function findWordColumnRange(line: string, word: string) {
  const normalizedWord = normalizeText(word).split(/\s+/)[0];
  if (!normalizedWord || normalizedWord.length < 2) return null;

  const escaped = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escaped, "i");
  const match = matcher.exec(line);
  if (!match || match.index < 0) return null;

  return {
    startColumn: match.index + 1,
    endColumn: match.index + match[0].length + 1,
  };
}

function isMeaningfulLatexLine(line: string) {
  const trimmed = line.trim();
  return Boolean(trimmed)
    && !trimmed.startsWith("%")
    && !/^\\(?:resumeSubHeadingList|resumeItemList)(?:Start|End)\s*$/.test(trimmed)
    && !/^\\(?:begin|end)\{[^}]+}\s*$/.test(trimmed)
    && !/^\\(?:vspace|small|normalsize|footnotesize)\b/.test(trimmed)
    && !/^\\(?:setlength|renewcommand|newcommand|usepackage|documentclass)\b/.test(trimmed);
}

function latexLineToVisibleText(line: string) {
  return normalizeText(
    line
      .replace(/\\href\{[^}]*}\{([^}]*)}/g, "$1")
      .replace(/\\textbf\{([^}]*)}/g, "$1")
      .replace(/\\emph\{([^}]*)}/g, "$1")
      .replace(/\\section\{([^}]*)}/g, "$1")
      .replace(/\\resumeItem\{([^]*)}/g, "$1")
      .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?/g, " ")
      .replace(/[{}$|&]/g, " "),
  );
}

function tokenizeVisibleText(text: string) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/\\&/g, "&")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
