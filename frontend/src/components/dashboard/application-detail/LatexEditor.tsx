"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor, Range } from "monaco-editor";
import { useThemeContext } from "../../../context/ThemeContext";

export interface SourceRange {
  startLine: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
}

export interface LatexEditorHandle {
  highlightSourceRange: (range: SourceRange) => void;
  focus: () => void;
}

interface LatexEditorProps {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}

export const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(
  function LatexEditor({ value, readOnly, onChange }, ref) {
    const { theme } = useThemeContext();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const decorationIdsRef = useRef<string[]>([]);

    const handleMount: OnMount = (mountedEditor, monaco) => {
      editorRef.current = mountedEditor;
      monacoRef.current = monaco;
      monaco.languages.register({ id: "latex" });
    };

    useImperativeHandle(ref, () => ({
      highlightSourceRange(range) {
        const mountedEditor = editorRef.current;
        const monaco = monacoRef.current;
        if (!mountedEditor || !monaco) return;

        const startLine = Math.max(1, range.startLine);
        const endLine = Math.max(startLine, range.endLine || startLine);
        const model = mountedEditor.getModel();
        const maxColumn = model?.getLineMaxColumn(endLine) || 1;
        const startColumn = Math.max(1, range.startColumn || 1);
        const endColumn = Math.max(startColumn, range.endColumn || maxColumn);
        const shouldHighlightWholeLine = !range.startColumn && !range.endColumn;
        const highlightRange: Range = new monaco.Range(
          startLine,
          startColumn,
          endLine,
          endColumn,
        );

        decorationIdsRef.current = mountedEditor.deltaDecorations(
          decorationIdsRef.current,
          [
            {
              range: highlightRange,
              options: {
                isWholeLine: shouldHighlightWholeLine,
                className: shouldHighlightWholeLine
                  ? "bg-amber-200/45 dark:bg-amber-500/25"
                  : "bg-amber-200/70 dark:bg-amber-500/35",
                inlineClassName: shouldHighlightWholeLine
                  ? undefined
                  : "bg-amber-200/80 dark:bg-amber-500/45",
                linesDecorationsClassName:
                  "border-l-4 border-amber-500 dark:border-amber-400",
              },
            },
          ],
        );
        mountedEditor.revealLineInCenter(startLine);
        mountedEditor.setSelection(highlightRange);
        mountedEditor.focus();
      },
      focus() {
        editorRef.current?.focus();
      },
    }));

    return (
      <div className="h-full overflow-hidden rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-gray-800 dark:bg-zinc-950">
        <Editor
          height="100%"
          defaultLanguage="latex"
          language="latex"
          value={value}
          onMount={handleMount}
          onChange={(nextValue) => onChange(nextValue || "")}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 21,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 14, bottom: 14 },
            renderLineHighlight: "all",
            glyphMargin: false,
            folding: false,
            lineNumbersMinChars: 4,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
          }}
        />
      </div>
    );
  },
);
