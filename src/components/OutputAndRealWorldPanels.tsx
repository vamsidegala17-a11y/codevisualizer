import { Terminal } from 'lucide-react';
import type { CodeAnalysisResult } from '../types/visualizer';

export function ExpectedOutputPanel({
  expectedOutput,
}: {
  expectedOutput: CodeAnalysisResult['expectedOutput'];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Expected Program Output
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Output format: {expectedOutput.outputKind}
        </p>
      </div>

      {/* Terminal / Console Lines */}
      <div className="rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-emerald-300 space-y-1.5">
        <div className="flex items-center gap-2 text-slate-400 pb-2 mb-2 border-b border-slate-800 font-sans">
          <Terminal className="w-3.5 h-3.5" />
          <span>Program Output</span>
        </div>
        {expectedOutput.lines && expectedOutput.lines.length > 0 ? (
          expectedOutput.lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-slate-500 select-none tabular-nums">&gt;</span>
              <span className="break-all whitespace-pre-wrap">{line}</span>
            </div>
          ))
        ) : (
          <div className="text-slate-400">
            No direct console output produced (returns values or updates state silently).
          </div>
        )}
      </div>

      {/* Optional SQL Table Result */}
      {expectedOutput.tableColumns &&
        expectedOutput.tableColumns.length > 0 &&
        expectedOutput.tableRows && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                  {expectedOutput.tableColumns.map((col) => (
                    <th
                      key={col}
                      className="py-2 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expectedOutput.tableRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200 tabular-nums"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Sandboxed HTML Preview if provided */}
      {expectedOutput.htmlPreviewSnippet && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Rendered UI Preview
          </h3>
          <iframe
            title="Rendered output preview"
            sandbox=""
            srcDoc={expectedOutput.htmlPreviewSnippet}
            className="w-full h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
          />
        </div>
      )}

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        {expectedOutput.explanation}
      </p>
    </div>
  );
}

export function RealWorldExamplePanel({
  realWorld,
}: {
  realWorld: CodeAnalysisResult['realWorldExample'];
}) {
  return (
    <div className="space-y-6">
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <div className="text-xs font-medium text-sky-600 dark:text-sky-400">
          Everyday Analogy
        </div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          {realWorld.analogyTitle}
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {realWorld.analogyStory}
        </p>
      </section>

      {realWorld.mappingPoints && realWorld.mappingPoints.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            How the Analogy Maps to Your Code
          </h3>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {realWorld.mappingPoints.map((pt, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 text-xs"
              >
                <div className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                  {pt.codeElement}
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  {pt.realWorldCounterpart}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          Practical Production Use Case
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {realWorld.productionUseCase}
        </p>
        <pre className="p-3.5 rounded-xl bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto leading-relaxed">
          <code>{realWorld.practicalSnippet}</code>
        </pre>
      </section>
    </div>
  );
}
