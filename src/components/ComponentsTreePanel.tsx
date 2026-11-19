import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { ComponentOrFunctionItem } from '../types/visualizer';
import {
  findMatchingLineNumbers,
  parseLineNumbersFromText,
} from '../utils/codeLines';
import { CodeSnippetPreview } from './CodeSnippetPreview';

interface ComponentsTreePanelProps {
  items: ComponentOrFunctionItem[];
  originalCode: string;
  isDark: boolean;
  onSelectLines: (lineNumbers: number[], label: string) => void;
}

export function ComponentsTreePanel({
  items,
  originalCode,
  isDark,
  onSelectLines,
}: ComponentsTreePanelProps) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const lineCount = useMemo(() => originalCode.split('\n').length, [originalCode]);

  const getItemLines = (item: ComponentOrFunctionItem): number[] => {
    const parsed = parseLineNumbersFromText(item.lineRange || '', lineCount);
    if (parsed.length > 0) return parsed;
    return findMatchingLineNumbers(originalCode, item.name, 4);
  };

  const handleSelectItem = (item: ComponentOrFunctionItem) => {
    setSelectedName(item.name);
    const lines = getItemLines(item);
    if (lines.length > 0) {
      onSelectLines(lines, item.name);
    }
  };

  const { rfNodes, rfEdges } = useMemo(() => {
    const byName = new Map(items.map((item) => [item.name, item]));
    const levels = new Map<string, number>();

    const getDepth = (name: string, visited = new Set<string>()): number => {
      if (levels.has(name)) return levels.get(name)!;
      if (visited.has(name)) return 0;
      visited.add(name);
      const item = byName.get(name);
      if (!item || !item.parentName || !byName.has(item.parentName)) {
        levels.set(name, 0);
        return 0;
      }
      const d = getDepth(item.parentName, visited) + 1;
      levels.set(name, d);
      return d;
    };

    items.forEach((item) => getDepth(item.name));

    const levelBuckets = new Map<number, ComponentOrFunctionItem[]>();
    items.forEach((item) => {
      const d = levels.get(item.name) ?? 0;
      const list = levelBuckets.get(d) ?? [];
      list.push(item);
      levelBuckets.set(d, list);
    });

    const nodes: Node[] = [];
    for (const [depth, bucket] of levelBuckets.entries()) {
      bucket.forEach((item, colIdx) => {
        const isHighlighted = hoveredName === item.name || selectedName === item.name;
        const isSelected = selectedName === item.name;
        nodes.push({
          id: item.name,
          position: {
            x: colIdx * 260 + 40,
            y: depth * 120 + 24,
          },
          data: {
            label: (
              <div className="text-left space-y-0.5">
                <div className="text-[10px] font-mono uppercase opacity-70">
                  {item.kind} · {item.lineRange}
                </div>
                <div className="text-xs font-semibold font-mono">{item.name}</div>
              </div>
            ),
          },
          style: {
            width: 220,
            padding: '10px 12px',
            borderRadius: '10px',
            cursor: 'pointer',
            background: isSelected
              ? isDark
                ? '#2e1065'
                : '#f3e8ff'
              : isHighlighted
                ? isDark
                  ? '#0c4a6e'
                  : '#e0f2fe'
                : isDark
                  ? '#0f172a'
                  : '#ffffff',
            color: isDark ? '#f1f5f9' : '#0f172a',
            border: isSelected
              ? '2px solid #7c3aed'
              : isHighlighted
                ? '2px solid #0284c7'
                : isDark
                  ? '1px solid #334155'
                  : '1px solid #cbd5e1',
          },
        });
      });
    }

    const edges: Edge[] = [];
    items.forEach((item) => {
      if (item.parentName && byName.has(item.parentName)) {
        edges.push({
          id: `tree-${item.parentName}-${item.name}`,
          source: item.parentName,
          target: item.name,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: isDark ? '#64748b' : '#94a3b8', strokeWidth: 1.5 },
        });
      }
      (item.childrenNames ?? []).forEach((child) => {
        if (byName.has(child)) {
          const edgeId = `tree-${item.name}-${child}`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: item.name,
              target: child,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: isDark ? '#64748b' : '#94a3b8', strokeWidth: 1.5 },
            });
          }
        }
      });
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [items, hoveredName, selectedName, isDark]);

  if (items.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        No standalone functions, classes, components, or routes were found in this snippet.
      </div>
    );
  }

  const hoveredItem = items.find((i) => i.name === hoveredName);

  return (
    <div className="space-y-6">
      {/* Visual Relationship Tree */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>Component & Function Tree (click any node or card to highlight its code)</span>
          <span className="font-mono tabular-nums">{items.length} units</span>
        </div>

        <div className="h-[280px] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            fitView
            onNodeMouseEnter={(_e, node) => setHoveredName(node.id)}
            onNodeMouseLeave={() => setHoveredName(null)}
            onNodeClick={(_e, node) => {
              const target = items.find((i) => i.name === node.id);
              if (target) handleSelectItem(target);
            }}
          >
            <Background gap={18} color={isDark ? '#1e293b' : '#e2e8f0'} />
            <Controls />
          </ReactFlow>

          {hoveredItem && (
            <div className="absolute bottom-3 left-3 right-3 max-w-md p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-xs shadow-sm pointer-events-none">
              <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {hoveredItem.name} ({hoveredItem.kind})
              </div>
              <p className="text-slate-600 dark:text-slate-300 mt-1">{hoveredItem.purpose}</p>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Component / Function Breakdown */}
      <div className="space-y-3">
        {items.map((item) => {
          const itemLines = getItemLines(item);
          const isSelected = selectedName === item.name;
          return (
            <div
              key={item.id || item.name}
              role="button"
              tabIndex={0}
              onMouseEnter={() => setHoveredName(item.name)}
              onMouseLeave={() => setHoveredName(null)}
              onClick={() => handleSelectItem(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectItem(item);
                }
              }}
              className={`p-4 rounded-xl border transition-colors bg-white dark:bg-slate-900 space-y-3 cursor-pointer ${
                isSelected
                  ? 'border-violet-500 dark:border-violet-400 ring-1 ring-violet-500/30'
                  : hoveredName === item.name
                    ? 'border-sky-400 dark:border-sky-500'
                    : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {item.kind}
                  </span>
                  {item.lineRange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectItem(item);
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-medium cursor-pointer tabular-nums ${
                        isSelected
                          ? 'bg-violet-600 text-white'
                          : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/70'
                      }`}
                    >
                      {item.lineRange}
                    </button>
                  )}
                </div>
              </div>

              {isSelected && itemLines.length > 0 && (
                <CodeSnippetPreview
                  code={originalCode}
                  lineNumbers={itemLines}
                  title={item.name}
                  onClickLine={(ln) => onSelectLines([ln], `${item.name} · Line ${ln}`)}
                />
              )}

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {item.purpose}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Parameters / Props
                  </div>
                  <p className="font-mono text-slate-600 dark:text-slate-400">
                    {item.parametersOrProps?.length ? item.parametersOrProps.join(', ') : 'None'}
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    State, Hooks & Middleware
                  </div>
                  <p className="font-mono text-slate-600 dark:text-slate-400">
                    {item.stateAndHooks?.length ? item.stateAndHooks.join(', ') : 'Stateless'}
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Return / Render Behavior:{' '}
                  </span>
                  {item.returnOrRenderBehavior}
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Communication & Flow:{' '}
                  </span>
                  {item.internalInteractions}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
