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
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="flex-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 overflow-hidden bg-gray-100 dark:bg-zinc-800 ring-1 ring-gray-900/5 dark:ring-white/5 relative"
        style={{ height: "calc(100vh - 320px)" }}
      >
        {pdfLoading && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            <div className="w-10 h-10 rounded-full border-4 border-primary-200 dark:border-primary-900 border-t-primary-600 animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium animate-pulse">
              Compiling PDF...
            </p>
          </div>
        )}
        {pdfError && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center max-w-xs">
              {pdfError}
            </p>
            <button
              onClick={compilePdfPreview}
              className="px-4 py-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 text-sm text-primary-600 dark:text-primary-400 flex items-center gap-2 transition-colors"
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
            className="h-full flex flex-col items-center justify-center gap-3 p-8 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
            onClick={compilePdfPreview}
          >
            <Eye size={32} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Click to load PDF preview
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
