import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { TerminologyEntry } from '../types/visualizer';
import {
  findMatchingLineNumbers,
  parseLineNumbersFromText,
} from '../utils/codeLines';
import { CodeSnippetPreview } from './CodeSnippetPreview';

interface TerminologyPanelProps {
  terms: TerminologyEntry[];
  originalCode: string;
  selectedTermName: string | null;
  onSelectTerm: (termName: string) => void;
  onSelectLines: (lineNumbers: number[], label: string) => void;
}

export function TerminologyPanel({
  terms,
  originalCode,
  selectedTermName,
  onSelectTerm,
  onSelectLines,
}: TerminologyPanelProps) {
  const [query, setQuery] = useState('');

  const filteredTerms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.simpleDefinition.toLowerCase().includes(q)
    );
  }, [terms, query]);

  const activeTerm =
    terms.find((t) => t.term.toLowerCase() === (selectedTermName ?? '').toLowerCase()) ??
    filteredTerms[0] ??
    null;

  const activeTermLines = useMemo(() => {
    if (!activeTerm || !originalCode) return [];
    const total = originalCode.split('\n').length;
    const explicit = parseLineNumbersFromText(activeTerm.whereUsedInCode || '', total);
    if (explicit.length > 0) return explicit;
    return findMatchingLineNumbers(originalCode, activeTerm.term, 5);
  }, [activeTerm, originalCode]);

  if (terms.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        Analyze code to automatically identify and explain every programming term used.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Programming Terms Found in This Code
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any term below to inspect its definition, purpose, and example.
          </p>
        </div>

        <div className="relative w-full sm:w-60">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter terms..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left term list */}
        <div className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-[480px] overflow-y-auto">
          {filteredTerms.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
              No matching terms found.
            </div>
          ) : (
            filteredTerms.map((item) => {
              const isSelected = activeTerm?.term === item.term;
              return (
                <button
                  key={item.term}
                  type="button"
                  onClick={() => onSelectTerm(item.term)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">{item.term}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.category}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right term detail */}
        {activeTerm && (
          <div className="lg:col-span-8 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div>
              <div className="text-xs font-mono text-sky-600 dark:text-sky-400">
                {activeTerm.category}
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {activeTerm.term}
              </h3>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                  Simple Definition
                </h4>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeTerm.simpleDefinition}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                  Why It Is Used
                </h4>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTerm.whyUsed}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                  How It Works
                </h4>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTerm.howItWorks}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Where It Appears in Your Code
                  </h4>
                  {activeTermLines.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                      {activeTermLines.map((ln) => (
                        <button
                          key={ln}
                          type="button"
                          onClick={() => onSelectLines([ln], `${activeTerm.term} · Line ${ln}`)}
                          className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 cursor-pointer tabular-nums"
                        >
                          Line {ln}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTerm.whereUsedInCode}
                </p>
                {activeTermLines.length > 0 && (
                  <CodeSnippetPreview
                    code={originalCode}
                    lineNumbers={activeTermLines}
                    title={activeTerm.term}
                    onClickLine={(ln) =>
                      onSelectLines([ln], `${activeTerm.term} · Line ${ln}`)
                    }
                  />
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Small Example
                </h4>
                <pre className="p-3 rounded-lg bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto">
                  <code>{activeTerm.example}</code>
                </pre>
              </div>

              {activeTerm.relatedConcepts && activeTerm.relatedConcepts.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Related concepts:
                  </span>
                  {activeTerm.relatedConcepts.map((rel, i) => {
                    const existsInList = terms.some(
                      (t) => t.term.toLowerCase() === rel.toLowerCase()
                    );
                    return (
                      <span key={rel} className="inline-flex items-center gap-2">
                        {i > 0 && (
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                        )}
                        {existsInList ? (
                          <button
                            type="button"
                            onClick={() => onSelectTerm(rel)}
                            className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            {rel}
                          </button>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400">{rel}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
