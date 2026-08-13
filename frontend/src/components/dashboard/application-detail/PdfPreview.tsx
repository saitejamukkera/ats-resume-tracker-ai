"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, RotateCcw, Eye, FileText } from "lucide-react";
import { api } from "../../../lib/api";

interface PdfPreviewProps {
  applicationId: number;
  hasGeneratedResume: boolean;
}

export function PdfPreview({
  applicationId,
  hasGeneratedResume,
}: PdfPreviewProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const compilePdfPreview = useCallback(async () => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfBlobUrl(null);

    try {
      const blob = await api.resumes.downloadPdf(applicationId);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch {
      setPdfError("Failed to compile PDF preview.");
    } finally {
      setPdfLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (hasGeneratedResume) {
      compilePdfPreview();
    }
  }, [hasGeneratedResume, compilePdfPreview]);

  if (!hasGeneratedResume) {
    return (
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
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="pdf-preview-frame"
        style={{ height: "calc(100vh - 320px)" }}
      >
        {pdfLoading && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            <div className="loading-spinner" aria-hidden="true" />
            <p className="text-sm font-medium text-text-muted">
              Compiling PDF…
            </p>
          </div>
        )}
        {pdfError && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            <AlertTriangle size={32} className="text-warning-text" />
            <p className="max-w-xs text-center text-sm text-text-muted">
              {pdfError}
            </p>
            <button
              onClick={compilePdfPreview}
              className="button-secondary"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}
        {pdfBlobUrl && !pdfLoading && !pdfError && (
          <iframe
            src={pdfBlobUrl}
            title="Resume PDF Preview"
            className="absolute inset-0 w-full h-full border-0"
          />
        )}
        {!pdfBlobUrl && !pdfLoading && !pdfError && (
          <div
            className="flex h-full cursor-pointer flex-col items-center justify-center gap-3 p-8 transition-colors hover:bg-surface-muted"
            onClick={compilePdfPreview}
          >
            <Eye size={32} className="text-text-muted" />
            <p className="text-sm text-text-muted">
              Click to load PDF preview
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
