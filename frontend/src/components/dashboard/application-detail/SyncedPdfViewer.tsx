"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Minus, Plus } from "lucide-react";
import type { PdfSyncMapEntry } from "../../../types/dtos";

interface SyncedPdfViewerProps {
  pdfBase64: string | null;
  syncMap: PdfSyncMapEntry[];
  loading: boolean;
  error: string | null;
  stale: boolean;
  resolveTextHit?: (
    text: string,
    clickedWord: string,
    fallbackEntry: PdfSyncMapEntry | null,
  ) => PdfSyncMapEntry | null;
  onSourceHit: (entry: PdfSyncMapEntry) => void;
}

interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
}

interface PageTextItem {
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function SyncedPdfViewer({
  pdfBase64,
  syncMap,
  loading,
  error,
  stale,
  resolveTextHit,
  onSourceHit,
}: SyncedPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [textItems, setTextItems] = useState<PageTextItem[]>([]);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!pdfBase64) {
        setPages([]);
        setTextItems([]);
        return;
      }

      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();

      const binary = atob(pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }

      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const nextPages: RenderedPage[] = [];
      const nextTextItems: PageTextItem[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoom });
        const textContent = await page.getTextContent();

        for (const rawItem of textContent.items) {
          if (!("str" in rawItem) || !rawItem.str.trim()) continue;
          const item = rawItem as {
            str: string;
            transform: number[];
            width: number;
            height: number;
          };
          const transformed = pdfjs.Util.transform(viewport.transform, item.transform);
          const itemHeight = Math.max(6, Math.abs(transformed[3]) / zoom);
          nextTextItems.push({
            pageNumber,
            text: item.str,
            x: transformed[4] / zoom,
            y: transformed[5] / zoom - itemHeight,
            width: Math.max(4, item.width / zoom),
            height: itemHeight,
          });
        }

        nextPages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
        });
      }

      if (!cancelled) {
        setPages(nextPages);
        setTextItems(nextTextItems);
      }

      requestAnimationFrame(async () => {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: zoom });
          const canvas = canvasRefs.current.get(pageNumber);
          if (!canvas) continue;

          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = Math.ceil(viewport.width * window.devicePixelRatio);
          canvas.height = Math.ceil(viewport.height * window.devicePixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }
      });
    }

    renderPdf().catch(() => {
      if (!cancelled) {
        setPages([]);
        setTextItems([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pdfBase64, zoom]);

  const findNearestEntry = useCallback(
    (pageNumber: number, x: number, y: number): PdfSyncMapEntry | null => {
      const pageEntries = syncMap
        .filter((entry) => entry.page === pageNumber)
        .sort((a, b) => a.y - b.y || a.sourceLine - b.sourceLine);
      if (pageEntries.length === 0) return null;

      const directHit = pageEntries
        .filter(
          (entry) =>
            x >= entry.x - 6 &&
            x <= entry.x + entry.width + 6 &&
            y >= entry.y - 3 &&
            y <= entry.y + Math.max(entry.height, 9) + 3,
        )
        .sort((a, b) => {
          const aCenter = a.y + Math.max(a.height, 9) / 2;
          const bCenter = b.y + Math.max(b.height, 9) / 2;
          return Math.abs(y - aCenter) - Math.abs(y - bCenter);
        })[0];
      if (directHit) return directHit;

      return pageEntries.reduce((best, entry) => {
        const centerX = entry.x + entry.width / 2;
        const centerY = entry.y + entry.height / 2;
        const distance = Math.abs(y - centerY) * 8 + Math.abs(x - centerX) * 0.25;
        if (!best || distance < best.distance) {
          return { entry, distance };
        }
        return best;
      }, null as { entry: PdfSyncMapEntry; distance: number } | null)?.entry || null;
    },
    [syncMap],
  );

  const handlePageClick = (
    pageNumber: number,
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (stale) return;
    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    const fallbackEntry = findNearestEntry(pageNumber, x, y);
    const clickedItem = findDirectTextItem(pageNumber, x, y);
    const clickedText = clickedItem?.text || "";
    const clickedWord = clickedItem ? getClickedWord(clickedItem, x) : "";
    const entry = clickedText && resolveTextHit
      ? resolveTextHit(clickedText, clickedWord, fallbackEntry)
      : fallbackEntry;
    if (entry) onSourceHit(entry);
  };

  const handlePageMouseMove = (
    pageNumber: number,
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (stale) {
      event.currentTarget.style.cursor = "not-allowed";
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    event.currentTarget.style.cursor = findDirectTextItem(pageNumber, x, y) ? "text" : "default";
  };

  const getClickedWord = (item: PageTextItem, x: number) => {
    const text = item.text;
    if (!text.trim()) return "";
    const ratio = Math.max(0, Math.min(1, (x - item.x) / Math.max(item.width, 1)));
    const charIndex = Math.max(0, Math.min(text.length - 1, Math.floor(ratio * text.length)));
    const left = text.slice(0, charIndex + 1).search(/[^\s]*$/);
    const rightMatch = text.slice(charIndex).match(/^[^\s]*/);
    const start = left < 0 ? charIndex : left;
    const end = charIndex + (rightMatch?.[0]?.length || 1);
    return text.slice(start, end).replace(/^[^\p{L}\p{N}+#.]+|[^\p{L}\p{N}+#.]+$/gu, "");
  };

  const findDirectTextItem = (
    pageNumber: number,
    x: number,
    y: number,
  ): PageTextItem | null => {
    return textItems
      .filter(
        (item) =>
          item.pageNumber === pageNumber &&
          x >= item.x - 2 &&
          x <= item.x + item.width + 2 &&
          y >= item.y - 2 &&
          y <= item.y + item.height + 3,
      )
      .sort((a, b) => {
        const aCenterY = a.y + a.height / 2;
        const bCenterY = b.y + b.height / 2;
        return Math.abs(y - aCenterY) - Math.abs(y - bCenterY);
      })[0] || null;
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-primary-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Compiling synced PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={30} className="text-amber-500" />
        <p className="max-w-sm text-sm text-gray-600 dark:text-gray-300">{error}</p>
      </div>
    );
  }

  if (!pdfBase64 || pages.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-zinc-950">
        <div className="h-10 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 px-3 flex items-center justify-between">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Synced PDF preview
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <FileText size={30} className="text-gray-300 dark:text-gray-600" />
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Preview is not ready yet. Refresh after the resume is saved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-zinc-950">
      <div className="h-10 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 px-3 flex items-center justify-between">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {stale ? "Save to refresh preview" : "Click text to locate source"}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.75, value - 0.15))}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <span className="w-12 text-center text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2.25, value + 0.15))}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto flex w-max flex-col gap-4">
          {pages.map((page) => (
            <canvas
              key={page.pageNumber}
              ref={(canvas) => {
                if (canvas) canvasRefs.current.set(page.pageNumber, canvas);
                else canvasRefs.current.delete(page.pageNumber);
              }}
              width={page.width}
              height={page.height}
              onClick={(event) => handlePageClick(page.pageNumber, event)}
              onMouseMove={(event) => handlePageMouseMove(page.pageNumber, event)}
              onMouseLeave={(event) => {
                event.currentTarget.style.cursor = stale ? "not-allowed" : "default";
              }}
              className={`bg-white shadow-sm ring-1 ring-gray-900/10 ${
                stale ? "cursor-not-allowed opacity-70" : "cursor-default"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
