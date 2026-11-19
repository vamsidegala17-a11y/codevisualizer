export type SupportedLanguage =
  | 'auto'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'php'
  | 'java'
  | 'c'
  | 'cpp'
  | 'html'
  | 'css'
  | 'sql'
  | 'react'
  | 'nextjs'
  | 'laravel'
  | 'nodejs';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExplanationStyle = 'simple' | 'technical';

export interface VariableSnapshot {
  name: string;
  value: string;
  type: string;
  scope: string;
  changed: boolean;
  previousValue?: string;
  heapRef?: string;
}

export interface HeapObject {
  id: string;
  kind: 'object' | 'array' | 'function';
  label: string;
  entries: Array<{ key: string; value: string; ref?: string }>;
}

export interface CallStackFrame {
  id: string;
  functionName: string;
  argumentsSummary: string;
  line: number;
  status: 'active' | 'returning' | 'paused';
  returnValue?: string;
}

export interface LineDependencyRef {
  lineNumber: number;
  symbol: string;
  reason: string;
}

export interface ExecutionStep {
  stepNumber: number;
  lineNumber: number;
  codeLine: string;
  actionType:
    | 'declare'
    | 'assign'
    | 'call'
    | 'return'
    | 'branch'
    | 'loop'
    | 'output'
    | 'import'
    | 'define'
    | 'query'
    | 'render';
  whatIsHappening: string;
  whyRequired: string;
  whatHappensInternally: string;
  output: string;
  whatHappensNext: string;
  variables: VariableSnapshot[];
  heapObjects: HeapObject[];
  callStack: CallStackFrame[];
  consoleOutput: string[];
  flowNodeId?: string;
  dependsOnLines?: LineDependencyRef[];
  feedsIntoLines?: LineDependencyRef[];
}

export interface FlowchartNodeData {
  id: string;
  label: string;
  kind: 'start' | 'process' | 'decision' | 'loop' | 'call' | 'output' | 'end';
  lineNumber: number;
  stepNumbers: number[];
  detail: string;
}

export interface FlowchartEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ComponentOrFunctionItem {
  id: string;
  name: string;
  kind:
    | 'component'
    | 'function'
    | 'method'
    | 'class'
    | 'hook'
    | 'controller'
    | 'model'
    | 'route'
    | 'middleware';
  lineRange: string;
  purpose: string;
  parametersOrProps: string[];
  returnOrRenderBehavior: string;
  stateAndHooks: string[];
  internalInteractions: string;
  parentName?: string;
  childrenNames: string[];
}

export interface TerminologyEntry {
  term: string;
  category: string;
  simpleDefinition: string;
  whyUsed: string;
  howItWorks: string;
  whereUsedInCode: string;
  whereToUse?: string;
  whereNotToUse?: string;
  whereInBetweenUse?: string;
  example: string;
  relatedConcepts: string[];
}

export interface FrameworkUsageLocation {
  lineNumber: number;
  codeSnippet: string;
  roleExplanation: string;
}

export interface FrameworkEntry {
  name: string;
  kind: 'language' | 'framework' | 'library' | 'runtime' | 'package' | 'database';
  whatItIs: string;
  howItWorks: string;
  whyDevelopersUseIt: string;
  purposeInThisCode: string;
  whereToUse: string;
  whereNotToUse: string;
  whereInBetweenUse: string;
  interactions: string;
  importantMethods: string[];
  dependencies: string[];
  whereUsedLocations?: FrameworkUsageLocation[];
}

export interface SyntaxTokenBreakdown {
  token: string;
  howItWorks: string;
  purpose: string;
}

export interface LanguagePartItem {
  partName: string;
  category: string;
  syntaxToken: string;
  lineNumbers: number[];
  codeSnippet: string;
  whatItIs: string;
  howItWorks: string;
  purpose: string;
  whereToUse: string;
  whereNotToUse: string;
  whereInBetweenUse: string;
  explanation: string;
  frameworkUsage: string;
  syntaxBreakdown?: SyntaxTokenBreakdown[];
}

export interface LanguageConceptEntry {
  concept: string;
  syntaxFound: string;
  howItWorks?: string;
  purposeInThisCode?: string;
  explanation: string;
  whyLanguageDesignsItThisWay: string;
  miniExample: string;
}

export interface CodeIssue {
  lineNumber: number;
  severity: 'error' | 'warning' | 'tip';
  title: string;
  explanation: string;
  howToFix: string;
}

export interface CodeAnalysisResult {
  detectedLanguage: string;
  traceSource: 'ast-sandbox' | 'ai-structured';
  overview: {
    title: string;
    summary: string;
    whyWrittenThisWay: string;
    keyTakeaways: string[];
    complexitySummary: string;
  };
  executionSteps: ExecutionStep[];
  flowchart: {
    nodes: FlowchartNodeData[];
    edges: FlowchartEdgeData[];
  };
  componentsAndFunctions: ComponentOrFunctionItem[];
  terminology: TerminologyEntry[];
  frameworksAndLibraries: FrameworkEntry[];
  languageParts: LanguagePartItem[];
  taxonomyGuide: {
    languageVsFramework: string;
    libraryVsPackage: string;
    runtimeRole: string;
  };
  languageConcepts: LanguageConceptEntry[];
  codeQuality: {
    issues: CodeIssue[];
    bestPractices: string[];
    simplifiedCode: string;
    simplifiedExplanation: string;
    alternativeTitle: string;
    alternativeCode: string;
    alternativeExplanation: string;
  };
  expectedOutput: {
    outputKind: 'console' | 'html-preview' | 'table' | 'http-response';
    lines: string[];
    explanation: string;
    tableColumns?: string[];
    tableRows?: string[][];
    htmlPreviewSnippet?: string;
  };
  realWorldExample: {
    analogyTitle: string;
    analogyStory: string;
    mappingPoints: Array<{ codeElement: string; realWorldCounterpart: string }>;
    productionUseCase: string;
    practicalSnippet: string;
  };
}

export interface DeterministicTracePayload {
  supported: boolean;
  parseError?: string;
  steps: Array<{
    stepNumber: number;
    lineNumber: number;
    codeLine: string;
    actionType: ExecutionStep['actionType'];
    variables: VariableSnapshot[];
    heapObjects: HeapObject[];
    callStack: CallStackFrame[];
    consoleOutput: string[];
    internalNote: string;
    dependsOnLines?: LineDependencyRef[];
    feedsIntoLines?: LineDependencyRef[];
  }>;
  flowchart: {
    nodes: FlowchartNodeData[];
    edges: FlowchartEdgeData[];
  };
  functionsFound: Array<{ name: string; params: string[]; line: number; kind: string }>;
}

export interface StaticFacts {
  detectedLanguage: string;
  lineCount: number;
  imports: string[];
  frameworksDetected: string[];
  keywordsFound: string[];
  functionsFound: Array<{ name: string; line: number; kind: string }>;
}

export interface LineChatMessage {
  id: string;
  role: 'user' | 'assistant';
  lineNumber?: number;
  content: string;
}
