import type { DeterministicTracePayload, StaticFacts, SupportedLanguage } from '../types/visualizer';
import { detectLanguageFromCode } from './languageDetector';
import { traceJavaScript } from './jsTracer';

const FRAMEWORK_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'React', regex: /\b(from\s+['"]react['"]|useState|useEffect|useRef|useMemo|JSX)\b/ },
  { name: 'Next.js', regex: /\b(next\/|NextResponse|NextRequest|use client|use server)\b/ },
  { name: 'Node.js', regex: /\b(require\s*\(|process\.env|node:fs|http\.createServer)\b/ },
  { name: 'Express.js', regex: /\b(express\(\)|from\s+['"]express['"]|app\.(get|post|put|delete))\b/ },
  { name: 'Axios', regex: /\baxios\b/ },
  { name: 'Tailwind CSS', regex: /\bclassName=["'][^"']*\b(flex|grid|bg-|text-|px-|py-)\b/ },
  { name: 'Bootstrap', regex: /\bclass=["'][^"']*\b(btn-|container|row|col-)\b/ },
  { name: 'Material UI', regex: /@mui\/material/ },
  { name: 'Laravel', regex: /\b(Illuminate\\|Route::|Eloquent|extends\s+(Controller|Model))\b/ },
  { name: 'SQL / Relational DB', regex: /\b(SELECT\s+.+\s+FROM|INNER\s+JOIN|CREATE\s+TABLE)\b/i },
  { name: 'PostgreSQL / MySQL', regex: /\b(pg|mysql2|PDO|mysqli)\b/ },
];

const KEYWORD_GLOSSARY_PATTERNS: Array<{ term: string; regex: RegExp }> = [
  { term: 'Variable', regex: /\b(let|const|var|int|float|string|bool)\b|\$[a-zA-Z_]/ },
  { term: 'Constant', regex: /\b(const|final|define\(|CONST)\b/ },
  { term: 'Function', regex: /\b(function|def|fn|func|void)\b|=>/ },
  { term: 'Parameter & Argument', regex: /\([a-zA-Z_$][^)]*\)/ },
  { term: 'Return', regex: /\breturn\b/ },
  { term: 'Async / Await', regex: /\b(async|await)\b/ },
  { term: 'Promise', regex: /\b(Promise|\.then\(|\.catch\(|fetch\()\b/ },
  { term: 'Callback', regex: /\.\s*(map|filter|forEach|reduce|then|onClick|addEventListener)\s*\(/ },
  { term: 'Array / List', regex: /\[[^\]]*\]|\bArray\b|\bvector\b|\blist\(/ },
  { term: 'Object / Dictionary', regex: /\{[^}]*:[^}]*\}|\bdict\(/ },
  { term: 'Class & Constructor', regex: /\b(class|constructor|__construct|__init__)\b/ },
  { term: 'Component', regex: /<[A-Z][A-Za-z0-9]*/ },
  { term: 'Props', regex: /\bprops\b|\(\s*\{[^}]+\}\s*\)/ },
  { term: 'State & Hook', regex: /\buse(State|Effect|Memo|Callback|Ref|Reducer|Context)\b/ },
  { term: 'Route & Endpoint', regex: /\b(app\.(get|post|put|delete)|Route::|@GetMapping|@app\.route)\b/ },
  { term: 'Middleware', regex: /\b(app\.use|middleware|next\(\))\b/i },
  { term: 'Database Query', regex: /\b(SELECT|INSERT|UPDATE|DELETE|Order::create|findMany|query\()\b/i },
  { term: 'Module / Import / Export', regex: /\b(import|export|require\(|use\s+[A-Z]|#include)\b/ },
  { term: 'Loop', regex: /\b(for|while|foreach|do)\b/ },
  { term: 'Conditional Branch', regex: /\b(if|else|elif|switch|case)\b/ },
];

export function analyzeCodeDeterministically(
  code: string,
  selectedLanguage: SupportedLanguage
): {
  resolvedLanguage: Exclude<SupportedLanguage, 'auto'>;
  staticFacts: StaticFacts;
  deterministicTrace: DeterministicTracePayload | null;
} {
  const resolvedLanguage =
    selectedLanguage === 'auto' ? detectLanguageFromCode(code) : selectedLanguage;

  const lines = code.split('\n');
  const imports: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('from ') ||
      trimmed.startsWith('use ') ||
      trimmed.startsWith('#include') ||
      trimmed.includes('require(')
    ) {
      imports.push(trimmed);
    }
  }

  const frameworksDetected = FRAMEWORK_PATTERNS.filter((f) => f.regex.test(code)).map(
    (f) => f.name
  );
  const keywordsFound = KEYWORD_GLOSSARY_PATTERNS.filter((k) => k.regex.test(code)).map(
    (k) => k.term
  );

  // Extract generic function/class/route signatures across languages
  const functionsFound: Array<{ name: string; line: number; kind: string }> = [];
  lines.forEach((line, idx) => {
    const ln = idx + 1;
    const jsFn = line.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (jsFn) functionsFound.push({ name: jsFn[1], line: ln, kind: 'function' });

    const pyFn = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/);
    if (pyFn) functionsFound.push({ name: pyFn[1], line: ln, kind: 'function' });

    const cls = line.match(/\bclass\s+([A-Za-z_]\w*)/);
    if (cls) functionsFound.push({ name: cls[1], line: ln, kind: 'class' });

    const route = line.match(/\b(app|Route)\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/);
    if (route) functionsFound.push({ name: `${route[2].toUpperCase()} ${route[3]}`, line: ln, kind: 'route' });
  });

  let deterministicTrace: DeterministicTracePayload | null = null;
  if (
    resolvedLanguage === 'javascript' ||
    resolvedLanguage === 'typescript' ||
    resolvedLanguage === 'nodejs'
  ) {
    const traced = traceJavaScript(code, resolvedLanguage);
    if (traced.supported) {
      deterministicTrace = traced;
    } else if (traced.functionsFound.length > 0 && functionsFound.length === 0) {
      traced.functionsFound.forEach((f) =>
        functionsFound.push({ name: f.name, line: f.line, kind: f.kind })
      );
    }
  }

  return {
    resolvedLanguage,
    staticFacts: {
      detectedLanguage: resolvedLanguage,
      lineCount: lines.length,
      imports,
      frameworksDetected,
      keywordsFound,
      functionsFound,
    },
    deterministicTrace,
  };
}
