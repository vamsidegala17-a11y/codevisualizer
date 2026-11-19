import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  GitMerge,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ExecutionStep, TerminologyEntry } from '../types/visualizer';

interface ExecutionStepPlayerProps {
  originalCode: string;
  steps: ExecutionStep[];
  currentStepIndex: number;
  isPlaying: boolean;
  speed: number;
  terminology: TerminologyEntry[];
  isLivePreview?: boolean;
  onAnalyzeWithAi?: () => void;
  onStepChange: (index: number) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  onSelectTerm: (term: string) => void;
  onAskAboutLine: (lineNumber: number) => void;
  onSelectLines?: (lineNumbers: number[], label: string) => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 3];

export function ExecutionStepPlayer({
  originalCode,
  steps,
  currentStepIndex,
  isPlaying,
  speed,
  terminology,
  isLivePreview = false,
  onAnalyzeWithAi,
  onStepChange,
  onTogglePlay,
  onRestart,
  onSpeedChange,
  onSelectTerm,
  onAskAboutLine,
  onSelectLines,
}: ExecutionStepPlayerProps) {
  const step = steps[currentStepIndex];

  if (!step) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        No execution steps generated yet. Paste code on the left and click Understand Code.
      </div>
    );
  }

  const activeStage = (() => {
    switch (step.actionType) {
      case 'declare':
      case 'assign':
        return 'memory';
      case 'output':
        return 'output';
      case 'call':
      case 'return':
      case 'branch':
      case 'loop':
      case 'query':
      case 'render':
        return 'runtime';
      default:
        return 'source';
    }
  })();

  const dependsOn = step.dependsOnLines ?? [];
  const feedsInto = step.feedsIntoLines ?? [];
  const dependsLineSet = new Set(dependsOn.map((d) => d.lineNumber));
  const feedsLineSet = new Set(feedsInto.map((f) => f.lineNumber));

  const sourceLines = originalCode
    ? originalCode.split('\n')
    : steps.map((s) => s.codeLine);

  const stepByLine = new Map<number, number>();
  steps.forEach((s, idx) => {
    if (!stepByLine.has(s.lineNumber)) {
      stepByLine.set(s.lineNumber, idx);
    }
  });

  const variables = step.variables ?? [];
  const changedVars = variables.filter((v) => v.changed);
  const displayVars = (changedVars.length > 0 ? changedVars : variables).slice(0, 6);
  const consoleOutput = step.consoleOutput ?? [];
  const callStack = step.callStack ?? [];

  const jumpToLine = (targetLine: number, label?: string) => {
    const idx = steps.findIndex((s) => s.lineNumber === targetLine);
    if (idx >= 0) {
      onStepChange(idx);
    }
    if (onSelectLines) {
      onSelectLines([targetLine], label || `Line ${targetLine}`);
    }
  };

  const matchingTerms = terminology.filter((t) => {
    const lineLower = step.codeLine.toLowerCase();
    const termLower = t.term.toLowerCase();
    return (
      lineLower.includes(termLower) ||
      step.whatIsHappening.toLowerCase().includes(termLower)
    );
  });

  return (
    <div className="space-y-5">
      {isLivePreview && (
        <div className="px-3.5 py-2.5 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-sky-900 dark:text-sky-200">
            <Zap className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>
              <strong>Live Instant Preview</strong> synced directly with your editor lines.
            </span>
          </div>
          {onAnalyzeWithAi && (
            <button
              type="button"
              onClick={onAnalyzeWithAi}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Run Full AI Analysis</span>
            </button>
          )}
        </div>
      )}

      {/* Player Controls */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRestart}
              title="Restart execution"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}
              disabled={currentStepIndex === 0}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Play Execution</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onStepChange(Math.min(steps.length - 1, currentStepIndex + 1))}
              disabled={currentStepIndex >= steps.length - 1}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              Step {currentStepIndex + 1} / {steps.length} · Line {step.lineNumber}
            </span>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSpeedChange(opt)}
                  className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded-md transition-colors cursor-pointer ${
                    speed === opt
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, steps.length - 1)}
            value={currentStepIndex}
            onChange={(e) => onStepChange(Number(e.target.value))}
            aria-label="Execution step scrubber"
            className="w-full accent-sky-600 cursor-pointer"
          />
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
            <span>Step 1</span>
            <span>Action: {step.actionType}</span>
            <span>Step {steps.length}</span>
          </div>
        </div>
      </div>

      {/* Live Multi-Line Code Theater */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
        <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-sky-400'
              }`}
            />
            <span>Live Code Execution Visual</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            <span className="text-sky-300">▶ Executing (L{step.lineNumber})</span>
            {dependsOn.length > 0 && (
              <span className="text-amber-300">
                ← Input ({dependsOn.map((d) => `L${d.lineNumber}`).join(', ')})
              </span>
            )}
            {feedsInto.length > 0 && (
              <span className="text-emerald-300">
                → Feeds ({feedsInto.map((f) => `L${f.lineNumber}`).join(', ')})
              </span>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto overflow-x-auto py-2 font-mono text-xs">
          {sourceLines.map((rawLine, idx) => {
            const ln = idx + 1;
            const isCurrent = ln === step.lineNumber;
            const isDep = !isCurrent && dependsLineSet.has(ln);
            const isFeed = !isCurrent && feedsLineSet.has(ln);
            const hasStep = stepByLine.has(ln);

            return (
              <div key={ln}>
                <button
                  type="button"
                  onClick={() => jumpToLine(ln, `Line ${ln}`)}
                  className={`w-full text-left px-3 py-1 flex items-center gap-3 transition-colors ${
                    hasStep ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isCurrent
                      ? 'bg-sky-500/20 border-l-4 border-sky-400 text-white'
                      : isDep
                        ? 'bg-amber-500/12 border-l-4 border-amber-400 text-amber-100 hover:bg-amber-500/20'
                        : isFeed
                          ? 'bg-emerald-500/12 border-l-4 border-emerald-400 text-emerald-100 hover:bg-emerald-500/20'
                          : 'border-l-4 border-transparent text-slate-400 hover:bg-slate-900/70'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center">
                    {isCurrent ? (
                      <motion.span
                        initial={{ x: -4, opacity: 0.4 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="text-sky-400 font-bold"
                      >
                        ▶
                      </motion.span>
                    ) : isDep ? (
                      <span className="text-amber-400 text-[10px]">←</span>
                    ) : isFeed ? (
                      <span className="text-emerald-400 text-[10px]">→</span>
                    ) : null}
                  </span>

                  <span
                    className={`w-7 shrink-0 text-right tabular-nums select-none ${
                      isCurrent ? 'text-sky-300 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {ln}
                  </span>

                  <span className="whitespace-pre flex-1 min-w-0">
                    {rawLine || ' '}
                  </span>

                  {isCurrent && (
                    <span className="shrink-0 text-[10px] font-semibold text-sky-300 bg-sky-950/90 border border-sky-700/60 px-1.5 py-0.5 rounded">
                      STEP {step.stepNumber} · {step.actionType.toUpperCase()}
                    </span>
                  )}
                  {isDep && (
                    <span className="shrink-0 text-[10px] text-amber-300">
                      depends on
                    </span>
                  )}
                  {isFeed && (
                    <span className="shrink-0 text-[10px] text-emerald-300">
                      uses result
                    </span>
                  )}
                </button>

                {/* Inline Live Variable & Output Callout right below executing line */}
                {isCurrent && (displayVars.length > 0 || consoleOutput.length > 0) && (
                  <motion.div
                    key={`inline-state-${step.stepNumber}`}
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className="ml-14 mr-3 my-1 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
                  >
                    {displayVars.map((v, vIdx) => (
                      <span
                        key={`${v.scope}-${v.name}-${vIdx}`}
                        className={`inline-flex items-center gap-1 ${
                          v.changed ? 'text-emerald-300 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <span className="text-slate-400">{v.name}</span>
                        <span>=</span>
                        {v.previousValue && v.changed && (
                          <>
                            <span className="line-through text-slate-500">
                              {v.previousValue}
                            </span>
                            <span className="text-emerald-400">→</span>
                          </>
                        )}
                        <span>{v.value}</span>
                      </span>
                    ))}
                    {step.actionType === 'output' && consoleOutput.length > 0 && (
                      <span className="text-sky-300 font-semibold">
                        console: {consoleOutput[consoleOutput.length - 1]}
                      </span>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Variable & Console Strip inside Stage Footer */}
        {(variables.length > 0 || callStack.length > 0 || consoleOutput.length > 0) && (
          <div className="px-3.5 py-2.5 border-t border-slate-800 bg-slate-900/70 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
            <div>
              <div className="text-slate-400 mb-1 font-sans font-semibold">
                Live Variables ({variables.length})
              </div>
              <div className="text-slate-200 truncate">
                {variables.length === 0
                  ? 'None initialized yet'
                  : variables
                      .slice(0, 4)
                      .map((v) => `${v.name}=${v.value}`)
                      .join(' · ')}
              </div>
            </div>
            <div>
              <div className="text-slate-400 mb-1 font-sans font-semibold">
                Call Stack (depth {callStack.length})
              </div>
              <div className="text-sky-300 truncate">
                {callStack.length > 0
                  ? callStack.map((f) => f.functionName).join(' → ')
                  : 'Main scope'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 mb-1 font-sans font-semibold">
                Console Output ({consoleOutput.length})
              </div>
              <div className="text-emerald-300 truncate">
                {consoleOutput.length > 0
                  ? consoleOutput[consoleOutput.length - 1]
                  : 'Waiting for output'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Line Dependency Flow — Spacious Full-Width Active Line + 2-Column Dependencies */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <GitMerge className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Line {step.lineNumber} Dependency Flow</span>
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Click any linked line to jump there
          </span>
        </div>

        {/* Full-width Current Line Banner (never truncated into a narrow column!) */}
        <div className="p-3 rounded-lg border-2 border-sky-500 dark:border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-sky-700 dark:text-sky-300 font-semibold">
            <span>EXECUTING NOW · STEP {step.stepNumber} ({step.actionType})</span>
            <span>Line {step.lineNumber}</span>
          </div>
          <pre className="p-2.5 rounded bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto">
            <code>{step.codeLine}</code>
          </pre>
        </div>

        {/* 2-Column Upstream & Downstream Dependencies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
          {/* Upstream: Depends On */}
          <div className="p-3 rounded-lg border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              Depends On (Previous Lines)
            </div>
            {dependsOn.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Independent start — does not rely on earlier lines.
              </p>
            ) : (
              <div className="space-y-1.5">
                {dependsOn.map((dep, i) => (
                  <button
                    key={`${dep.lineNumber}-${dep.symbol}-${i}`}
                    type="button"
                    onClick={() => jumpToLine(dep.lineNumber, dep.symbol)}
                    className="w-full text-left p-2 rounded-md border border-amber-200 dark:border-amber-800/70 bg-white dark:bg-slate-900 hover:border-amber-500 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        Line {dep.lineNumber}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 truncate ml-2">
                        {dep.symbol}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      {dep.reason}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Downstream: Feeds Into */}
          <div className="p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              Lines That Depend On This Line
            </div>
            {feedsInto.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Final step or side effect — no later lines consume it.
              </p>
            ) : (
              <div className="space-y-1.5">
                {feedsInto.map((feed, i) => (
                  <button
                    key={`${feed.lineNumber}-${feed.symbol}-${i}`}
                    type="button"
                    onClick={() => jumpToLine(feed.lineNumber, feed.symbol)}
                    className="w-full text-left p-2 rounded-md border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-slate-900 hover:border-emerald-500 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Line {feed.lineNumber}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 truncate ml-2">
                        {feed.symbol}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      {feed.reason}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animated Execution Flow Pipeline */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Runtime Execution Pipeline
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            Line {step.lineNumber} active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-center">
          {[
            {
              key: 'source',
              title: '1. Code Line',
              subtitle: `Line ${step.lineNumber}`,
              icon: ArrowRight,
            },
            {
              key: 'runtime',
              title: '2. Engine / CPU',
              subtitle: step.actionType,
              icon: Cpu,
            },
            {
              key: 'memory',
              title: '3. Variables & Heap',
              subtitle: `${variables.length} tracked`,
              icon: Database,
            },
            {
              key: 'output',
              title: '4. Output / Next',
              subtitle:
                consoleOutput.length > 0
                  ? `${consoleOutput.length} printed`
                  : 'Ready',
              icon: Terminal,
            },
          ].map((stage) => {
            const Icon = stage.icon;
            const isActive = activeStage === stage.key || stage.key === 'source';
            return (
              <motion.div
                key={stage.key}
                animate={{
                  scale: activeStage === stage.key ? 1.02 : 1,
                  opacity: isActive ? 1 : 0.72,
                }}
                transition={{ duration: 0.2 }}
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  activeStage === stage.key
                    ? 'border-sky-500 dark:border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{stage.title}</span>
                  <Icon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="font-mono text-[11px] truncate tabular-nums">
                  {stage.subtitle}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Line-by-Line Execution Sequence Trail */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <ListOrdered className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Line-by-Line Execution Order</span>
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {steps.length} executed steps
          </span>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
          {steps.map((s, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isUpstream = !isCurrent && dependsLineSet.has(s.lineNumber);
            const isDownstream = !isCurrent && feedsLineSet.has(s.lineNumber);
            const depNums = Array.from(
              new Set((s.dependsOnLines ?? []).map((d) => d.lineNumber))
            );
            const feedNums = Array.from(
              new Set((s.feedsIntoLines ?? []).map((f) => f.lineNumber))
            );

            return (
              <button
                key={`${s.stepNumber}-${s.lineNumber}`}
                type="button"
                onClick={() => {
                  onStepChange(idx);
                  onSelectLines?.([s.lineNumber], `Step ${s.stepNumber} · Line ${s.lineNumber}`);
                }}
                className={`w-full text-left px-3 py-2 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-sky-50 dark:bg-sky-950/50'
                    : isUpstream
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      : isDownstream
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`font-mono text-[11px] tabular-nums shrink-0 mt-0.5 ${
                      isCurrent
                        ? 'font-bold text-sky-700 dark:text-sky-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    #{s.stepNumber}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">
                    L{s.lineNumber}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`font-mono text-xs truncate ${
                        isCurrent
                          ? 'font-semibold text-slate-950 dark:text-white'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {s.codeLine}
                    </div>
                    {(depNums.length > 0 || feedNums.length > 0) && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {depNums.length > 0 && (
                          <span className="text-amber-700 dark:text-amber-400">
                            depends on L{depNums.join(', L')}
                          </span>
                        )}
                        {depNums.length > 0 && feedNums.length > 0 && (
                          <span aria-hidden="true"> · </span>
                        )}
                        {feedNums.length > 0 && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            feeds L{feedNums.join(', L')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <span
                  className={`text-[10px] font-mono shrink-0 mt-0.5 ${
                    isCurrent
                      ? 'font-semibold text-sky-700 dark:text-sky-300'
                      : isUpstream
                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                        : isDownstream
                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {isCurrent
                    ? 'ACTIVE'
                    : isUpstream
                      ? 'DEPENDS ON'
                      : isDownstream
                        ? 'FEEDS INTO'
                        : s.actionType}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6-Part Step Explanation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.stepNumber}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  onSelectLines?.([step.lineNumber], `Step ${step.stepNumber} · Line ${step.lineNumber}`)
                }
                className="text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer"
              >
                1. Original Code Line (Line {step.lineNumber})
              </button>
              <button
                type="button"
                onClick={() => onAskAboutLine(step.lineNumber)}
                className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Ask AI about this line
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto">
              <code>{step.codeLine}</code>
            </pre>
          </div>

          <div className="p-4 space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              2. What is happening on this line?
            </h4>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {step.whatIsHappening}
            </p>
          </div>

          <div className="p-4 space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              3. Why is this line required?
            </h4>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {step.whyRequired}
            </p>
          </div>

          <div className="p-4 space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              4. What happens internally?
            </h4>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {step.whatHappensInternally}
            </p>
          </div>

          <div className="p-4 space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              5. What is the output?
            </h4>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {step.output}
            </p>
          </div>

          <div className="p-4 space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              6. What happens next?
            </h4>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {step.whatHappensNext}
            </p>
          </div>

          {matchingTerms.length > 0 && (
            <div className="p-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Terms in this step:
              </span>
              {matchingTerms.map((term) => (
                <button
                  key={term.term}
                  type="button"
                  onClick={() => onSelectTerm(term.term)}
                  className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                >
                  {term.term}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
