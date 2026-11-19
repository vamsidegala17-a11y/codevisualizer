import type {
  FrameworkEntry,
  LanguageConceptEntry,
  LanguagePartItem,
  SyntaxTokenBreakdown,
} from '../types/visualizer';
import {
  extractNumberedCodeLines,
  findMatchingLineNumbers,
} from './codeLines';

/**
 * Generates an accurate, beginner-friendly token-by-token breakdown for common
 * programming syntax lines when the AI response omits syntaxBreakdown or
 * leaves it incomplete.
 */
export function buildFallbackSyntaxBreakdown(
  syntaxToken: string,
  codeLine: string
): SyntaxTokenBreakdown[] {
  const source = (codeLine || syntaxToken || '').trim();
  if (!source) return [];

  // 1. C-style for loop: for (init; cond; step)
  const forMatch = source.match(
    /^\s*(for)\s*\(\s*([^;]+)\s*;\s*([^;]+)\s*;\s*([^)]+)\s*\)/
  );
  if (forMatch) {
    return [
      {
        token: forMatch[1],
        howItWorks: 'Starts a counted loop block that repeats while the condition stays true.',
        purpose: 'Controls repetition so code runs multiple times without duplicating lines.',
      },
      {
        token: forMatch[2].trim(),
        howItWorks: 'Runs once before the first iteration to create and initialize the loop counter.',
        purpose: 'Sets the starting index or counter value for the loop.',
      },
      {
        token: forMatch[3].trim(),
        howItWorks: 'Evaluates to true or false before every iteration; stops the loop when false.',
        purpose: 'Guards loop boundaries so iteration stops safely at the end.',
      },
      {
        token: forMatch[4].trim(),
        howItWorks: 'Executes at the end of every iteration to update the loop counter.',
        purpose: 'Advances the counter toward the stopping condition.',
      },
    ];
  }

  // 2. Python for-in loop: for item in iterable:
  const pyForMatch = source.match(/^\s*(for)\s+(.+?)\s+(in)\s+(.+?):?\s*$/);
  if (pyForMatch) {
    return [
      {
        token: pyForMatch[1],
        howItWorks: 'Begins iterating sequentially over each element of a collection.',
        purpose: 'Processes each item one by one automatically.',
      },
      {
        token: pyForMatch[2].trim(),
        howItWorks: 'Receives the current element on each pass of the loop.',
        purpose: 'Gives a readable name to the item currently being processed.',
      },
      {
        token: pyForMatch[3],
        howItWorks: 'Connects the loop variable to the iterable sequence or dictionary.',
        purpose: 'Pulls the next element from the target collection.',
      },
      {
        token: pyForMatch[4].trim(),
        howItWorks: 'Supplies the sequence/collection of values to step through.',
        purpose: 'Provides the dataset that the loop iterates over.',
      },
    ];
  }

  // 3. Function declaration (JS/TS/PHP/Python)
  const fnMatch = source.match(
    /^\s*(?:export\s+(?:default\s+)?)?(async\s+)?(?:public\s+|private\s+|protected\s+)?(function|def)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/
  );
  if (fnMatch) {
    const items: SyntaxTokenBreakdown[] = [];
    if (fnMatch[1]) {
      items.push({
        token: 'async',
        howItWorks: 'Marks the function as asynchronous so it returns a Promise and can use await.',
        purpose: 'Allows non-blocking waiting on async operations.',
      });
    }
    items.push({
      token: fnMatch[2],
      howItWorks: 'Keyword that registers a reusable named block of instructions in scope.',
      purpose: 'Defines a callable unit of logic.',
    });
    items.push({
      token: fnMatch[3],
      howItWorks: 'Identifier used to call or invoke this function from elsewhere in the code.',
      purpose: 'Names what this unit of behavior does.',
    });
    items.push({
      token: `(${fnMatch[4].trim()})`,
      howItWorks: 'Declares input parameter variables that receive argument values on each call.',
      purpose: 'Passes dynamic input data into the function.',
    });
    return items;
  }

  // 4. React Hook / Variable assignment with call or expression: const/let/var x = expr
  const varMatch = source.match(
    /^\s*(const|let|var)\s+(\[[^\]]+\]|\{[^}]+\}|[A-Za-z_$][\w$]*)\s*=\s*([^;]+);?\s*$/
  );
  if (varMatch) {
    const keyword = varMatch[1];
    const target = varMatch[2].trim();
    const rhs = varMatch[3].trim();
    return [
      {
        token: keyword,
        howItWorks:
          keyword === 'const'
            ? 'Creates a block-scoped binding that cannot be reassigned.'
            : keyword === 'let'
              ? 'Creates a block-scoped variable whose value can be reassigned later.'
              : 'Creates a function-scoped variable.',
        purpose:
          keyword === 'const'
            ? 'Protects the variable reference from accidental reassignment.'
            : 'Allows updating the stored value as the program runs.',
      },
      {
        token: target,
        howItWorks:
          target.startsWith('[') || target.startsWith('{')
            ? 'Destructures values/properties out of the right-hand side into local variables.'
            : 'Binds this variable name to the computed result in current scope.',
        purpose: 'Stores the value under a clear name for later lines to read.',
      },
      {
        token: '=',
        howItWorks: 'Evaluates the right-hand expression first, then assigns its result to the left.',
        purpose: 'Connects the computed value to the variable name.',
      },
      {
        token: rhs,
        howItWorks: 'Expression or function call evaluated at runtime to produce the stored value.',
        purpose: 'Computes or supplies the actual data stored in the variable.',
      },
    ];
  }

  // 5. Return statement
  const retMatch = source.match(/^\s*(return)\s+(.+?);?\s*$/);
  if (retMatch) {
    return [
      {
        token: 'return',
        howItWorks: 'Immediately exits the current function and sends a value back to the caller.',
        purpose: 'Delivers the function’s final output to the call site.',
      },
      {
        token: retMatch[2].trim(),
        howItWorks: 'Evaluates this expression right before leaving the function stack frame.',
        purpose: 'Specifies the exact value or UI markup returned to the caller.',
      },
    ];
  }

  // 6. Conditional if (...)
  const ifMatch = source.match(/^\s*(if)\s*\((.+)\)\s*\{?\s*$/);
  if (ifMatch) {
    return [
      {
        token: 'if',
        howItWorks: 'Branches execution so the nested block only runs when the condition is truthy.',
        purpose: 'Makes decisions based on runtime data.',
      },
      {
        token: `(${ifMatch[2].trim()})`,
        howItWorks: 'Boolean test evaluated to decide whether to enter the if-block or skip it.',
        purpose: 'Checks the specific rule required before proceeding.',
      },
    ];
  }

  // 7. Import statement
  const importMatch = source.match(/^\s*(import)\s+(.+?)\s+(from)\s+(['"][^'"]+['"])/);
  if (importMatch) {
    return [
      {
        token: 'import',
        howItWorks: 'Loads exported bindings from another module before this file runs.',
        purpose: 'Brings external functions, components, or libraries into scope.',
      },
      {
        token: importMatch[2].trim(),
        howItWorks: 'Selects the specific default or named exports to bind locally.',
        purpose: 'Makes only the needed tools available in this file.',
      },
      {
        token: `from ${importMatch[4]}`,
        howItWorks: 'Resolves the package or file path where those exports live.',
        purpose: 'Identifies the source library or module.',
      },
    ];
  }

  // 8. Reassignment / accumulation: target = expr or target += expr
  const assignMatch = source.match(
    /^\s*(\$?[A-Za-z_][\w$.[\]]*)\s*(\+=|-=|\*=|\/=|=)\s*(.+?);?\s*$/
  );
  if (assignMatch) {
    return [
      {
        token: assignMatch[1],
        howItWorks: 'Looks up the existing variable in memory so its value can be updated.',
        purpose: 'Holds the running state updated by this statement.',
      },
      {
        token: assignMatch[2],
        howItWorks:
          assignMatch[2] === '='
            ? 'Overwrites the variable with the newly evaluated right-hand value.'
            : 'Combines the current value with the right-hand expression and stores the result.',
        purpose: 'Updates state across steps or loop iterations.',
      },
      {
        token: assignMatch[3].trim(),
        howItWorks: 'Evaluates all operands, array lookups, or operators before assignment.',
        purpose: 'Produces the new value to save into the variable.',
      },
    ];
  }

  // 9. Function / method call like console.log(...) or obj.method(...)
  const callMatch = source.match(/^\s*([A-Za-z_$][\w$.]*)\s*\((.*)\)\s*;?\s*$/);
  if (callMatch) {
    return [
      {
        token: callMatch[1],
        howItWorks: 'Looks up the function or object method and invokes it with a new call frame.',
        purpose: 'Triggers an action or helper behavior at this point in execution.',
      },
      {
        token: `(${callMatch[2].trim()})`,
        howItWorks: 'Evaluates each argument expression left-to-right and passes it into the call.',
        purpose: 'Provides the runtime inputs required by the call.',
      },
    ];
  }

  // 10. JSX element <Tag ...>
  const jsxMatch = source.match(/^\s*<([A-Za-z][\w.]*)(?:\s+([^>]+?))?\s*\/?>/);
  if (jsxMatch) {
    const items: SyntaxTokenBreakdown[] = [
      {
        token: `<${jsxMatch[1]}>`,
        howItWorks: 'Compiles to a React element description describing this DOM tag or component.',
        purpose: 'Renders this UI element inside the component tree.',
      },
    ];
    if (jsxMatch[2]) {
      items.push({
        token: jsxMatch[2].trim(),
        howItWorks: 'Passes evaluated props/event handlers onto the element at render time.',
        purpose: 'Configures the element’s appearance, data, or interactivity.',
      });
    }
    return items;
  }

  // 11. SQL clauses
  if (/^\s*(SELECT|FROM|INNER\s+JOIN|LEFT\s+JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY)\b/i.test(source)) {
    const tokens = source.split(
      /\s+(?=(?:FROM|INNER\s+JOIN|LEFT\s+JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY)\b)/i
    );
    if (tokens.length > 0) {
      return tokens.slice(0, 5).map((clause) => {
        const kw = clause.trim().split(/\s+/)[0].toUpperCase();
        return {
          token: clause.trim(),
          howItWorks: `SQL ${kw} clause processed by the query planner to transform or filter result rows.`,
          purpose: `Defines the ${kw} step of this database query.`,
        };
      });
    }
  }

  // 12. Member/index access like prices.length or prices[i]
  const memberMatch = source.match(/^([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*)|\[([^\]]+)\])$/);
  if (memberMatch) {
    return [
      {
        token: memberMatch[1],
        howItWorks: 'References the object or array value currently stored in memory.',
        purpose: 'Targets the data structure being inspected.',
      },
      {
        token: memberMatch[2] ? `.${memberMatch[2]}` : `[${memberMatch[3]}]`,
        howItWorks: memberMatch[2]
          ? `Reads the "${memberMatch[2]}" property directly from the object/array.`
          : `Reads the element at index "${memberMatch[3]}" inside the array.`,
        purpose: 'Extracts the specific piece of data needed by the surrounding expression.',
      },
    ];
  }

  // 13. Universal token fallback for any single keyword/operator/statement
  const parts = source
    .replace(/[{}();]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  if (parts.length > 1) {
    return parts.map((tok) => ({
      token: tok,
      howItWorks: describeTokenBehavior(tok),
      purpose: `Contributes the "${tok}" piece to this syntax expression.`,
    }));
  }

  return [];
}

function describeTokenBehavior(tok: string): string {
  if (/^(const|let|var|def|function|class|return|for|while|if|else|import|export|async|await)$/.test(tok)) {
    return `Language keyword "${tok}" that instructs the compiler/runtime how to structure or control execution.`;
  }
  if (/^[=+\-*/<>!&|]+$/.test(tok)) {
    return `Operator "${tok}" that combines, compares, or assigns values at runtime.`;
  }
  if (/^\d+(\.\d+)?$/.test(tok) || /^['"`]/.test(tok)) {
    return `Literal value ${tok} evaluated directly in memory.`;
  }
  return `Identifier/expression "${tok}" resolved in the active scope at runtime.`;
}

export function resolvePartSyntaxBreakdown(
  part: LanguagePartItem,
  originalCode: string
): SyntaxTokenBreakdown[] {
  if (part.syntaxBreakdown && part.syntaxBreakdown.length > 0) {
    return part.syntaxBreakdown;
  }
  const lineText =
    part.lineNumbers && part.lineNumbers.length > 0
      ? extractNumberedCodeLines(originalCode, [part.lineNumbers[0]])[0]?.text ?? ''
      : '';
  return buildFallbackSyntaxBreakdown(part.syntaxToken, part.codeSnippet || lineText);
}

export function resolvePartHowAndPurpose(
  part: LanguagePartItem,
  originalCode: string
): { howItWorks: string; purpose: string } {
  const lineText =
    part.lineNumbers && part.lineNumbers.length > 0
      ? extractNumberedCodeLines(originalCode, [part.lineNumbers[0]])[0]?.text?.trim() ?? ''
      : '';
  const sample = (part.codeSnippet || part.syntaxToken || lineText).trim();

  const howItWorks =
    part.howItWorks?.trim() ||
    part.explanation?.trim() ||
    part.whatItIs?.trim() ||
    (sample
      ? `Evaluates "${sample}" step by step using ${part.partName} semantics in the runtime.`
      : `Executes this ${part.partName} construct according to language rules.`);

  const purpose =
    part.purpose?.trim() ||
    part.frameworkUsage?.trim() ||
    part.explanation?.trim() ||
    (sample
      ? `Uses ${part.partName} (${sample}) to perform its role on ${part.lineNumbers?.length ? `line ${part.lineNumbers.join(', ')}` : 'this part of the program'}.`
      : `Provides the ${part.partName} building block needed by this program.`);

  return { howItWorks, purpose };
}

export function resolveFrameworkDetails(
  fw: FrameworkEntry,
  detectedLanguage: string
): {
  whatItIs: string;
  howItWorks: string;
  whyDevelopersUseIt: string;
  purposeInThisCode: string;
  interactions: string;
} {
  return {
    whatItIs:
      fw.whatItIs?.trim() ||
      `${fw.name} is a ${fw.kind || 'technology'} used in this ${detectedLanguage} snippet.`,
    howItWorks:
      fw.howItWorks?.trim() ||
      fw.interactions?.trim() ||
      `${fw.name} provides runtime rules, built-in APIs, and execution semantics used by the code statements.`,
    whyDevelopersUseIt:
      fw.whyDevelopersUseIt?.trim() ||
      `Developers choose ${fw.name} for reliable structure, built-in capabilities, and ecosystem support.`,
    purposeInThisCode:
      fw.purposeInThisCode?.trim() ||
      `Powers the ${detectedLanguage} logic and operations executed in this snippet.`,
    interactions:
      fw.interactions?.trim() ||
      `Works together with the rest of the ${detectedLanguage} runtime and surrounding statements.`,
  };
}

export function findConceptMatchingLines(
  concept: LanguageConceptEntry,
  originalCode: string
): number[] {
  if (!originalCode) return [];
  if (concept.syntaxFound?.trim()) {
    const direct = findMatchingLineNumbers(originalCode, concept.syntaxFound, 6);
    if (direct.length > 0) return direct;
  }

  const name = concept.concept.toLowerCase();
  const keywordCandidates: string[] = [];
  if (name.includes('let') || name.includes('const') || name.includes('block scope')) {
    keywordCandidates.push('let ', 'const ');
  }
  if (name.includes('for') || name.includes('loop')) {
    keywordCandidates.push('for (', 'for ');
  }
  if (name.includes('function') || name.includes('def')) {
    keywordCandidates.push('function ', 'def ');
  }
  if (name.includes('return')) {
    keywordCandidates.push('return ');
  }
  if (name.includes('array') || name.includes('index')) {
    keywordCandidates.push('[', '.length');
  }
  if (name.includes('hook') || name.includes('state')) {
    keywordCandidates.push('useState', 'useEffect');
  }
  if (name.includes('async') || name.includes('await')) {
    keywordCandidates.push('async ', 'await ');
  }

  const found = new Set<number>();
  for (const kw of keywordCandidates) {
    for (const ln of findMatchingLineNumbers(originalCode, kw, 4)) {
      found.add(ln);
    }
  }
  return Array.from(found).sort((a, b) => a - b).slice(0, 6);
}

export function resolveConceptDetails(
  concept: LanguageConceptEntry,
  detectedLanguage: string,
  originalCode: string
): {
  howItWorks: string;
  purposeInThisCode: string;
  matchedLines: number[];
} {
  const matchedLines = findConceptMatchingLines(concept, originalCode);
  const sampleLine =
    matchedLines.length > 0
      ? extractNumberedCodeLines(originalCode, [matchedLines[0]])[0]?.text?.trim() ?? ''
      : '';

  const howItWorks =
    concept.howItWorks?.trim() ||
    concept.explanation?.trim() ||
    (sampleLine
      ? `In ${detectedLanguage}, ${concept.concept} governs how "${sampleLine}" is evaluated and stored in memory.`
      : `${concept.concept} defines how ${detectedLanguage} evaluates this language rule at runtime.`);

  const purposeInThisCode =
    concept.purposeInThisCode?.trim() ||
    concept.explanation?.trim() ||
    (matchedLines.length > 0
      ? `Applied on line${matchedLines.length > 1 ? 's' : ''} ${matchedLines.join(', ')} to make the ${detectedLanguage} logic behave predictably and safely.`
      : `Supports clean and predictable ${detectedLanguage} execution in this program.`);

  return { howItWorks, purposeInThisCode, matchedLines };
}
