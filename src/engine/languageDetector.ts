import type { SupportedLanguage } from '../types/visualizer';

export interface LanguageOption {
  id: SupportedLanguage;
  label: string;
  monacoId: string;
  extensions: string[];
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'auto', label: 'Auto-Detect', monacoId: 'javascript', extensions: [] },
  { id: 'javascript', label: 'JavaScript', monacoId: 'javascript', extensions: ['.js', '.mjs', '.cjs'] },
  { id: 'typescript', label: 'TypeScript', monacoId: 'typescript', extensions: ['.ts'] },
  { id: 'react', label: 'React', monacoId: 'typescript', extensions: ['.jsx', '.tsx'] },
  { id: 'nextjs', label: 'Next.js', monacoId: 'typescript', extensions: ['.tsx', '.ts'] },
  { id: 'nodejs', label: 'Node.js', monacoId: 'javascript', extensions: ['.js', '.mjs'] },
  { id: 'python', label: 'Python', monacoId: 'python', extensions: ['.py'] },
  { id: 'php', label: 'PHP', monacoId: 'php', extensions: ['.php'] },
  { id: 'laravel', label: 'Laravel', monacoId: 'php', extensions: ['.php'] },
  { id: 'java', label: 'Java', monacoId: 'java', extensions: ['.java'] },
  { id: 'c', label: 'C', monacoId: 'c', extensions: ['.c', '.h'] },
  { id: 'cpp', label: 'C++', monacoId: 'cpp', extensions: ['.cpp', '.cc', '.hpp'] },
  { id: 'html', label: 'HTML', monacoId: 'html', extensions: ['.html', '.htm'] },
  { id: 'css', label: 'CSS', monacoId: 'css', extensions: ['.css'] },
  { id: 'sql', label: 'SQL', monacoId: 'sql', extensions: ['.sql'] },
];

export function getMonacoLanguage(lang: SupportedLanguage): string {
  return LANGUAGE_OPTIONS.find((opt) => opt.id === lang)?.monacoId ?? 'javascript';
}

export function getLanguageLabel(lang: SupportedLanguage): string {
  return LANGUAGE_OPTIONS.find((opt) => opt.id === lang)?.label ?? 'JavaScript';
}

export function detectLanguageFromFilename(filename: string): SupportedLanguage {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'react';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.hpp')) return 'cpp';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'javascript';
  return 'auto';
}

export function detectLanguageFromCode(code: string): Exclude<SupportedLanguage, 'auto'> {
  const src = code.trim();
  if (!src) return 'javascript';

  // Laravel / PHP
  if (
    src.includes('<?php') ||
    /\bIlluminate\\/.test(src) ||
    /\bRoute::(get|post|put|delete|resource)\b/.test(src) ||
    /\bEloquent\b|\bextends\s+Controller\b|\bextends\s+Model\b/.test(src)
  ) {
    if (
      /\bRoute::|\bIlluminate\\|\bextends\s+(Controller|Model)\b|\bRequest\s+\$request\b|\bview\(/.test(
        src
      )
    ) {
      return 'laravel';
    }
    return 'php';
  }
  if (/\$[a-zA-Z_]\w*\s*=/.test(src) && /(->|echo\s+|function\s+\w+\()/.test(src)) {
    return 'php';
  }

  // SQL
  if (
    /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|WITH\s+\w+\s+AS)\b/im.test(
      src
    ) &&
    /\b(FROM|WHERE|JOIN|VALUES|SET|GROUP\s+BY|ORDER\s+BY|PRIMARY\s+KEY)\b/i.test(src)
  ) {
    return 'sql';
  }

  // HTML
  if (
    /^\s*<!DOCTYPE\s+html>/i.test(src) ||
    (/<\s*(html|head|body|div|section|main|header|h1|p|form|button)\b[^>]*>/i.test(src) &&
      !/\b(import|export|function|const|let)\b/.test(src))
  ) {
    return 'html';
  }

  // CSS
  if (
    /^[.#@a-zA-Z*][^{]*\{[^}]*:\s*[^;]+;/m.test(src) &&
    !/\b(function|const|let|var|class|def|public|SELECT)\b/.test(src)
  ) {
    return 'css';
  }

  // Python
  if (
    /^\s*(def\s+\w+\s*\(|from\s+\w+\s+import\s+|import\s+\w+|elif\s+|print\s*\()/m.test(src) &&
    !/;\s*$/m.test(src)
  ) {
    return 'python';
  }

  // Java
  if (
    /\bpublic\s+(class|interface|enum)\s+\w+/.test(src) ||
    /\bSystem\.out\.println\b|\bpublic\s+static\s+void\s+main\b/.test(src)
  ) {
    return 'java';
  }

  // C++ vs C
  if (
    /#include\s*<(iostream|vector|string|algorithm|map|memory)>/.test(src) ||
    /\bstd::|\bcout\s*<<|\bcin\s*>>|\bnamespace\s+\w+/.test(src)
  ) {
    return 'cpp';
  }
  if (/#include\s*<(stdio\.h|stdlib\.h|string\.h)>|\bprintf\s*\(|\bscanf\s*\(/.test(src)) {
    return 'c';
  }

  // Next.js
  if (
    /['"]use (client|server)['"]/.test(src) ||
    /from\s+['"]next\/(navigation|link|image|server|headers)['"]/.test(src) ||
    /\bNextResponse\b|\bNextRequest\b|\bgetServerSideProps\b/.test(src)
  ) {
    return 'nextjs';
  }

  // React
  if (
    /from\s+['"]react['"]/.test(src) ||
    /\b(useState|useEffect|useMemo|useCallback|useRef)\b/.test(src) ||
    /return\s*\(\s*<[A-Za-z]/.test(src)
  ) {
    return 'react';
  }

  // Node.js
  if (
    /\brequire\s*\(['"]/.test(src) ||
    /from\s+['"](express|fs|path|http|node:)/.test(src) ||
    /\bapp\.(get|post|put|delete|use|listen)\s*\(/.test(src) ||
    /\bprocess\.env\b/.test(src)
  ) {
    return 'nodejs';
  }

  // TypeScript
  if (
    /\b(interface|type)\s+\w+\s*(=|\{)/.test(src) ||
    /:\s*(string|number|boolean|void|any|unknown|Record<|Array<)\b/.test(src)
  ) {
    return 'typescript';
  }

  return 'javascript';
}
