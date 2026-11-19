import { useMemo } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { ExecutionStep, FlowchartEdgeData, FlowchartNodeData } from '../types/visualizer';

interface FlowchartPanelProps {
  nodes: FlowchartNodeData[];
  edges: FlowchartEdgeData[];
  currentStep: ExecutionStep | null;
  isDark: boolean;
  onJumpToStep: (stepNumber: number, lineNumber: number) => void;
}

export function FlowchartPanel({
  nodes,
  edges,
  currentStep,
  isDark,
  onJumpToStep,
}: FlowchartPanelProps) {
  const activeNodeId = useMemo(() => {
    if (!currentStep) return null;
    if (currentStep.flowNodeId && nodes.some((n) => n.id === currentStep.flowNodeId)) {
      return currentStep.flowNodeId;
    }
    const byStep = nodes.find((n) =>
      n.stepNumbers?.includes(currentStep.stepNumber)
    );
    if (byStep) return byStep.id;
    const byLine = nodes.find((n) => n.lineNumber === currentStep.lineNumber);
    return byLine?.id ?? null;
  }, [currentStep, nodes]);

  const rfNodes: Node[] = useMemo(() => {
    // Clean topological vertical layout with alternating horizontal branch offset for decisions
    return nodes.map((n, idx) => {
      const isActive = n.id === activeNodeId;
      const isDecision = n.kind === 'decision' || n.kind === 'loop';
      const isTerminal = n.kind === 'start' || n.kind === 'end';

      const bg = isActive
        ? isDark
          ? '#0c4a6e'
          : '#e0f2fe'
        : isDark
          ? '#0f172a'
          : '#ffffff';

      const border = isActive
        ? isDark
          ? '2px solid #38bdf8'
          : '2px solid #0284c7'
        : isDecision
          ? isDark
            ? '1px solid #d97706'
            : '1px solid #f59e0b'
          : isDark
            ? '1px solid #334155'
            : '1px solid #cbd5e1';

      return {
        id: n.id,
        position: {
          x: 180 + (idx % 2 === 1 && isDecision ? 60 : 0),
          y: idx * 105 + 24,
        },
        data: {
          label: (
            <div className="text-left space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wide opacity-75">
                <span>{n.kind}</span>
                <span>Line {n.lineNumber}</span>
              </div>
              <div className="text-xs font-medium leading-snug">{n.label}</div>
              {isActive && (
                <div className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 pt-0.5">
                  ACTIVE STEP
                </div>
              )}
            </div>
          ),
        },
        style: {
          width: 260,
          borderRadius: isTerminal ? '9999px' : '10px',
          padding: '10px 14px',
          background: bg,
          color: isDark ? '#f1f5f9' : '#0f172a',
          border,
          cursor: 'pointer',
          boxShadow: isActive ? '0 0 0 4px rgba(14, 165, 233, 0.16)' : 'none',
        },
      };
    });
  }, [nodes, activeNodeId, isDark]);

  const rfEdges: Edge[] = useMemo(() => {
    const validIds = new Set(nodes.map((n) => n.id));
    return edges
      .filter((e) => validIds.has(e.source) && validIds.has(e.target))
      .map((e) => {
        const isHighlighted = e.target === activeNodeId || e.source === activeNodeId;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: isHighlighted,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isHighlighted ? '#0284c7' : isDark ? '#64748b' : '#94a3b8',
          },
          style: {
            stroke: isHighlighted ? '#0284c7' : isDark ? '#475569' : '#94a3b8',
            strokeWidth: isHighlighted ? 2.2 : 1.4,
          },
          labelStyle: {
            fill: isDark ? '#cbd5e1' : '#334155',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
          },
        };
      });
  }, [edges, nodes, activeNodeId, isDark]);

  if (nodes.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        No flowchart data available for this snippet yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>Click any flowchart node to jump to its execution step and source line.</span>
        {currentStep && (
          <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
            Synced: Step {currentStep.stepNumber} · Line {currentStep.lineNumber}
          </span>
        )}
      </div>

      <div className="h-[520px] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          fitView
          onNodeClick={(_evt, node) => {
            const match = nodes.find((n) => n.id === node.id);
            if (match) {
              const targetStep = match.stepNumbers?.[0] ?? 1;
              onJumpToStep(targetStep, match.lineNumber);
            }
          }}
        >
          <Background gap={18} color={isDark ? '#1e293b' : '#e2e8f0'} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
