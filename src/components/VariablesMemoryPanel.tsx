import { ArrowRight, Box, Layers, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import type { ExecutionStep } from '../types/visualizer';

interface VariablesMemoryPanelProps {
  step: ExecutionStep | null;
  compact?: boolean;
}

export function VariablesMemoryPanel({ step, compact = false }: VariablesMemoryPanelProps) {
  if (!step) {
    return (
      <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
        Submit code and click Understand Code to inspect live variables, memory objects, and the call stack.
      </div>
    );
  }

  const variables = step.variables ?? [];
  const heapObjects = step.heapObjects ?? [];
  const callStack = step.callStack ?? [];
  const consoleOutput = step.consoleOutput ?? [];

  return (
    <div className={compact ? 'space-y-5' : 'space-y-7'}>
      {/* Variables Watch Table */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Variables & Scope</span>
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {variables.length} active
          </span>
        </div>

        {variables.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3 border-t border-slate-200 dark:border-slate-800">
            No variables initialized at this step yet.
          </p>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
                  <th className="py-2 px-3 font-medium">Name</th>
                  <th className="py-2 px-3 font-medium">Value</th>
                  {!compact && <th className="py-2 px-3 font-medium">Type</th>}
                  <th className="py-2 px-3 font-medium text-right">Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {variables.map((v, idx) => (
                  <motion.tr
                    key={`${v.scope}-${v.name}-${idx}`}
                    initial={v.changed ? { opacity: 0.6, scale: 0.99 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18 }}
                    className={
                      v.changed
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <span>{v.name}</span>
                      {v.heapRef && (
                        <span className="ml-1.5 text-[11px] text-sky-600 dark:text-sky-400">
                          → {v.heapRef}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200 break-all">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {v.previousValue && v.changed && (
                          <>
                            <span className="line-through text-slate-400 dark:text-slate-500">
                              {v.previousValue}
                            </span>
                            <ArrowRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          </>
                        )}
                        <span
                          className={
                            v.changed
                              ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                              : ''
                          }
                        >
                          {v.value}
                        </span>
                        {v.changed && (
                          <span className="text-[10px] font-sans font-semibold text-emerald-700 dark:text-emerald-300">
                            · updated
                          </span>
                        )}
                      </div>
                      {compact && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                          {v.type}
                        </div>
                      )}
                    </td>
                    {!compact && (
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {v.type}
                      </td>
                    )}
                    <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">
                      {v.scope}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Heap Objects & Arrays */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Memory Heap (Objects & Arrays)
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {heapObjects.length} allocated
          </span>
        </div>

        {heapObjects.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2 border-t border-slate-200 dark:border-slate-800">
            Only primitive values in memory right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {heapObjects.map((obj) => (
              <div
                key={obj.id}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-900"
              >
                <div className="flex items-center justify-between text-xs mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">
                    {obj.id} · {obj.label}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{obj.kind}</span>
                </div>
                <div className="space-y-1">
                  {obj.entries.map((entry, i) => (
                    <div
                      key={`${obj.id}-${entry.key}-${i}`}
                      className="flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <span className="text-slate-500 dark:text-slate-400">{entry.key}:</span>
                      <span className="text-slate-900 dark:text-slate-100 truncate">
                        {entry.value}
                        {entry.ref ? ` (${entry.ref})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Call Stack */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Call Stack</span>
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            depth {callStack.length}
          </span>
        </div>

        <div className="space-y-1.5">
          {[...callStack].reverse().map((frame) => (
            <div
              key={frame.id}
              className={`border rounded-lg px-3 py-2 text-xs ${
                frame.status === 'active'
                  ? 'border-sky-300 dark:border-sky-700 bg-sky-50/70 dark:bg-sky-950/40'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {frame.functionName}
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Line {frame.line} · {frame.status}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                Args: {frame.argumentsSummary || 'none'}
                {frame.returnValue ? ` · Return: ${frame.returnValue}` : ''}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live Console Output */}
      {consoleOutput.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
            <Terminal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Console Output So Far</span>
          </h3>
          <div className="rounded-lg bg-slate-900 dark:bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-emerald-300 space-y-1">
            {consoleOutput.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-slate-500 select-none tabular-nums">{idx + 1}.</span>
                <span className="break-all">{line}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
