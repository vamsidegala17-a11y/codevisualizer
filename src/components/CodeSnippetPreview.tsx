import { Code2 } from 'lucide-react';
import { extractNumberedCodeLines, formatLineRangeLabel } from '../utils/codeLines';

interface CodeSnippetPreviewProps {
  code: string;
  lineNumbers: number[];
  title?: string;
  onClickLine?: (lineNumber: number) => void;
}

export function CodeSnippetPreview({
  code,
  lineNumbers,
  title,
  onClickLine,
}: CodeSnippetPreviewProps) {
  const lines = extractNumberedCodeLines(code, lineNumbers);
  if (lines.length === 0) return null;

  const rangeLabel = formatLineRangeLabel(lines.map((l) => l.lineNumber));

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-900/70 bg-slate-950 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-violet-300">
          <Code2 className="w-3 h-3" />
          <span>{title ? `${title} · ${rangeLabel}` : `Code at ${rangeLabel}`}</span>
        </span>
        {onClickLine && (
          <span className="text-slate-400">Click any line to highlight in editor</span>
        )}
      </div>
      <div className="divide-y divide-slate-800/70 font-mono text-xs overflow-x-auto max-h-56 overflow-y-auto">
        {lines.map((item) => {
          const rowContent = (
            <>
              <span className="w-10 shrink-0 select-none text-right pr-3 text-slate-500 tabular-nums border-r border-slate-800">
                {item.lineNumber}
              </span>
              <span className="pl-3 text-sky-100 whitespace-pre">
                {item.text || ' '}
              </span>
            </>
          );

          if (onClickLine) {
            return (
              <button
                key={item.lineNumber}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickLine(item.lineNumber);
                }}
                className="w-full text-left flex items-start px-2 py-1 hover:bg-violet-950/60 transition-colors cursor-pointer"
              >
                {rowContent}
              </button>
            );
          }

          return (
            <div key={item.lineNumber} className="flex items-start px-2 py-1">
              {rowContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
