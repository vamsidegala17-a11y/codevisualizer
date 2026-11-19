import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import type { CodeAnalysisResult } from '../types/visualizer';
import { CodeSnippetPreview } from './CodeSnippetPreview';

interface OverviewAndQualityPanelProps {
  analysis: CodeAnalysisResult;
  originalCode: string;
  onSelectLines: (lineNumbers: number[], label: string) => void;
  onStartStepTrace: () => void;
}

export function OverviewAndQualityPanel({
  analysis,
  originalCode,
  onSelectLines,
  onStartStepTrace,
}: OverviewAndQualityPanelProps) {
  const [compareMode, setCompareMode] = useState<'simplified' | 'alternative'>('simplified');
  const [selectedIssueIdx, setSelectedIssueIdx] = useState<number | null>(null);
  const { overview, codeQuality } = analysis;

  return (
    <div className="space-y-8">
      {/* High-level Overview */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{analysis.detectedLanguage}</span>
              <span aria-hidden="true"> · </span>
              <span>
                {analysis.traceSource === 'ast-sandbox'
                  ? 'Verified AST Sandbox Trace'
                  : 'Structured Execution Analysis'}
              </span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{analysis.executionSteps.length} steps</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              {overview.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onStartStepTrace}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Watch Step-by-Step Execution
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {overview.summary}
        </p>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Why it is written this way
          </h3>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {overview.whyWrittenThisWay}
          </p>
          {overview.complexitySummary && (
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 pt-1">
              Complexity & behavior: {overview.complexitySummary}
            </p>
          )}
        </div>

        {overview.keyTakeaways && overview.keyTakeaways.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Key Takeaways
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
              {overview.keyTakeaways.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-sky-600 dark:text-sky-400 mt-0.5 tabular-nums">
                    0{idx + 1}.
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* Errors, Bugs & Best Practices */}
      <section className="space-y-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Code Health, Errors & Best Practices
        </h3>

        {codeQuality.issues && codeQuality.issues.length > 0 ? (
          <div className="space-y-2.5">
            {codeQuality.issues.map((issue, idx) => {
              const isErr = issue.severity === 'error';
              const isWarn = issue.severity === 'warning';
              const isSelected = selectedIssueIdx === idx;
              return (
                <div
                  key={idx}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedIssueIdx(idx);
                    onSelectLines([issue.lineNumber], issue.title);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIssueIdx(idx);
                      onSelectLines([issue.lineNumber], issue.title);
                    }
                  }}
                  className={`p-3.5 rounded-lg border transition-colors bg-white dark:bg-slate-900 space-y-2 cursor-pointer ${
                    isSelected
                      ? 'border-violet-500 dark:border-violet-400 ring-1 ring-violet-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {isErr ? (
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      ) : (
                        <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      )}
                      <span
                        className={
                          isErr
                            ? 'text-red-700 dark:text-red-400'
                            : isWarn
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-sky-700 dark:text-sky-400'
                        }
                      >
                        {issue.severity.toUpperCase()} · {issue.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIssueIdx(idx);
                        onSelectLines([issue.lineNumber], issue.title);
                      }}
                      className={`px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer whitespace-nowrap tabular-nums ${
                        isSelected
                          ? 'bg-violet-600 text-white'
                          : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:underline'
                      }`}
                    >
                      Line {issue.lineNumber}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {issue.explanation}
                  </p>
                  {isSelected && (
                    <CodeSnippetPreview
                      code={originalCode}
                      lineNumbers={[issue.lineNumber]}
                      title={issue.title}
                    />
                  )}
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    How to fix: {issue.howToFix}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No critical syntax or runtime bugs detected in this snippet.</span>
          </div>
        )}

        {codeQuality.bestPractices && codeQuality.bestPractices.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Best Practices & Optimization Tips
            </h4>
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
              {codeQuality.bestPractices.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* Compare Original vs Simplified / Alternative */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Compare Code Implementations</span>
          </h3>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setCompareMode('simplified')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                compareMode === 'simplified'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Simplified Version
            </button>
            <button
              type="button"
              onClick={() => setCompareMode('alternative')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                compareMode === 'alternative'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {codeQuality.alternativeTitle || 'Alternative Approach'}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300">
          {compareMode === 'simplified'
            ? codeQuality.simplifiedExplanation
            : codeQuality.alternativeExplanation}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
            <div className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              Original Code
            </div>
            <pre className="p-3 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
              <code>{originalCode}</code>
            </pre>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
            <div className="px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-300 border-b border-slate-200 dark:border-slate-800 bg-sky-50/60 dark:bg-sky-950/30">
              {compareMode === 'simplified'
                ? 'Simplified Beginner Version'
                : codeQuality.alternativeTitle || 'Alternative Implementation'}
            </div>
            <pre className="p-3 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
              <code>
                {compareMode === 'simplified'
                  ? codeQuality.simplifiedCode
                  : codeQuality.alternativeCode}
              </code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
