import { useState } from 'react';
import { ArrowUpRight, Loader2, MessageSquare, Send } from 'lucide-react';
import type {
  ComponentOrFunctionItem,
  ExecutionStep,
  LineChatMessage,
  TerminologyEntry,
} from '../types/visualizer';
import { parseLineNumbersFromText } from '../utils/codeLines';
import { VariablesMemoryPanel } from './VariablesMemoryPanel';

interface RightInspectorProps {
  currentStep: ExecutionStep | null;
  terminology: TerminologyEntry[];
  components: ComponentOrFunctionItem[];
  selectedLineNumber: number;
  selectedLineText: string;
  chatMessages: LineChatMessage[];
  isAskingLine: boolean;
  onAskLineQuestion: (question: string) => void;
  onSelectTerm: (termName: string) => void;
  onOpenFullMemory: () => void;
  onOpenComponents: () => void;
  onSelectLines?: (lineNumbers: number[], label: string) => void;
}

export function RightInspector({
  currentStep,
  terminology,
  components,
  selectedLineNumber,
  selectedLineText,
  chatMessages,
  isAskingLine,
  onAskLineQuestion,
  onSelectTerm,
  onOpenFullMemory,
  onOpenComponents,
  onSelectLines,
}: RightInspectorProps) {
  const [question, setQuestion] = useState('');
  const [hoveredComp, setHoveredComp] = useState<ComponentOrFunctionItem | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isAskingLine) return;
    onAskLineQuestion(question.trim());
    setQuestion('');
  };

  return (
    <aside className="flex flex-col h-full bg-slate-50/70 dark:bg-slate-900/60 border-l border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Live Memory & Variables Snapshot */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Live Memory Inspector
            </h2>
            <button
              type="button"
              onClick={onOpenFullMemory}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              <span>Expand</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <VariablesMemoryPanel step={currentStep} compact />
        </div>

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* Quick Clickable Terminology */}
        {terminology.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Key Terms Used
            </h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
              {terminology.slice(0, 10).map((t) => (
                <button
                  key={t.term}
                  type="button"
                  onClick={() => onSelectTerm(t.term)}
                  className="text-sky-700 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                >
                  {t.term}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hoverable Functions & Components Summary */}
        {components.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Functions & Components
              </h3>
              <button
                type="button"
                onClick={onOpenComponents}
                className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Tree View
              </button>
            </div>
            <div className="space-y-1">
              {components.map((c) => {
                const compLines = parseLineNumbersFromText(c.lineRange || '');
                return (
                  <button
                    key={c.id || c.name}
                    type="button"
                    onMouseEnter={() => setHoveredComp(c)}
                    onMouseLeave={() => setHoveredComp(null)}
                    onClick={() => {
                      if (compLines.length > 0 && onSelectLines) {
                        onSelectLines(compLines, c.name);
                      } else {
                        onOpenComponents();
                      }
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-400 dark:hover:border-sky-500 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                      {c.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 font-mono">
                      {c.lineRange || c.kind}
                    </span>
                  </button>
                );
              })}
            </div>
            {hoveredComp && (
              <div className="p-2.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 text-xs text-slate-700 dark:text-slate-200">
                <span className="font-mono font-semibold">{hoveredComp.name}: </span>
                {hoveredComp.purpose}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask AI About Selected Code Line */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <MessageSquare className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Ask AI About Line {selectedLineNumber}</span>
          </div>
        </div>

        {selectedLineText && (
          <div className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
            {selectedLineText}
          </div>
        )}

        {chatMessages.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs rounded-lg px-2.5 py-2 leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sky-50 dark:bg-sky-950/40 text-slate-900 dark:text-slate-100 ml-4'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mr-2'
                }`}
              >
                {msg.lineNumber && msg.role === 'user' && (
                  <span className="font-mono text-[10px] text-sky-600 dark:text-sky-400 block mb-0.5">
                    Line {msg.lineNumber}
                  </span>
                )}
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask why line ${selectedLineNumber} works...`}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={isAskingLine || !question.trim()}
            aria-label="Send line question"
            className="p-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
          >
            {isAskingLine ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </aside>
  );
}
