import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { FileUp, Loader2, Play, Sparkles, Trash2, X } from 'lucide-react';
import {
  LANGUAGE_OPTIONS,
  detectLanguageFromFilename,
  getLanguageLabel,
  getMonacoLanguage,
} from '../engine/languageDetector';
import type { SupportedLanguage } from '../types/visualizer';
import { formatLineRangeLabel } from '../utils/codeLines';

interface CodeEditorPanelProps {
  code: string;
  selectedLanguage: SupportedLanguage;
  detectedLanguage: Exclude<SupportedLanguage, 'auto'>;
  activeLineNumber: number | null;
  dependsOnLineNumbers?: number[];
  feedsIntoLineNumbers?: number[];
  focusedLineNumbers?: number[];
  focusLabel?: string | null;
  focusTrigger?: number;
  selectedLineNumber: number;
  isDark: boolean;
  isAnalyzing: boolean;
  onChangeCode: (value: string) => void;
  onChangeLanguage: (lang: SupportedLanguage) => void;
  onSelectLine: (line: number) => void;
  onClearFocus?: () => void;
  onAnalyze: () => void;
  onClear: () => void;
  onOpenExamples: () => void;
}

export function CodeEditorPanel({
  code,
  selectedLanguage,
  detectedLanguage,
  activeLineNumber,
  dependsOnLineNumbers = [],
  feedsIntoLineNumbers = [],
  focusedLineNumbers = [],
  focusLabel = null,
  focusTrigger = 0,
  selectedLineNumber,
  isDark,
  isAnalyzing,
  onChangeCode,
  onChangeLanguage,
  onSelectLine,
  onClearFocus,
  onAnalyze,
  onClear,
  onOpenExamples,
}: CodeEditorPanelProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevFocusTriggerRef = useRef(0);
  const prevActiveLineRef = useRef<number | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const effectiveLanguage =
    selectedLanguage === 'auto' ? detectedLanguage : selectedLanguage;
  const monacoLang = getMonacoLanguage(effectiveLanguage);
  const lineCount = code ? code.split('\n').length : 0;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsEditorReady(true);

    editor.onMouseDown((e) => {
      const lineNum = e.target.position?.lineNumber;
      if (lineNum) {
        onSelectLine(lineNum);
      }
    });

    editor.onDidChangeCursorPosition((e) => {
      if (e.position?.lineNumber) {
        onSelectLine(e.position.lineNumber);
      }
    });
  };

  // Highlight active execution line, dependency lines, and clicked/focused part lines
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !isEditorReady) return;

    const totalLines = editor.getModel()?.getLineCount() ?? 1;
    const validFocused = Array.from(
      new Set(
        focusedLineNumbers
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= totalLines)
      )
    ).sort((a, b) => a - b);

    const hasActive = Boolean(activeLineNumber && activeLineNumber >= 1);
    const safeLine = hasActive
      ? Math.min(Math.max(1, activeLineNumber as number), totalLines)
      : null;

    if (!safeLine && validFocused.length === 0) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      prevActiveLineRef.current = null;
      return;
    }

    const decorations: Array<{
      range: InstanceType<typeof monaco.Range>;
      options: {
        isWholeLine: boolean;
        className: string;
        glyphMarginClassName?: string;
      };
    }> = [];

    const focusedSet = new Set(validFocused);

    if (safeLine) {
      for (const depLine of dependsOnLineNumbers) {
        if (
          depLine >= 1 &&
          depLine <= totalLines &&
          depLine !== safeLine &&
          !focusedSet.has(depLine)
        ) {
          decorations.push({
            range: new monaco.Range(depLine, 1, depLine, 1),
            options: {
              isWholeLine: true,
              className: isDark ? 'cv-depends-line-dark' : 'cv-depends-line-light',
            },
          });
        }
      }

      for (const feedLine of feedsIntoLineNumbers) {
        if (
          feedLine >= 1 &&
          feedLine <= totalLines &&
          feedLine !== safeLine &&
          !dependsOnLineNumbers.includes(feedLine) &&
          !focusedSet.has(feedLine)
        ) {
          decorations.push({
            range: new monaco.Range(feedLine, 1, feedLine, 1),
            options: {
              isWholeLine: true,
              className: isDark ? 'cv-feeds-line-dark' : 'cv-feeds-line-light',
            },
          });
        }
      }

      if (!focusedSet.has(safeLine)) {
        decorations.push({
          range: new monaco.Range(safeLine, 1, safeLine, 1),
          options: {
            isWholeLine: true,
            className: isDark ? 'cv-active-line-dark' : 'cv-active-line-light',
            glyphMarginClassName: 'cv-active-glyph',
          },
        });
      }
    }

    validFocused.forEach((fLine, idx) => {
      decorations.push({
        range: new monaco.Range(fLine, 1, fLine, 1),
        options: {
          isWholeLine: true,
          className: isDark ? 'cv-focused-line-dark' : 'cv-focused-line-light',
          ...(idx === 0 ? { glyphMarginClassName: 'cv-focused-glyph' } : {}),
        },
      });
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);

    // Prioritize revealing newly clicked/focused part lines when focusTrigger changes
    if (focusTrigger > prevFocusTriggerRef.current && validFocused.length > 0) {
      const firstFocused = validFocused[0];
      editor.revealLineInCenter(firstFocused);
      editor.setPosition({ lineNumber: firstFocused, column: 1 });
      prevFocusTriggerRef.current = focusTrigger;
      prevActiveLineRef.current = safeLine;
      return;
    }

    prevFocusTriggerRef.current = focusTrigger;

    if (safeLine && safeLine !== prevActiveLineRef.current) {
      editor.revealLineInCenterIfOutsideViewport(safeLine);
    }
    prevActiveLineRef.current = safeLine;
  }, [
    isEditorReady,
    activeLineNumber,
    dependsOnLineNumbers,
    feedsIntoLineNumbers,
    focusedLineNumbers,
    focusTrigger,
    isDark,
    code,
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onChangeCode(text);
    const guessed = detectLanguageFromFilename(file.name);
    if (guessed !== 'auto') {
      onChangeLanguage(guessed);
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Editor Header / Chat Input Bar */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Source Code Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {selectedLanguage === 'auto'
                ? `Auto-detected: ${getLanguageLabel(detectedLanguage)}`
                : getLanguageLabel(selectedLanguage)}
              <span aria-hidden="true"> · </span>
              <span>{lineCount} lines</span>
              <span aria-hidden="true"> · </span>
              <span>Cursor line {selectedLineNumber}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenExamples}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Examples</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="language-select">
            Programming language
          </label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) => onChangeLanguage(e.target.value as SupportedLanguage)}
            className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === 'auto'
                  ? `Auto-Detect (${getLanguageLabel(detectedLanguage)})`
                  : opt.label}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".js,.jsx,.ts,.tsx,.py,.php,.java,.c,.cpp,.h,.hpp,.html,.htm,.css,.sql,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor Surface */}
      <div className="flex-1 min-h-[320px] relative">
        <Editor
          height="100%"
          language={monacoLang}
          value={code}
          theme={isDark ? 'vs-dark' : 'vs'}
          onChange={(val) => onChangeCode(val ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 21,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            glyphMargin: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'line',
            automaticLayout: true,
          }}
        />
      </div>

      {(activeLineNumber || focusedLineNumbers.length > 0) && (
        <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900 text-[11px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {focusedLineNumbers.length > 0 && (
              <span className="font-mono text-violet-700 dark:text-violet-300 font-semibold">
                Showing{focusLabel ? ` "${focusLabel}"` : ''}:{' '}
                {formatLineRangeLabel(focusedLineNumbers)}
              </span>
            )}
            {activeLineNumber && (
              <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                Executing: Line {activeLineNumber}
              </span>
            )}
            {dependsOnLineNumbers.length > 0 && (
              <span className="font-mono text-amber-700 dark:text-amber-400">
                Depends on: Line {dependsOnLineNumbers.join(', ')}
              </span>
            )}
            {feedsIntoLineNumbers.length > 0 && (
              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                Used by: Line {feedsIntoLineNumbers.join(', ')}
              </span>
            )}
          </div>

          {focusedLineNumbers.length > 0 && onClearFocus && (
            <button
              type="button"
              onClick={onClearFocus}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300 hover:underline cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
              <span>Clear highlight</span>
            </button>
          )}
        </div>
      )}

      {/* Chat-style Prompt Actions Footer */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={onClear}
          disabled={isAnalyzing || !code}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Code</span>
        </button>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing || !code.trim()}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing Code...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Understand Code</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
