import { traceJavaScript } from '../engine/jsTracer';
import type {
  CallStackFrame,
  ExecutionStep,
  LineDependencyRef,
  VariableSnapshot,
} from '../types/visualizer';

const JS_STOPWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'async',
  'await',
  'import',
  'from',
  'export',
  'default',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'this',
  'super',
  'console',
  'log',
  'Math',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'JSON',
  'Promise',
  'Date',
  'def',
  'elif',
  'print',
  'echo',
  'public',
  'private',
  'protected',
  'static',
  'void',
  'int',
  'float',
  'double',
  'string',
  'bool',
  'boolean',
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'GROUP',
  'BY',
  'ORDER',
  'LIMIT',
]);

function detectActionType(trimmed: string): ExecutionStep['actionType'] {
  if (/^\s*(import|from\s+\S+\s+import|#include|use\s+[A-Z\\])/.test(trimmed)) return 'import';
  if (/^\s*(export\s+(?:default\s+)?)?(?:async\s+)?(?:function|def|class)\b/.test(trimmed)) return 'define';
  if (/^\s*return\b/.test(trimmed)) return 'return';
  if (/^\s*(console\.log|print|echo|printf|System\.out\.println|std::cout)/.test(trimmed)) return 'output';
  if (/^\s*(if|else\s+if|elif|else|switch|case)\b/.test(trimmed)) return 'branch';
  if (/^\s*(for|while|do)\b|\.(forEach|map|filter|reduce|some|every)\s*\(/.test(trimmed)) return 'loop';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(trimmed)) return 'query';
  if (/^\s*<[A-Za-z]/.test(trimmed)) return 'render';
  if (/^\s*(const|let|var)\b/.test(trimmed) || /^\$[A-Za-z_]\w*\s*=/.test(trimmed)) {
    return /\([^)]*\)/.test(trimmed) && !/=\s*\[/.test(trimmed) ? 'call' : 'declare';
  }
  if (/(\+=|-=|\*=|\/=|\+\+|--|=[^=>])/.test(trimmed)) return 'assign';
  if (/\([^)]*\)/.test(trimmed)) return 'call';
  return 'assign';
}

function inferLineWhatHappens(trimmed: string, actionType: ExecutionStep['actionType'], lineNumber: number): string {
  switch (actionType) {
    case 'import':
      return `Loads external module or dependency on line ${lineNumber} so its symbols are available below.`;
    case 'define':
      return `Defines a reusable function or class structure starting on line ${lineNumber}.`;
    case 'declare':
      return `Declares and initializes variable state on line ${lineNumber}: \`${trimmed}\`.`;
    case 'assign':
      return `Evaluates the expression and updates variable or property state on line ${lineNumber}.`;
    case 'loop':
      if (/\.forEach\s*\(/.test(trimmed)) {
        return `Iterates over each element in the collection using \`.forEach(...)\` and runs the callback body per item.`;
      }
      if (/\.(map|filter|reduce)\s*\(/.test(trimmed)) {
        return `Iterates through the collection items using an array transformation callback on line ${lineNumber}.`;
      }
      return `Evaluates the loop control condition on line ${lineNumber} to decide whether to run the loop body.`;
    case 'branch':
      return `Tests the conditional branch on line ${lineNumber} to decide which code path executes next.`;
    case 'call':
      return `Invokes the function/method on line ${lineNumber} with the current inputs.`;
    case 'return':
      return `Returns the computed result or UI output from the current function on line ${lineNumber}.`;
    case 'output':
      return `Outputs the evaluated value on line ${lineNumber} to the console/standard output.`;
    case 'query':
      return `Executes the relational database query clause on line ${lineNumber}.`;
    case 'render':
      return `Renders the declarative UI markup element on line ${lineNumber}.`;
    default:
      return `Executes instruction on line ${lineNumber}: \`${trimmed}\`.`;
  }
}

function extractDeclaredSymbols(trimmed: string): string[] {
  const syms: string[] = [];
  const declMatch = trimmed.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (declMatch) syms.push(declMatch[1]);

  const destructArr = trimmed.match(/^(?:const|let|var)\s+\[([^\]]+)\]/);
  if (destructArr) {
    destructArr[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => syms.push(s));
  }

  const assignMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*(?:\+=|-=|\*=|\/=|=[^=>])/);
  if (assignMatch && !JS_STOPWORDS.has(assignMatch[1])) {
    syms.push(assignMatch[1]);
  }

  const phpMatch = trimmed.match(/^(\$[A-Za-z_]\w*)\s*=/);
  if (phpMatch) syms.push(phpMatch[1]);

  const fnMatch = trimmed.match(/\b(?:function|def)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (fnMatch) {
    syms.push(fnMatch[1]);
    fnMatch[2]
      .split(',')
      .map((p) => p.trim().split(/[:=]/)[0].trim())
      .filter((p) => p && /^[A-Za-z_$][\w$]*$/.test(p))
      .forEach((p) => syms.push(p));
  }

  const arrowParamMatch = trimmed.match(/\.(?:forEach|map|filter|reduce|find|some|every)\s*\(\s*(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/);
  if (arrowParamMatch) {
    const rawParams = arrowParamMatch[1] || arrowParamMatch[2] || '';
    rawParams
      .split(',')
      .map((p) => p.trim().split(/[:=]/)[0].trim())
      .filter((p) => p && /^[A-Za-z_$][\w$]*$/.test(p))
      .forEach((p) => syms.push(p));
  }

  const forInit = trimmed.match(/\bfor\s*\(\s*(?:let|var|int)?\s*([A-Za-z_$][\w$]*)/);
  if (forInit) syms.push(forInit[1]);

  return Array.from(new Set(syms));
}

function extractReferencedSymbols(trimmed: string, declaredHere: Set<string>): string[] {
  const withoutStrings = trimmed
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/`[^`]*`/g, ' ');
  const tokens = withoutStrings.match(/\$?[A-Za-z_][\w$]*/g) ?? [];
  return Array.from(
    new Set(
      tokens.filter(
        (t) =>
          !JS_STOPWORDS.has(t) &&
          !declaredHere.has(t) &&
          !/^\d/.test(t)
      )
    )
  );
}

function inferSampleValue(line: string, sym: string): { value: string; type: string } {
  const rhsMatch = line.match(/=\s*([^;]+)/);
  if (rhsMatch) {
    const rhs = rhsMatch[1].trim();
    if (rhs.startsWith('[')) return { value: rhs, type: 'array' };
    if (rhs.startsWith('{')) return { value: rhs, type: 'object' };
    if (/^['"`]/.test(rhs)) return { value: rhs, type: 'string' };
    if (/^\d+(\.\d+)?$/.test(rhs)) return { value: rhs, type: 'number' };
    if (rhs === 'true' || rhs === 'false') return { value: rhs, type: 'boolean' };
    return { value: `<result of ${rhs.slice(0, 32)}>`, type: 'computed' };
  }
  if (/forEach|map|filter/.test(line)) {
    return { value: `<current ${sym} item>`, type: 'item' };
  }
  return { value: '<active value>', type: 'value' };
}

/**
 * Generates clean, multi-line execution steps with live line dependencies & variable snapshots
 * for any snippet (including partial snippets like `sortedFields.forEach(...)` where AST sandbox
 * cannot execute an undefined outer array).
 */
export function buildStructuralExecutionSteps(
  code: string,
  _language: string
): ExecutionStep[] {
  if (!code.trim()) return [];
  const rawLines = code.split('\n');

  const candidateLines: Array<{ lineNumber: number; trimmed: string }> = [];
  rawLines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (/^(?:\/\/|\/\*|\*|#(?!!)|--|<!--)/.test(trimmed)) return;
    if (/^[{}()[\];,]+$/.test(trimmed)) return; // pure closing braces like `});` or `}`
    candidateLines.push({ lineNumber: idx + 1, trimmed });
  });

  if (candidateLines.length === 0) return [];

  const symbolLastDefinedLine = new Map<string, number>();
  const varValues = new Map<string, { value: string; type: string; scope: string }>();
  const stack: CallStackFrame[] = [
    {
      id: 'frame-main',
      functionName: 'Main Block',
      argumentsSummary: 'snippet scope',
      line: candidateLines[0].lineNumber,
      status: 'active',
    },
  ];
  const consoleOut: string[] = [];

  const steps: ExecutionStep[] = candidateLines.map((item, idx) => {
    const { lineNumber, trimmed } = item;
    const actionType = detectActionType(trimmed);
    const declaredHere = new Set(extractDeclaredSymbols(trimmed));
    const referenced = extractReferencedSymbols(trimmed, declaredHere);

    // Track upstream dependencies
    const deps: LineDependencyRef[] = [];
    const seenDeps = new Set<string>();
    for (const ref of referenced) {
      const defLine = symbolLastDefinedLine.get(ref);
      if (defLine && defLine !== lineNumber) {
        const key = `${defLine}:${ref}`;
        if (!seenDeps.has(key)) {
          seenDeps.add(key);
          deps.push({
            lineNumber: defLine,
            symbol: ref,
            reason: `Uses "${ref}" introduced or updated on line ${defLine}`,
          });
        }
      }
    }

    // Fallback sequential control-flow dependency inside blocks/callbacks when no explicit symbol matched
    if (deps.length === 0 && idx > 0) {
      const prev = candidateLines[idx - 1];
      if (
        prev.trimmed.endsWith('{') ||
        prev.trimmed.endsWith(':') ||
        /\.(forEach|map|filter|reduce)\s*\(/.test(prev.trimmed) ||
        /^\s*(if|for|while|else|try)\b/.test(prev.trimmed)
      ) {
        deps.push({
          lineNumber: prev.lineNumber,
          symbol: 'control flow',
          reason: `Runs inside block opened on line ${prev.lineNumber}`,
        });
      }
    }

    // Update stack context if entering a callback/function
    const fnEnter = trimmed.match(/\b(?:function|def)\s+([A-Za-z_$][\w$]*)/);
    if (fnEnter && !stack.some((f) => f.functionName === `${fnEnter[1]}()`)) {
      stack.push({
        id: `frame-${lineNumber}`,
        functionName: `${fnEnter[1]}()`,
        argumentsSummary: 'function scope',
        line: lineNumber,
        status: 'active',
      });
    } else if (/\.(forEach|map|filter|reduce)\s*\(/.test(trimmed)) {
      const methodMatch = trimmed.match(/\.(forEach|map|filter|reduce)\s*\(/);
      const mName = methodMatch ? `${methodMatch[1]} callback` : 'callback';
      if (!stack.some((f) => f.functionName === mName)) {
        stack.push({
          id: `frame-cb-${lineNumber}`,
          functionName: mName,
          argumentsSummary: Array.from(declaredHere).join(', ') || 'item',
          line: lineNumber,
          status: 'active',
        });
      }
    }

    // Update tracked variable snapshots
    const changedSet = new Set<string>();
    const prevSnapshotValues = new Map<string, string>();
    for (const [k, v] of varValues.entries()) {
      prevSnapshotValues.set(k, v.value);
    }

    for (const sym of declaredHere) {
      const inferred = inferSampleValue(trimmed, sym);
      varValues.set(sym, {
        value: inferred.value,
        type: inferred.type,
        scope: stack[stack.length - 1]?.functionName || 'local',
      });
      symbolLastDefinedLine.set(sym, lineNumber);
      changedSet.add(sym);
    }

    if (actionType === 'output') {
      const argMatch = trimmed.match(/\((.+)\)/);
      consoleOut.push(argMatch ? argMatch[1].trim() : trimmed);
    }

    const variables: VariableSnapshot[] = Array.from(varValues.entries()).map(
      ([name, info]) => {
        const isChanged = changedSet.has(name);
        const prevVal = prevSnapshotValues.get(name);
        return {
          name,
          value: info.value,
          type: info.type,
          scope: info.scope,
          changed: isChanged,
          previousValue: isChanged && prevVal && prevVal !== info.value ? prevVal : undefined,
        };
      }
    );

    const nextItem = candidateLines[idx + 1];
    return {
      stepNumber: idx + 1,
      lineNumber,
      codeLine: trimmed,
      actionType,
      whatIsHappening: inferLineWhatHappens(trimmed, actionType, lineNumber),
      whyRequired: `Performs this step of the ${stack[stack.length - 1]?.functionName || 'program'} workflow before continuing.`,
      whatHappensInternally: `Evaluates line ${lineNumber} (${actionType}) in ${stack[stack.length - 1]?.functionName || 'active scope'}.`,
      output:
        actionType === 'output'
          ? `Logs ${consoleOut[consoleOut.length - 1] ?? 'output'}`
          : changedSet.size > 0
            ? `Updates ${Array.from(changedSet).join(', ')} in scope.`
            : 'Advances control flow to the next statement.',
      whatHappensNext: nextItem
        ? `Execution moves to line ${nextItem.lineNumber}: \`${nextItem.trimmed.slice(0, 60)}\`.`
        : 'Execution reaches the end of the snippet.',
      variables,
      heapObjects: [],
      callStack: stack.map((f) => ({ ...f })),
      consoleOutput: [...consoleOut],
      dependsOnLines: deps,
      feedsIntoLines: [],
    };
  });

  // Populate reverse feedsIntoLines edges
  for (const consumer of steps) {
    for (const dep of consumer.dependsOnLines ?? []) {
      for (const producer of steps) {
        if (producer.lineNumber === dep.lineNumber && producer.stepNumber !== consumer.stepNumber) {
          const feeds = producer.feedsIntoLines ?? [];
          if (!feeds.some((f) => f.lineNumber === consumer.lineNumber && f.symbol === dep.symbol)) {
            feeds.push({
              lineNumber: consumer.lineNumber,
              symbol: dep.symbol,
              reason: `Supplies "${dep.symbol}" to line ${consumer.lineNumber}`,
            });
            producer.feedsIntoLines = feeds;
          }
        }
      }
    }
  }

  return steps;
}

/**
 * Produces immediate live execution steps on the client when the user edits code or before/after AI analysis.
 */
export function buildInstantLiveSteps(
  code: string,
  language: string
): { steps: ExecutionStep[]; source: 'ast-sandbox' | 'live-structural' } {
  const nonEmptyCount = code
    .split('\n')
    .filter((l) => l.trim() && !/^[{}()[\];,]+$/.test(l.trim())).length;

  if (
    language === 'javascript' ||
    language === 'typescript' ||
    language === 'nodejs'
  ) {
    const astTrace = traceJavaScript(code, language);
    if (
      astTrace.supported &&
      (astTrace.steps.length >= 2 || nonEmptyCount <= 2)
    ) {
      const converted: ExecutionStep[] = astTrace.steps.map((s, idx) => ({
        stepNumber: s.stepNumber,
        lineNumber: s.lineNumber,
        codeLine: s.codeLine,
        actionType: s.actionType,
        whatIsHappening: s.internalNote || `Executing line ${s.lineNumber}.`,
        whyRequired: 'Part of the live JavaScript execution sequence.',
        whatHappensInternally: s.internalNote,
        output:
          s.consoleOutput.length > 0
            ? `Console: ${s.consoleOutput[s.consoleOutput.length - 1]}`
            : 'Updates runtime memory without printing output.',
        whatHappensNext:
          idx < astTrace.steps.length - 1
            ? `Moves to line ${astTrace.steps[idx + 1].lineNumber}.`
            : 'Execution finishes.',
        variables: s.variables,
        heapObjects: s.heapObjects,
        callStack: s.callStack,
        consoleOutput: s.consoleOutput,
        dependsOnLines: s.dependsOnLines ?? [],
        feedsIntoLines: s.feedsIntoLines ?? [],
      }));
      return { steps: converted, source: 'ast-sandbox' };
    }
  }

  return {
    steps: buildStructuralExecutionSteps(code, language),
    source: 'live-structural',
  };
}

/**
 * Guarantees multi-line code never collapses into a broken 1-step trace.
 */
export function ensureMultiLineSteps(
  aiSteps: ExecutionStep[],
  code: string,
  language: string
): ExecutionStep[] {
  const nonEmptyCount = code
    .split('\n')
    .filter((l) => l.trim() && !/^[{}()[\];,]+$/.test(l.trim())).length;

  if (aiSteps.length >= 2 || nonEmptyCount <= 1) {
    return aiSteps;
  }

  const structural = buildStructuralExecutionSteps(code, language);
  if (structural.length <= aiSteps.length) {
    return aiSteps;
  }

  // Keep any rich AI explanation matching line 1 / matching line numbers while expanding all lines
  const aiByLine = new Map<number, ExecutionStep>();
  for (const s of aiSteps) {
    if (s.lineNumber && !aiByLine.has(s.lineNumber)) {
      aiByLine.set(s.lineNumber, s);
    }
  }

  return structural.map((st) => {
    const match = aiByLine.get(st.lineNumber);
    if (!match) return st;
    return {
      ...st,
      whatIsHappening: match.whatIsHappening || st.whatIsHappening,
      whyRequired: match.whyRequired || st.whyRequired,
      whatHappensInternally: match.whatHappensInternally || st.whatHappensInternally,
      output: match.output || st.output,
      whatHappensNext: match.whatHappensNext || st.whatHappensNext,
    };
  });
}
