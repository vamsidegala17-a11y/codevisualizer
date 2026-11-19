import * as acorn from 'acorn';
import { transform } from 'sucrase';
import type {
  CallStackFrame,
  DeterministicTracePayload,
  ExecutionStep,
  FlowchartEdgeData,
  FlowchartNodeData,
  HeapObject,
  LineDependencyRef,
  VariableSnapshot,
} from '../types/visualizer';

// Minimal AST node interface matching ESTree / Acorn output
interface AstNode {
  type: string;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: unknown;
}

class ReturnSignal {
  constructor(public value: unknown) {}
}
class BreakSignal {}
class ContinueSignal {}

interface Env {
  scopeName: string;
  parent: Env | null;
  bindings: Map<string, unknown>;
  defLines: Map<string, number>;
}

const MAX_STEPS = 160;

export function traceJavaScript(
  rawCode: string,
  language: string
): DeterministicTracePayload {
  const lines = rawCode.split('\n');
  let jsCode = rawCode;

  // Strip TypeScript syntax while keeping lines intact when possible
  if (language === 'typescript' || language === 'react' || language === 'nextjs') {
    try {
      const transformed = transform(rawCode, {
        transforms: language === 'typescript' ? ['typescript'] : ['typescript', 'jsx'],
      });
      jsCode = transformed.code;
    } catch {
      // Fallback to raw code if transform fails
    }
  }

  let ast: AstNode;
  try {
    ast = acorn.parse(jsCode, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }) as unknown as AstNode;
  } catch (err) {
    return {
      supported: false,
      parseError: err instanceof Error ? err.message : 'Unable to parse syntax',
      steps: [],
      flowchart: { nodes: [], edges: [] },
      functionsFound: [],
    };
  }

  const body = (ast.body as AstNode[]) ?? [];
  const functionsFound = extractFunctions(body);
  const flowchart = buildAstFlowchart(body, lines);

  // If the code imports external frameworks (react, express, next) or declares no executable top-level calls,
  // skip runtime stepping and let AI + AST facts handle conceptual & structural tracing.
  const hasExternalImport = body.some((n) => n.type === 'ImportDeclaration');
  if (hasExternalImport) {
    return {
      supported: false,
      steps: [],
      flowchart,
      functionsFound,
    };
  }

  // Sandboxed heap + call stack + environment state
  const heapObjects = new Map<object, HeapObject>();
  let nextHeapId = 1;

  const ensureHeapEntry = (val: unknown, hintLabel = 'object'): string | undefined => {
    if (val === null || typeof val !== 'object') return undefined;
    const obj = val as object;
    if (!heapObjects.has(obj)) {
      const id = `#${nextHeapId++}`;
      const isArr = Array.isArray(val);
      heapObjects.set(obj, {
        id,
        kind: isArr ? 'array' : 'object',
        label: isArr ? `Array(${(val as unknown[]).length})` : hintLabel,
        entries: [],
      });
    }
    refreshHeapEntry(obj);
    return heapObjects.get(obj)?.id;
  };

  const refreshHeapEntry = (obj: object) => {
    const entry = heapObjects.get(obj);
    if (!entry) return;
    if (Array.isArray(obj)) {
      entry.label = `Array(${obj.length})`;
      entry.entries = obj.slice(0, 12).map((item, idx) => ({
        key: String(idx),
        value: formatValue(item),
        ref: item !== null && typeof item === 'object' ? heapObjects.get(item as object)?.id : undefined,
      }));
    } else {
      const keys = Object.keys(obj);
      entry.entries = keys.slice(0, 12).map((k) => {
        const v = (obj as Record<string, unknown>)[k];
        return {
          key: k,
          value: formatValue(v),
          ref: v !== null && typeof v === 'object' ? heapObjects.get(v as object)?.id : undefined,
        };
      });
    }
  };

  const refreshAllHeap = () => {
    for (const obj of heapObjects.keys()) {
      refreshHeapEntry(obj);
    }
  };

  const formatValue = (val: unknown): string => {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'string') return JSON.stringify(val);
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'function') return `fn ${(val as { __fnName?: string }).__fnName || 'anonymous'}()`;
    if (Array.isArray(val)) {
      const preview = val.slice(0, 5).map((item) => formatValue(item)).join(', ');
      return `[${preview}${val.length > 5 ? ', …' : ''}]`;
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>)
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${formatValue(v)}`);
      return `{ ${entries.join(', ')}${Object.keys(val as object).length > 4 ? ', …' : ''} }`;
    }
    return String(val);
  };

  const getTypeLabel = (val: unknown): string => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  };

  const globalEnv: Env = {
    scopeName: 'global',
    parent: null,
    bindings: new Map(),
    defLines: new Map(),
  };

  const stepDepsStack: Array<Map<string, LineDependencyRef>> = [];
  const addStepDep = (dep: LineDependencyRef, currentLine: number) => {
    if (dep.lineNumber <= 0 || dep.lineNumber === currentLine) return;
    const top = stepDepsStack[stepDepsStack.length - 1];
    if (!top) return;
    const key = `${dep.lineNumber}:${dep.symbol}`;
    if (!top.has(key)) {
      top.set(key, dep);
    }
  };
  let lastReturnLine: number | null = null;

  const consoleOutput: string[] = [];
  const callStack: CallStackFrame[] = [
    {
      id: 'frame-global',
      functionName: 'Global Scope',
      argumentsSummary: 'main script',
      line: 1,
      status: 'active',
    },
  ];

  // Safe built-ins inside sandbox
  const safeConsole = {
    log: (...args: unknown[]) => {
      const rendered = args
        .map((a) => (typeof a === 'string' ? a : formatValue(a)))
        .join(' ');
      consoleOutput.push(rendered);
    },
  };

  const steps: DeterministicTracePayload['steps'] = [];
  let prevVarMap = new Map<string, string>();
  let abortedReason: string | undefined;
  const unresolvedIdentifiers = new Set<string>();
  let executedCallablesCount = 0;

  const collectVariables = (env: Env): VariableSnapshot[] => {
    const chain: Env[] = [];
    let curr: Env | null = env;
    while (curr) {
      chain.unshift(curr);
      curr = curr.parent;
    }
    const snapshots: VariableSnapshot[] = [];
    const nextVarMap = new Map<string, string>();

    for (const scope of chain) {
      for (const [name, val] of scope.bindings.entries()) {
        if (typeof val === 'function' && scope.scopeName === 'global') {
          // Still show function declarations concisely or skip clutter if desired; showing them helps beginners!
        }
        const formatted = formatValue(val);
        const key = `${scope.scopeName}:${name}`;
        const prev = prevVarMap.get(key);
        const changed = prev !== undefined ? prev !== formatted : true;
        nextVarMap.set(key, formatted);
        const heapRef = val !== null && typeof val === 'object' ? ensureHeapEntry(val, name) : undefined;
        snapshots.push({
          name,
          value: formatted,
          type: getTypeLabel(val),
          scope: scope.scopeName,
          changed,
          previousValue: prev !== undefined && prev !== formatted ? prev : undefined,
          heapRef,
        });
      }
    }
    prevVarMap = nextVarMap;
    return snapshots;
  };

  const recordStep = (
    node: AstNode,
    actionType: ExecutionStep['actionType'],
    env: Env,
    internalNote: string
  ) => {
    if (steps.length >= MAX_STEPS) {
      throw new Error('STEP_LIMIT_REACHED');
    }
    const lineNumber = node.loc?.start.line ?? 1;
    const codeLine = (lines[lineNumber - 1] ?? '').trim();
    refreshAllHeap();
    const variables = collectVariables(env);
    const activeDeps = stepDepsStack[stepDepsStack.length - 1];
    const dependsOnLines = activeDeps
      ? Array.from(activeDeps.values()).filter((d) => d.lineNumber !== lineNumber)
      : [];
    steps.push({
      stepNumber: steps.length + 1,
      lineNumber,
      codeLine: codeLine || node.type,
      actionType,
      variables,
      heapObjects: Array.from(heapObjects.values()).map((h) => ({
        ...h,
        entries: [...h.entries],
      })),
      callStack: callStack.map((f) => ({ ...f })),
      consoleOutput: [...consoleOutput],
      internalNote,
      dependsOnLines,
      feedsIntoLines: [],
    });
  };

  const lookupEnv = (env: Env, name: string): Env | null => {
    let curr: Env | null = env;
    while (curr) {
      if (curr.bindings.has(name)) return curr;
      curr = curr.parent;
    }
    return null;
  };

  const assignPattern = (pattern: AstNode, value: unknown, env: Env, defLine: number) => {
    if (pattern.type === 'Identifier') {
      const name = pattern.name as string;
      if (value !== null && typeof value === 'object') {
        ensureHeapEntry(value, name);
      }
      env.bindings.set(name, value);
      env.defLines.set(name, defLine);
      return;
    }
    if (pattern.type === 'ArrayPattern') {
      const elements = (pattern.elements as Array<AstNode | null>) ?? [];
      const arr = Array.isArray(value) ? value : [];
      elements.forEach((el, idx) => {
        if (el) assignPattern(el, arr[idx], env, defLine);
      });
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      const props = (pattern.properties as AstNode[]) ?? [];
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      for (const prop of props) {
        if (prop.type === 'Property') {
          const keyNode = prop.key as AstNode;
          const keyName = (keyNode.name as string) ?? String(keyNode.value);
          assignPattern(prop.value as AstNode, obj[keyName], env, defLine);
        }
      }
    }
  };

  const makeCallable = (
    fnNode: AstNode,
    closureEnv: Env,
    explicitName?: string
  ) => {
    const fnName =
      explicitName ||
      ((fnNode.id as AstNode | undefined)?.name as string | undefined) ||
      'anonymous';
    const callable = (...args: unknown[]) => {
      executedCallablesCount += 1;
      const fnEnv: Env = {
        scopeName: `${fnName}()`,
        parent: closureEnv,
        bindings: new Map(),
        defLines: new Map(),
      };
      const callLine = fnNode.loc?.start.line ?? 1;
      const callerActiveLine = callStack[callStack.length - 1]?.line ?? callLine;
      const params = (fnNode.params as AstNode[]) ?? [];
      params.forEach((param, idx) => {
        if (param.type === 'AssignmentPattern') {
          const left = param.left as AstNode;
          const val = args[idx] !== undefined ? args[idx] : evalExpr(param.right as AstNode, fnEnv);
          assignPattern(left, val, fnEnv, callLine);
        } else if (param.type === 'RestElement') {
          assignPattern(param.argument as AstNode, args.slice(idx), fnEnv, callLine);
        } else {
          assignPattern(param, args[idx], fnEnv, callLine);
        }
      });

      const frame: CallStackFrame = {
        id: `frame-${callStack.length + 1}-${Date.now()}`,
        functionName: fnName,
        argumentsSummary: args.map((a) => formatValue(a)).join(', ') || 'none',
        line: callLine,
        status: 'active',
      };
      if (callStack.length > 0) {
        callStack[callStack.length - 1].status = 'paused';
      }
      callStack.push(frame);
      lastReturnLine = null;

      let retVal: unknown = undefined;
      const fnBody = fnNode.body as AstNode;
      if (fnBody.type === 'BlockStatement') {
        const res = execBlock((fnBody.body as AstNode[]) ?? [], fnEnv);
        if (res instanceof ReturnSignal) {
          retVal = res.value;
        }
      } else {
        retVal = evalExpr(fnBody, fnEnv);
      }

      if (lastReturnLine && callerActiveLine) {
        addStepDep(
          {
            lineNumber: lastReturnLine,
            symbol: `${fnName}() return`,
            reason: `Uses return value computed on line ${lastReturnLine}`,
          },
          callerActiveLine
        );
      }

      frame.status = 'returning';
      frame.returnValue = formatValue(retVal);
      callStack.pop();
      if (callStack.length > 0) {
        callStack[callStack.length - 1].status = 'active';
      }
      return retVal;
    };
    (callable as { __fnName?: string }).__fnName = fnName;
    return callable;
  };

  const evalExpr = (node: AstNode, env: Env): unknown => {
    switch (node.type) {
      case 'Literal':
        return node.value;
      case 'TemplateLiteral': {
        const quasis = (node.quasis as AstNode[]) ?? [];
        const expressions = (node.expressions as AstNode[]) ?? [];
        let out = '';
        for (let i = 0; i < quasis.length; i++) {
          out += ((quasis[i].value as { cooked?: string })?.cooked ?? '') as string;
          if (i < expressions.length) {
            out += String(evalExpr(expressions[i], env));
          }
        }
        return out;
      }
      case 'Identifier': {
        const name = node.name as string;
        if (name === 'undefined') return undefined;
        if (name === 'NaN') return NaN;
        if (name === 'Infinity') return Infinity;
        if (name === 'console') return safeConsole;
        if (name === 'Math') return Math;
        if (name === 'Number') return Number;
        if (name === 'String') return String;
        if (name === 'Boolean') return Boolean;
        if (name === 'Array') return Array;
        if (name === 'Object') return Object;
        if (name === 'JSON') return JSON;
        if (name === 'parseInt') return parseInt;
        if (name === 'parseFloat') return parseFloat;
        const found = lookupEnv(env, name);
        if (found) {
          const defLine = found.defLines.get(name);
          const curLine = node.loc?.start.line ?? 1;
          if (defLine) {
            const val = found.bindings.get(name);
            addStepDep(
              {
                lineNumber: defLine,
                symbol: name,
                reason:
                  typeof val === 'function'
                    ? `Calls ${name}() defined on line ${defLine}`
                    : `Reads "${name}" defined/updated on line ${defLine}`,
              },
              curLine
            );
          }
          return found.bindings.get(name);
        }
        unresolvedIdentifiers.add(name);
        return undefined;
      }
      case 'ArrayExpression': {
        const arr = ((node.elements as Array<AstNode | null>) ?? []).map((el) =>
          el ? evalExpr(el, env) : undefined
        );
        ensureHeapEntry(arr, 'array');
        return arr;
      }
      case 'ObjectExpression': {
        const obj: Record<string, unknown> = {};
        for (const prop of (node.properties as AstNode[]) ?? []) {
          if (prop.type === 'Property') {
            const keyNode = prop.key as AstNode;
            const key = prop.computed
              ? String(evalExpr(keyNode, env))
              : ((keyNode.name as string) ?? String(keyNode.value));
            obj[key] = evalExpr(prop.value as AstNode, env);
          } else if (prop.type === 'SpreadElement') {
            const spread = evalExpr(prop.argument as AstNode, env);
            if (spread && typeof spread === 'object') {
              Object.assign(obj, spread);
            }
          }
        }
        ensureHeapEntry(obj, 'object');
        return obj;
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return makeCallable(node, env);
      case 'UnaryExpression': {
        const arg = evalExpr(node.argument as AstNode, env);
        switch (node.operator) {
          case '!':
            return !arg;
          case '-':
            return -(arg as number);
          case '+':
            return +(arg as number);
          case 'typeof':
            return typeof arg;
          default:
            return undefined;
        }
      }
      case 'BinaryExpression': {
        const l = evalExpr(node.left as AstNode, env);
        const r = evalExpr(node.right as AstNode, env);
        switch (node.operator) {
          case '+':
            return (l as number) + (r as number);
          case '-':
            return (l as number) - (r as number);
          case '*':
            return (l as number) * (r as number);
          case '/':
            return (l as number) / (r as number);
          case '%':
            return (l as number) % (r as number);
          case '**':
            return (l as number) ** (r as number);
          case '===':
            return l === r;
          case '!==':
            return l !== r;
          case '==':
            // eslint-disable-next-line eqeqeq
            return l == r;
          case '!=':
            // eslint-disable-next-line eqeqeq
            return l != r;
          case '<':
            return (l as number) < (r as number);
          case '<=':
            return (l as number) <= (r as number);
          case '>':
            return (l as number) > (r as number);
          case '>=':
            return (l as number) >= (r as number);
          default:
            return undefined;
        }
      }
      case 'LogicalExpression': {
        const l = evalExpr(node.left as AstNode, env);
        if (node.operator === '&&') return l ? evalExpr(node.right as AstNode, env) : l;
        if (node.operator === '||') return l ? l : evalExpr(node.right as AstNode, env);
        if (node.operator === '??') return l ?? evalExpr(node.right as AstNode, env);
        return undefined;
      }
      case 'ConditionalExpression':
        return evalExpr(node.test as AstNode, env)
          ? evalExpr(node.consequent as AstNode, env)
          : evalExpr(node.alternate as AstNode, env);
      case 'MemberExpression': {
        const obj = evalExpr(node.object as AstNode, env);
        if (obj === null || obj === undefined) return undefined;
        const prop = node.computed
          ? String(evalExpr(node.property as AstNode, env))
          : ((node.property as AstNode).name as string);
        const val = (obj as Record<string, unknown>)[prop];
        if (typeof val === 'function') {
          return val.bind(obj);
        }
        return val;
      }
      case 'AssignmentExpression': {
        const right = evalExpr(node.right as AstNode, env);
        const left = node.left as AstNode;
        const op = node.operator as string;
        if (left.type === 'Identifier') {
          const name = left.name as string;
          const targetEnv = lookupEnv(env, name) ?? env;
          const prevDefLine = targetEnv.defLines.get(name);
          const curLine = node.loc?.start.line ?? 1;
          if (op !== '=' && prevDefLine) {
            addStepDep(
              {
                lineNumber: prevDefLine,
                symbol: name,
                reason: `Reads previous value of "${name}" from line ${prevDefLine}`,
              },
              curLine
            );
          }
          const prev = targetEnv.bindings.get(name);
          const next = applyCompoundOp(op, prev, right);
          if (next !== null && typeof next === 'object') ensureHeapEntry(next, name);
          targetEnv.bindings.set(name, next);
          targetEnv.defLines.set(name, curLine);
          return next;
        }
        if (left.type === 'MemberExpression') {
          const targetObj = evalExpr(left.object as AstNode, env) as Record<string, unknown>;
          const prop = left.computed
            ? String(evalExpr(left.property as AstNode, env))
            : ((left.property as AstNode).name as string);
          if (targetObj && typeof targetObj === 'object') {
            const next = applyCompoundOp(op, targetObj[prop], right);
            targetObj[prop] = next;
            refreshAllHeap();
            return next;
          }
        }
        return right;
      }
      case 'UpdateExpression': {
        const arg = node.argument as AstNode;
        if (arg.type === 'Identifier') {
          const name = arg.name as string;
          const targetEnv = lookupEnv(env, name) ?? env;
          const curLine = node.loc?.start.line ?? 1;
          const prevDefLine = targetEnv.defLines.get(name);
          if (prevDefLine) {
            addStepDep(
              {
                lineNumber: prevDefLine,
                symbol: name,
                reason: `Updates "${name}" from line ${prevDefLine}`,
              },
              curLine
            );
          }
          const current = Number(targetEnv.bindings.get(name) ?? 0);
          const next = node.operator === '++' ? current + 1 : current - 1;
          targetEnv.bindings.set(name, next);
          targetEnv.defLines.set(name, curLine);
          return node.prefix ? next : current;
        }
        return undefined;
      }
      case 'CallExpression': {
        const calleeNode = node.callee as AstNode;
        const args = ((node.arguments as AstNode[]) ?? []).map((a) => evalExpr(a, env));
        if (calleeNode.type === 'MemberExpression') {
          const obj = evalExpr(calleeNode.object as AstNode, env);
          const prop = calleeNode.computed
            ? String(evalExpr(calleeNode.property as AstNode, env))
            : ((calleeNode.property as AstNode).name as string);
          if (obj && typeof (obj as Record<string, unknown>)[prop] === 'function') {
            const fn = (obj as Record<string, (...a: unknown[]) => unknown>)[prop];
            return fn.apply(obj, args);
          }
          return undefined;
        }
        const fn = evalExpr(calleeNode, env);
        if (typeof fn === 'function') {
          return (fn as (...a: unknown[]) => unknown)(...args);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const applyCompoundOp = (op: string, prev: unknown, right: unknown): unknown => {
    switch (op) {
      case '=':
        return right;
      case '+=':
        return (prev as number) + (right as number);
      case '-=':
        return (prev as number) - (right as number);
      case '*=':
        return (prev as number) * (right as number);
      case '/=':
        return (prev as number) / (right as number);
      default:
        return right;
    }
  };

  const execStmt = (node: AstNode, env: Env): unknown => {
    const stmtLine = node.loc?.start.line ?? 1;
    stepDepsStack.push(new Map());
    try {
      switch (node.type) {
        case 'FunctionDeclaration': {
          const name = (node.id as AstNode).name as string;
          const fn = makeCallable(node, env, name);
          env.bindings.set(name, fn);
          env.defLines.set(name, stmtLine);
          recordStep(node, 'define', env, `Defined function "${name}" in ${env.scopeName}`);
          return undefined;
        }
        case 'VariableDeclaration': {
          const declarators = (node.declarations as AstNode[]) ?? [];
          for (const decl of declarators) {
            const initVal = decl.init ? evalExpr(decl.init as AstNode, env) : undefined;
            assignPattern(decl.id as AstNode, initVal, env, stmtLine);
            const isCall = (decl.init as AstNode | null)?.type === 'CallExpression';
            recordStep(
              node,
              isCall ? 'call' : 'declare',
              env,
              `Declared ${String(node.kind)} variable with value ${formatValue(initVal)}`
            );
          }
          return undefined;
        }
        case 'ExpressionStatement': {
          const expr = node.expression as AstNode;
          const isConsoleLog =
            expr.type === 'CallExpression' &&
            (expr.callee as AstNode).type === 'MemberExpression' &&
            ((expr.callee as AstNode).object as AstNode).name === 'console';
          evalExpr(expr, env);
          const actionType: ExecutionStep['actionType'] = isConsoleLog
            ? 'output'
            : expr.type === 'CallExpression'
              ? 'call'
              : 'assign';
          recordStep(
            node,
            actionType,
            env,
            isConsoleLog
              ? `Printed output to console: ${consoleOutput[consoleOutput.length - 1] ?? ''}`
              : `Evaluated ${expr.type}`
          );
          return undefined;
        }
        case 'IfStatement': {
          const cond = Boolean(evalExpr(node.test as AstNode, env));
          recordStep(node, 'branch', env, `Evaluated condition -> ${cond}`);
          if (cond) {
            return execStmt(node.consequent as AstNode, env);
          }
          if (node.alternate) {
            return execStmt(node.alternate as AstNode, env);
          }
          return undefined;
        }
        case 'BlockStatement':
          return execBlock((node.body as AstNode[]) ?? [], env);
        case 'ForStatement': {
          const loopEnv: Env = {
            scopeName: `${env.scopeName} [for]`,
            parent: env,
            bindings: new Map(),
            defLines: new Map(),
          };
          if (node.init) {
            if ((node.init as AstNode).type === 'VariableDeclaration') {
              execStmt(node.init as AstNode, loopEnv);
            } else {
              evalExpr(node.init as AstNode, loopEnv);
            }
          }
          while (true) {
            const shouldRun = node.test ? Boolean(evalExpr(node.test as AstNode, loopEnv)) : true;
            recordStep(node, 'loop', loopEnv, `Loop check -> ${shouldRun}`);
            if (!shouldRun) break;
            const res = execStmt(node.body as AstNode, loopEnv);
            if (res instanceof ReturnSignal) return res;
            if (res instanceof BreakSignal) break;
            if (node.update) {
              evalExpr(node.update as AstNode, loopEnv);
              recordStep(node, 'assign', loopEnv, 'Updated loop counter');
            }
          }
          return undefined;
        }
        case 'ForOfStatement': {
          const iterable = evalExpr(node.right as AstNode, env);
          const items = Array.isArray(iterable) ? iterable : [];
          const loopEnv: Env = {
            scopeName: `${env.scopeName} [for-of]`,
            parent: env,
            bindings: new Map(),
            defLines: new Map(),
          };
          for (const item of items) {
            if ((node.left as AstNode).type === 'VariableDeclaration') {
              const decl = ((node.left as AstNode).declarations as AstNode[])[0];
              assignPattern(decl.id as AstNode, item, loopEnv, stmtLine);
            }
            recordStep(node, 'loop', loopEnv, `Iterating item ${formatValue(item)}`);
            const res = execStmt(node.body as AstNode, loopEnv);
            if (res instanceof ReturnSignal) return res;
            if (res instanceof BreakSignal) break;
          }
          return undefined;
        }
        case 'WhileStatement': {
          while (Boolean(evalExpr(node.test as AstNode, env))) {
            recordStep(node, 'loop', env, 'While condition is true');
            const res = execStmt(node.body as AstNode, env);
            if (res instanceof ReturnSignal) return res;
            if (res instanceof BreakSignal) break;
          }
          return undefined;
        }
        case 'DoWhileStatement': {
          do {
            recordStep(node, 'loop', env, 'Executing do-while iteration');
            const res = execStmt(node.body as AstNode, env);
            if (res instanceof ReturnSignal) return res;
            if (res instanceof BreakSignal) break;
          } while (Boolean(evalExpr(node.test as AstNode, env)));
          return undefined;
        }
        case 'TryStatement': {
          recordStep(node, 'branch', env, 'Entering try block');
          try {
            const res = execStmt(node.block as AstNode, env);
            if (res instanceof ReturnSignal || res instanceof BreakSignal || res instanceof ContinueSignal) {
              return res;
            }
          } catch (err) {
            const handler = node.handler as AstNode | null;
            if (handler) {
              const catchEnv: Env = {
                scopeName: `${env.scopeName} [catch]`,
                parent: env,
                bindings: new Map(),
                defLines: new Map(),
              };
              if (handler.param) {
                assignPattern(handler.param as AstNode, err instanceof Error ? err.message : String(err), catchEnv, handler.loc?.start.line ?? stmtLine);
              }
              recordStep(handler, 'branch', catchEnv, 'Caught exception in catch block');
              execStmt(handler.body as AstNode, catchEnv);
            }
          } finally {
            if (node.finalizer) {
              execStmt(node.finalizer as AstNode, env);
            }
          }
          return undefined;
        }
        case 'SwitchStatement': {
          const disc = evalExpr(node.discriminant as AstNode, env);
          recordStep(node, 'branch', env, `Evaluating switch(${formatValue(disc)})`);
          const cases = (node.cases as AstNode[]) ?? [];
          let matched = false;
          for (const c of cases) {
            const isDefault = !c.test;
            if (!matched && (isDefault || evalExpr(c.test as AstNode, env) === disc)) {
              matched = true;
            }
            if (matched) {
              const res = execBlock((c.consequent as AstNode[]) ?? [], env);
              if (res instanceof ReturnSignal) return res;
              if (res instanceof BreakSignal) break;
            }
          }
          return undefined;
        }
        case 'ThrowStatement': {
          const errVal = node.argument ? evalExpr(node.argument as AstNode, env) : 'Error';
          recordStep(node, 'branch', env, `Throws ${formatValue(errVal)}`);
          throw new Error(String(errVal));
        }
        case 'ReturnStatement': {
          const val = node.argument ? evalExpr(node.argument as AstNode, env) : undefined;
          lastReturnLine = stmtLine;
          recordStep(node, 'return', env, `Returning ${formatValue(val)}`);
          return new ReturnSignal(val);
        }
        case 'BreakStatement':
          return new BreakSignal();
        case 'ContinueStatement':
          return new ContinueSignal();
        default:
          return undefined;
      }
    } finally {
      stepDepsStack.pop();
    }
  };

  const execBlock = (stmts: AstNode[], env: Env): unknown => {
    for (const stmt of stmts) {
      const res = execStmt(stmt, env);
      if (res instanceof ReturnSignal || res instanceof BreakSignal || res instanceof ContinueSignal) {
        return res;
      }
    }
    return undefined;
  };

  try {
    // Hoist function declarations so calls before declarations work accurately, while still stepping declarations in source order if needed
    for (const stmt of body) {
      if (stmt.type === 'FunctionDeclaration') {
        const name = (stmt.id as AstNode).name as string;
        globalEnv.bindings.set(name, makeCallable(stmt, globalEnv, name));
        globalEnv.defLines.set(name, stmt.loc?.start.line ?? 1);
      }
    }
    execBlock(body, globalEnv);
  } catch (err) {
    if (err instanceof Error && err.message === 'STEP_LIMIT_REACHED') {
      abortedReason = 'Execution trace capped at 160 steps to prevent infinite loops.';
    } else {
      abortedReason = err instanceof Error ? err.message : 'Runtime trace stopped';
    }
  }

  // Build reverse dependency edges (feedsIntoLines) across executed steps
  for (const consumerStep of steps) {
    for (const dep of consumerStep.dependsOnLines ?? []) {
      for (const producerStep of steps) {
        if (producerStep.lineNumber === dep.lineNumber && producerStep.stepNumber !== consumerStep.stepNumber) {
          const feeds = producerStep.feedsIntoLines ?? [];
          if (!feeds.some((f) => f.lineNumber === consumerStep.lineNumber && f.symbol === dep.symbol)) {
            feeds.push({
              lineNumber: consumerStep.lineNumber,
              symbol: dep.symbol,
              reason: `Provides "${dep.symbol}" to line ${consumerStep.lineNumber}`,
            });
            producerStep.feedsIntoLines = feeds;
          }
        }
      }
    }
  }

  const meaningfulLineCount = lines.filter(
    (l) => l.trim() && !/^(?:\/\/|\/\*|\*)|^[{}()[\];,]+$/.test(l.trim())
  ).length;
  const hasAnyCallbacks = /=>|\bfunction\s*\(/.test(rawCode);

  const isPartialOrCollapsedTrace =
    steps.length === 0 ||
    unresolvedIdentifiers.size > 0 ||
    (meaningfulLineCount >= 3 && steps.length <= 1) ||
    (hasAnyCallbacks && executedCallablesCount === 0 && meaningfulLineCount >= 2);

  return {
    supported: !isPartialOrCollapsedTrace,
    parseError: abortedReason,
    steps: isPartialOrCollapsedTrace ? [] : steps,
    flowchart,
    functionsFound,
  };
}

function extractFunctions(body: AstNode[]) {
  const results: Array<{ name: string; params: string[]; line: number; kind: string }> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as AstNode;
    if (n.type === 'FunctionDeclaration' && n.id) {
      results.push({
        name: (n.id as AstNode).name as string,
        params: ((n.params as AstNode[]) ?? []).map((p) => (p.name as string) || 'param'),
        line: n.loc?.start.line ?? 1,
        kind: 'function',
      });
    } else if (n.type === 'ClassDeclaration' && n.id) {
      results.push({
        name: (n.id as AstNode).name as string,
        params: [],
        line: n.loc?.start.line ?? 1,
        kind: 'class',
      });
    } else if (n.type === 'VariableDeclarator' && n.id && n.init) {
      const init = n.init as AstNode;
      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        results.push({
          name: (n.id as AstNode).name as string,
          params: ((init.params as AstNode[]) ?? []).map((p) => (p.name as string) || 'param'),
          line: n.loc?.start.line ?? 1,
          kind: 'function',
        });
      }
    }
    for (const key of Object.keys(n)) {
      if (key !== 'loc') walk(n[key]);
    }
  };
  walk(body);
  return results;
}

function buildAstFlowchart(
  body: AstNode[],
  lines: string[]
): { nodes: FlowchartNodeData[]; edges: FlowchartEdgeData[] } {
  const nodes: FlowchartNodeData[] = [
    {
      id: 'flow-start',
      label: 'Start Program',
      kind: 'start',
      lineNumber: 1,
      stepNumbers: [1],
      detail: 'Program execution begins here',
    },
  ];
  const edges: FlowchartEdgeData[] = [];
  let prevId = 'flow-start';
  let idx = 1;

  for (const stmt of body.slice(0, 14)) {
    const lineNum = stmt.loc?.start.line ?? 1;
    const rawLine = (lines[lineNum - 1] ?? '').trim();
    const id = `flow-node-${idx++}`;
    let kind: FlowchartNodeData['kind'] = 'process';
    let label = rawLine.slice(0, 40) || stmt.type;

    if (stmt.type === 'FunctionDeclaration') {
      kind = 'call';
      label = `Define ${(stmt.id as AstNode)?.name ?? 'fn'}()`;
    } else if (stmt.type === 'IfStatement') {
      kind = 'decision';
      label = rawLine.slice(0, 36);
    } else if (
      stmt.type === 'ForStatement' ||
      stmt.type === 'WhileStatement' ||
      stmt.type === 'ForOfStatement'
    ) {
      kind = 'loop';
      label = rawLine.slice(0, 36);
    } else if (stmt.type === 'ReturnStatement') {
      kind = 'output';
    } else if (rawLine.includes('console.log')) {
      kind = 'output';
    }

    nodes.push({
      id,
      label,
      kind,
      lineNumber: lineNum,
      stepNumbers: [],
      detail: rawLine,
    });
    edges.push({
      id: `edge-${prevId}-${id}`,
      source: prevId,
      target: id,
    });
    prevId = id;
  }

  nodes.push({
    id: 'flow-end',
    label: 'End Program',
    kind: 'end',
    lineNumber: Math.max(1, lines.length),
    stepNumbers: [],
    detail: 'Program finishes executing',
  });
  edges.push({
    id: `edge-${prevId}-flow-end`,
    source: prevId,
    target: 'flow-end',
  });

  return { nodes, edges };
}
