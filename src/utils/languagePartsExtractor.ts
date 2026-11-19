import type { LanguagePartItem } from '../types/visualizer';
import { buildFallbackSyntaxBreakdown } from './syntaxBreakdown';

function stripInlineComment(line: string): string {
  // Strip // comments outside quotes and # comments in Python/C/etc.
  const trimmed = line.trim();
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('# ') ||
    trimmed.startsWith('--') ||
    trimmed.startsWith('<!--')
  ) {
    return '';
  }
  return line;
}

function normalizeToken(token: string | undefined): string {
  return (token ?? '').trim().replace(/;+$/, '').replace(/\s+/g, ' ').toLowerCase();
}

interface PartRule {
  partName: string;
  category: string;
  matchLine: (line: string) => string | null;
  whatItIs: string;
  howItWorks: string;
  purpose: (lines: number[], sample: string) => string;
  frameworkUsage: (lang: string) => string;
  whereToUse: string;
  whereNotToUse: string;
  whereInBetweenUse: string;
}

const COMMON_PART_RULES: PartRule[] = [
  {
    partName: 'ES Module Import',
    category: 'Modules & Imports',
    matchLine: (line) => {
      const m = line.match(/^\s*(import\s+.+?;?)\s*$/);
      return m ? m[1] : null;
    },
    whatItIs: 'Module import statement that brings code from another file or package into scope.',
    howItWorks: 'Resolves the specified module before execution and binds its exported functions, hooks, or objects locally.',
    purpose: (lines) => `Loads external dependencies on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')} so this file can use them.`,
    frameworkUsage: (lang) => `Used in ${lang} / bundler pipelines to connect third-party packages and local modules.`,
    whereToUse: 'At the top of a module whenever you need external libraries or shared helpers.',
    whereNotToUse: 'Inside conditional blocks or loops (use dynamic import() there instead).',
    whereInBetweenUse: 'Acts as the dependency bridge between external libraries and your local module code.',
  },
  {
    partName: 'Python Import Statement',
    category: 'Modules & Imports',
    matchLine: (line) => {
      const m = line.match(/^\s*((?:from\s+[A-Za-z0-9_.]+\s+)?import\s+[A-Za-z0-9_.*,\s]+)$/);
      if (!m || /['"`]/.test(m[1])) return null;
      return m[1].trim();
    },
    whatItIs: 'Python import statement loading modules, classes, or helper functions into the current file.',
    howItWorks: 'Finds the requested module in `sys.path`, executes it once if needed, and binds the imported names.',
    purpose: (lines) => `Imports Python modules or symbols on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Standard Python module mechanism used across scripts, Django, and FastAPI.',
    whereToUse: 'At the top of a Python module.',
    whereNotToUse: 'Avoid wildcard `from mod import *` because it hides where names come from.',
    whereInBetweenUse: 'Connects standard library or pip packages to your script logic.',
  },
  {
    partName: 'C / C++ Preprocessor Include',
    category: 'Modules & Imports',
    matchLine: (line) => {
      const m = line.match(/^\s*(#include\s+[<"][^>"]+[>"])/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'C/C++ preprocessor `#include` directive importing header declarations.',
    howItWorks: 'Copies the contents of the specified header file into the source file before compilation.',
    purpose: (lines) => `Provides standard library or header declarations on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Required by C/C++ compilers for functions like `printf`, `std::cout`, and container types.',
    whereToUse: 'At the very top of `.c`, `.cpp`, and `.h` files.',
    whereNotToUse: 'Do not include `.cpp` implementation files directly; include `.h`/`.hpp` headers.',
    whereInBetweenUse: 'Bridges standard/external library headers to your compiled translation unit.',
  },
  {
    partName: 'PHP Namespace & Use Imports',
    category: 'Modules & Imports',
    matchLine: (line) => {
      const m = line.match(/^\s*((?:namespace|use)\s+[^;]+;)/);
      return m ? m[1] : null;
    },
    whatItIs: 'PHP namespace / use statement for organizing and importing classes.',
    howItWorks: 'Maps logical class paths via Composer PSR-4 autoloading so classes load automatically on reference.',
    purpose: (lines) => `Organizes and imports framework classes on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Core Laravel/PHP mechanism for loading Controllers, Models, and Request classes cleanly.',
    whereToUse: 'At the top of every PHP/Laravel class file.',
    whereNotToUse: 'Inside class bodies or methods.',
    whereInBetweenUse: 'Connects file-system folders to PHP class autoloading.',
  },
  {
    partName: 'Export / Default Export',
    category: 'Modules & Imports',
    matchLine: (line) => {
      const m = line.match(/^\s*(export\s+(?:default\s+)?[^\n{]+)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Module export declaration that exposes a function, component, or value to other files.',
    howItWorks: 'Registers the binding in the module export table so other files can import and render/call it.',
    purpose: (lines) => `Makes the unit defined on line ${lines.join(', ')} reusable outside this file.`,
    frameworkUsage: (lang) => `Required by ${lang}, React, and Next.js routers/bundlers to discover entry components and handlers.`,
    whereToUse: 'On public components, utilities, pages, or API handlers meant to be imported elsewhere.',
    whereNotToUse: 'On internal helper variables that should stay private to the current file.',
    whereInBetweenUse: 'Forms the public API boundary between this file and consumers.',
  },
  {
    partName: 'TypeScript Type / Interface',
    category: 'Types & Contracts',
    matchLine: (line) => {
      const m = line.match(/^\s*((?:export\s+)?(?:interface|type)\s+[A-Za-z_]\w*[^;{]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'TypeScript type or interface defining the exact shape of objects, props, or data.',
    howItWorks: 'Checked at compile time by TypeScript to catch property mismatches before code ever runs, then erased in JS output.',
    purpose: (lines) => `Defines strict data contracts on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Used in TypeScript, React props, and Next.js APIs to guarantee type safety.',
    whereToUse: 'When defining props, API payloads, state shapes, and function contracts.',
    whereNotToUse: 'Avoid `any` because it disables type checking.',
    whereInBetweenUse: 'Acts as a compile-time contract between producers and consumers of data.',
  },
  {
    partName: 'TypeScript Type Annotation',
    category: 'Types & Contracts',
    matchLine: (line) => {
      if (/^\s*(?:import|export\s+type|case\b)/.test(line)) return null;
      const m = line.match(/([A-Za-z_$][\w$]*\s*:\s*(?:string|number|boolean|void|any|unknown|never|[A-Z][A-Za-z0-9_<>\[\]| ]+))/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Explicit TypeScript type annotation specifying what kind of value a variable, parameter, or return holds.',
    howItWorks: 'Instructs the TypeScript compiler to validate every assignment or call against the declared type.',
    purpose: (lines) => `Enforces expected data types on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Provides IDE autocomplete and compile-time safety in TypeScript & React.',
    whereToUse: 'On function parameters, return types, and state hooks with complex shapes.',
    whereNotToUse: 'When TypeScript already infers obvious primitive literals cleanly.',
    whereInBetweenUse: 'Links runtime values to compile-time safety checks.',
  },
  {
    partName: 'Function Declaration',
    category: 'Functions & Scope',
    matchLine: (line) => {
      const m = line.match(
        /^\s*((?:export\s+(?:default\s+)?)?(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:function|def)\s+[A-Za-z_$][\w$]*\s*\([^)]*\))/
      );
      if (m) return m[1];
      const cLike = line.match(
        /^\s*((?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:void|int|double|float|string|boolean|bool|char|String)\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{?)/
      );
      return cLike ? cLike[1].trim() : null;
    },
    whatItIs: 'Named function/method definition declaring reusable instructions and input parameters.',
    howItWorks: 'Stores a callable function object in memory; each call creates a new execution frame on the call stack.',
    purpose: (lines) => `Packages reusable logic on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')} so it can be invoked cleanly with arguments.`,
    frameworkUsage: (lang) => `Fundamental unit for helpers, React components, controllers, and utilities in ${lang}.`,
    whereToUse: 'Whenever logic has a clear purpose, inputs, and output or needs to be reused.',
    whereNotToUse: 'For trivial one-off expressions that are clearer inline.',
    whereInBetweenUse: 'Bridges caller inputs (arguments) to computed results or rendered output.',
  },
  {
    partName: 'Parameters',
    category: 'Functions & Scope',
    matchLine: (line) => {
      const m = line.match(
        /(?:function|def|void|int|double|float|string|boolean|bool|String)\s+[A-Za-z_$][\w$]*\s*(\([^)]+\))|(\([^)]+\))\s*=>|\(\s*(\{[^}]+\})\s*\)/
      );
      return m ? (m[1] || m[2] || m[3]) : null;
    },
    whatItIs: 'Function parameter list (including typed parameters or destructured props) that receives caller inputs.',
    howItWorks: 'Binds each passed argument value to a local parameter variable inside the function scope on call.',
    purpose: (lines) => `Accepts dynamic inputs on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')} without hardcoding values.`,
    frameworkUsage: (lang) => `Powers function inputs, React component props, and route handler parameters in ${lang}.`,
    whereToUse: 'When a function or component depends on caller-supplied data.',
    whereNotToUse: 'Avoid excessive parameter counts (4+); group related parameters into an options object.',
    whereInBetweenUse: 'Acts as the input contract between a caller and the function body.',
  },
  {
    partName: 'Arrow Function (=>)',
    category: 'Functions & Scope',
    matchLine: (line) => {
      const m = line.match(/((?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[^\s;].*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Compact arrow function expression commonly used for callbacks, hooks, and event handlers.',
    howItWorks: 'Creates a function value that inherits surrounding lexical scope (`this` and outer variables).',
    purpose: (lines) => `Defines inline callback or handler behavior on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Widely used in React event handlers (`onClick`), `useEffect` callbacks, Express routes, and array methods.',
    whereToUse: 'For inline callbacks, event handlers, array transformations, and short functions.',
    whereNotToUse: 'As object methods that rely on dynamic `this` binding.',
    whereInBetweenUse: 'Connects events/hooks or array items directly to an inline action.',
  },
  {
    partName: 'let Mutable Variable',
    category: 'Variables & State',
    matchLine: (line) => {
      const m = line.match(/\b(let\s+[A-Za-z_$][\w$]*\s*=\s*[^;]+)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Block-scoped mutable variable declared with `let`.',
    howItWorks: 'Allocates a variable slot in the current block scope that can be reassigned as execution progresses.',
    purpose: (lines) => `Stores values that change over time (such as accumulators or loop counters) on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Standard ${lang} syntax for counters, loop indices, and conditionally updated local state.`,
    whereToUse: 'When a variable’s value must be reassigned later (like `subtotal` or loop counter `i`).',
    whereNotToUse: 'When the value never changes—prefer `const` for safety.',
    whereInBetweenUse: 'Holds intermediate state across loop steps or branches.',
  },
  {
    partName: 'const Constant Binding',
    category: 'Variables & State',
    matchLine: (line) => {
      const m = line.match(/\b(const\s+(?:\[[^\]]+\]|\{[^}]+\}|[A-Za-z_$][\w$]*)\s*=\s*[^;]+)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Block-scoped constant binding declared with `const`.',
    howItWorks: 'Binds a name to a computed value or object reference so the variable identifier cannot be reassigned.',
    purpose: (lines) => `Safely holds computed results, inputs, or hook references on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Default variable declaration in modern ${lang}, React hooks, and Express handlers.`,
    whereToUse: 'For all bindings that are not reassigned after initialization.',
    whereNotToUse: 'For loop counters or accumulators that need reassignment (`let`).',
    whereInBetweenUse: 'Stores intermediate or final values between calculation steps.',
  },
  {
    partName: 'PHP Variable ($var)',
    category: 'Variables & State',
    matchLine: (line) => {
      const m = line.match(/(\$[A-Za-z_]\w*(?:\s*=\s*[^;]+)?)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'PHP variable prefixed with `$` storing a value, object, or request payload.',
    howItWorks: 'PHP creates or updates the symbol in the current function/method scope whenever assigned.',
    purpose: (lines) => `Holds dynamic runtime data or framework objects on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Used throughout PHP and Laravel for `$request`, Eloquent models, and computed data.',
    whereToUse: 'Whenever storing or passing values in PHP.',
    whereNotToUse: 'Avoid using dynamic variable variables (`$$var`) which hurt readability.',
    whereInBetweenUse: 'Carries data between Laravel requests, models, and responses.',
  },
  {
    partName: 'Typed Variable Declaration',
    category: 'Variables & State',
    matchLine: (line) => {
      if (/\([^)]*\)\s*\{/.test(line)) return null;
      const m = line.match(/^\s*((?:int|double|float|char|bool|boolean|long|String|std::string|var)\s+[A-Za-z_]\w*\s*(?:=\s*[^;]+)?)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Statically typed variable declaration reserving memory for a specific data type.',
    howItWorks: 'Allocates fixed-type memory (or reference) and validates assigned values against the declared type.',
    purpose: (lines) => `Declares typed storage on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Standard ${lang} syntax for variables in C, C++, and Java.`,
    whereToUse: 'When introducing any new local variable or accumulator.',
    whereNotToUse: 'Do not leave primitive variables uninitialized before reading them in C/C++.',
    whereInBetweenUse: 'Provides strongly typed state across statements.',
  },
  {
    partName: 'Variable Assignment (=)',
    category: 'Variables & State',
    matchLine: (line) => {
      if (/^\s*(?:const|let|var|for|if|while|return|import|export)\b/.test(line)) return null;
      const m = line.match(/^\s*([A-Za-z_]\w*\s*=\s*[^=][^;\n]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Variable assignment binding or updating a variable name with a new value.',
    howItWorks: 'Evaluates the right-hand expression first and stores the result under the left-hand variable name.',
    purpose: (lines) => `Assigns or updates state on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core ${lang} statement used for Python variables, counters, and state updates.`,
    whereToUse: 'To initialize or update variable values.',
    whereNotToUse: 'Do not confuse assignment (`=`) with equality comparison (`==` / `===`).',
    whereInBetweenUse: 'Saves intermediate calculation results for later lines.',
  },
  {
    partName: 'for Loop',
    category: 'Control Flow',
    matchLine: (line) => {
      const m = line.match(/\b(for\s*\([^)]+\)|for\s+.+\s+in\s+.+:)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Iteration loop that repeats a block of code for each element or counter step.',
    howItWorks: 'Initializes the counter/iterator, checks the continuation rule before every pass, runs the body, and advances to the next item.',
    purpose: (lines) => `Repeats processing across collection items on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core ${lang} control-flow structure for iterating arrays, dictionaries, and ranges.`,
    whereToUse: 'When you need to repeat work across items or a known count of steps.',
    whereNotToUse: 'When the loop condition never changes (risk of infinite loop), or inside React JSX (use `.map()` instead).',
    whereInBetweenUse: 'Iterates between raw collection data and aggregated results.',
  },
  {
    partName: 'while Loop',
    category: 'Control Flow',
    matchLine: (line) => {
      const m = line.match(/\b(while\s*(?:\([^)]+\)|[^:]+:))/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Condition-driven loop that keeps repeating while a boolean condition stays true.',
    howItWorks: 'Evaluates the condition before each iteration and exits as soon as it becomes false.',
    purpose: (lines) => `Repeats execution until a stopping condition is reached on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Used in ${lang} when the number of iterations is not known upfront.`,
    whereToUse: 'For streams, queues, or search loops like binary search.',
    whereNotToUse: 'When iterating fixed arrays where `for` is safer against infinite loops.',
    whereInBetweenUse: 'Drives repeated state transitions until completion.',
  },
  {
    partName: 'if / else Conditional Branch',
    category: 'Control Flow',
    matchLine: (line) => {
      const m = line.match(/\b((?:else\s+)?if\s*\([^)]+\)|(?:elif|if)\s+[^:]+:|else\s*[:{])/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Conditional branch statement that chooses which block of code runs based on runtime conditions.',
    howItWorks: 'Evaluates a boolean condition; executes the matching branch and skips all other branches.',
    purpose: (lines) => `Guards logic or picks alternate paths on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Used across ${lang} for validation, early returns, error checks, and filtering.`,
    whereToUse: 'For validation guards, conditional branching, and business rules.',
    whereNotToUse: 'Deeply nested if-else chains where early `return` or `switch` is cleaner.',
    whereInBetweenUse: 'Acts as a decision gate between input validation and downstream logic.',
  },
  {
    partName: 'try / catch Error Handling',
    category: 'Control Flow',
    matchLine: (line) => {
      const m = line.match(/\b(try\s*[:{]|catch\s*\([^)]*\)|except\b[^:]*:)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Structured exception handling block that safely catches runtime failures.',
    howItWorks: 'Runs protected code inside `try`; if an error is thrown, execution jumps to `catch`/`except` instead of crashing.',
    purpose: (lines) => `Prevents unhandled crashes and returns clean error feedback on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Essential in ${lang}, Express APIs, and async database/network calls.`,
    whereToUse: 'Around network requests, file I/O, JSON parsing, and database queries.',
    whereNotToUse: 'Never swallow errors silently inside an empty `catch` block.',
    whereInBetweenUse: 'Protects risky external calls and converts failures into controlled fallback responses.',
  },
  {
    partName: 'Array / List Literal',
    category: 'Data Structures',
    matchLine: (line) => {
      const m = line.match(/=\s*(\[[^\]]+\])/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Ordered list/array literal storing multiple values by numeric index (starting at 0).',
    howItWorks: 'Allocates an indexed collection in heap memory holding the listed elements in order.',
    purpose: (lines) => `Groups multiple items into a single list on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core ${lang} data structure used for datasets, dependency lists, and React list rendering.`,
    whereToUse: 'When storing an ordered sequence of items.',
    whereNotToUse: 'When fast key-based lookup is needed (prefer an object/Map/dictionary).',
    whereInBetweenUse: 'Carries grouped data into functions and loops.',
  },
  {
    partName: 'Object / Dictionary Literal',
    category: 'Data Structures',
    matchLine: (line) => {
      if (/^\s*(?:import|export|function|return\s+<)/.test(line)) return null;
      const m = line.match(/(=\s*\{[^}]*:[^}]*\})|(\{\s*['"][^'"]+['"]\s*:[^}]+\})/);
      return m ? (m[1] || m[2]).trim() : null;
    },
    whatItIs: 'Key-value object / dictionary literal grouping named properties together.',
    howItWorks: 'Allocates a hash-mapped structure in heap memory associating each key name with its value.',
    purpose: (lines) => `Stores structured key-value data on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Used in ${lang} for records, JSON payloads, config options, and model attributes.`,
    whereToUse: 'When grouping labeled fields belonging to one entity.',
    whereNotToUse: 'When strict insertion-ordered numeric indexing is all you need (use an array/list).',
    whereInBetweenUse: 'Packages multiple related fields into a single transferable payload.',
  },
  {
    partName: 'Class & Inheritance',
    category: 'Object-Oriented Syntax',
    matchLine: (line) => {
      const m = line.match(/^\s*((?:export\s+(?:default\s+)?)?(?:public\s+|abstract\s+)?class\s+[A-Za-z_]\w*(?:\s*(?:\([^)]+\)|(?:extends|implements)\s+[A-Za-z_\\][\w\\]*))?)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Class blueprint (and optional parent inheritance) grouping methods and properties.',
    howItWorks: 'Defines a template for objects or controllers; inheritance shares methods from a base class.',
    purpose: (lines) => `Defines the object-oriented structure on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core architecture in ${lang}, Laravel Controllers/Models, Java, Python, and C++ classes.`,
    whereToUse: 'When modeling domain entities, controllers, or services with shared behavior.',
    whereNotToUse: 'For simple stateless helper functions or React function components.',
    whereInBetweenUse: 'Connects base framework capabilities to your custom application logic.',
  },
  {
    partName: 'Async / Await',
    category: 'Asynchronous Flow',
    matchLine: (line) => {
      const m = line.match(/\b((?:async\b[^;\n]*|await\s+[^;\n]+))/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Asynchronous syntax (`async` / `await`) for handling non-blocking operations cleanly.',
    howItWorks: '`async` makes a function return a Promise; `await` pauses that function until the Promise settles without blocking the event loop.',
    purpose: (lines) => `Handles async requests or I/O cleanly on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Standard ${lang} / Node.js pattern for Express route handlers, API fetches, and DB queries.`,
    whereToUse: 'For network calls, database queries, and file I/O.',
    whereNotToUse: 'On synchronous pure math functions where async adds unnecessary Promise wrapping.',
    whereInBetweenUse: 'Turns asynchronous Promises into sequential, readable step-by-step code.',
  },
  {
    partName: 'HTTP Route / Middleware Handler',
    category: 'Framework & Routing',
    matchLine: (line) => {
      const m = line.match(/\b((?:app|router|Route)\s*(?:\.|::)\s*(?:use|get|post|put|patch|delete)\s*\([^)]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Server route or middleware registration binding a URL path/HTTP verb to a handler.',
    howItWorks: 'Registers a callback in the router table; incoming requests matching the method and path invoke this handler.',
    purpose: (lines) => `Maps incoming HTTP requests to application logic on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Express.js / Laravel routing layer connecting HTTP requests to controller or JSON responses.',
    whereToUse: 'In backend APIs and server routes.',
    whereNotToUse: 'Inside client-side browser-only helper utilities.',
    whereInBetweenUse: 'Sits between HTTP clients and your database/business logic.',
  },
  {
    partName: 'Array Index Access ([i])',
    category: 'Data Structures & Access',
    matchLine: (line) => {
      const m = line.match(/([A-Za-z_$][\w$]*\[[^\]]+\])/);
      return m ? m[1] : null;
    },
    whatItIs: 'Bracket indexing syntax to read a single item from an array or dictionary by index/key.',
    howItWorks: 'Evaluates the expression inside `[...]` and fetches the element stored at that position/key.',
    purpose: (lines) => `Reads individual elements dynamically on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Standard ${lang} syntax for reading sequential array elements or keyed entries.`,
    whereToUse: 'Inside loops or whenever accessing a known position/key.',
    whereNotToUse: 'Without bounds checking if the index could exceed `length - 1`.',
    whereInBetweenUse: 'Extracts one element from a collection so arithmetic or logic can use it.',
  },
  {
    partName: 'Property / Method Access (.)',
    category: 'Objects & Properties',
    matchLine: (line) => {
      if (/^\s*import\b/.test(line)) return null;
      const m = line.match(/([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/);
      return m ? m[1] : null;
    },
    whatItIs: 'Dot notation accessing a property (like `.length`) or method (like `.log`, `.toFixed`, `.map`) on a value.',
    howItWorks: 'Looks up the named property or method on the object/prototype at runtime.',
    purpose: (lines) => `Reads object metadata or invokes built-in methods on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Universal ${lang} syntax for reading properties, calling APIs, and transforming collections.`,
    whereToUse: 'To read known properties or call built-in object methods.',
    whereNotToUse: 'On potentially `null` or `undefined` values without optional chaining (`?.`).',
    whereInBetweenUse: 'Connects an object reference to its built-in properties or actions.',
  },
  {
    partName: 'PHP Object / Static Access (-> / ::)',
    category: 'Objects & Properties',
    matchLine: (line) => {
      const m = line.match(/([A-Za-z_$][\w$]*(?:->|::)[A-Za-z_]\w*)/);
      return m ? m[1] : null;
    },
    whatItIs: 'PHP object operator (`->`) or static scope operator (`::`) accessing methods, properties, or Eloquent builders.',
    howItWorks: '`->` invokes instance methods/properties on an object; `::` calls static methods on a class.',
    purpose: (lines) => `Interacts with PHP/Laravel objects or Eloquent models on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Core Laravel/PHP syntax for `$request->validate()`, `Model::create()`, and `response()->json()`.',
    whereToUse: 'Whenever accessing object properties/methods or static model helpers in PHP.',
    whereNotToUse: 'Avoid calling `->` on `null` results without null-safe `?->`.',
    whereInBetweenUse: 'Links PHP/Laravel instances and model classes to framework operations.',
  },
  {
    partName: 'Arithmetic & Update Operators (+, -, *, +=, ++)',
    category: 'Operators & Expressions',
    matchLine: (line) => {
      const cleaned = stripInlineComment(line);
      if (!cleaned || /^\s*(?:import|#|use\b|namespace\b|<[A-Za-z/])/.test(cleaned)) return null;
      if (/:[^=]*;/.test(cleaned) && !/\b(?:for|let|const|return)\b/.test(cleaned)) return null; // skip CSS declarations like margin-top: 10px;
      const m = cleaned.match(/([A-Za-z_$][\w$.[\]]*\s*(?:\+\+|--|\+=|-=|\*=|\/=|\+|-|\*|\/)\s*[A-Za-z0-9_$.[\]]*)/);
      if (!m) return null;
      const token = m[1].trim();
      if (/^[A-Za-z_-]+$/.test(token)) return null; // avoid hyphenated identifiers
      return token;
    },
    whatItIs: 'Math and increment operators that compute numeric results or advance counters.',
    howItWorks: 'Evaluates operands to numbers, computes the arithmetic result, and returns or stores the new value.',
    purpose: (lines) => `Performs calculations or increments loop counters on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core ${lang} expression operators for totals, percentages, pricing, and loop counting.`,
    whereToUse: 'For numeric math, totals, discounts, and loop step updates.',
    whereNotToUse: 'With unvalidated string inputs where `+` may concatenate text instead of adding numbers.',
    whereInBetweenUse: 'Transforms raw numeric inputs into derived totals and results.',
  },
  {
    partName: 'Comparison Operator (<, >, >=, <=, ===)',
    category: 'Operators & Expressions',
    matchLine: (line) => {
      const cleaned = stripInlineComment(line);
      if (!cleaned || /<[A-Za-z/]/.test(cleaned) || /=>/.test(cleaned)) return null;
      const m = cleaned.match(/([A-Za-z0-9_$.[\]]+\s*(?:===|!==|==|!=|>=|<=|<|>)\s*[A-Za-z0-9_$.[\]]+)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Comparison expression that compares two values and produces `true` or `false`.',
    howItWorks: 'Evaluates left and right values and returns a boolean used by loops or conditionals.',
    purpose: (lines) => `Tests conditions or loop bounds on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Drives loop termination and conditional branching in ${lang}.`,
    whereToUse: 'In `for`/`while` conditions, `if` guards, and validations.',
    whereNotToUse: 'Prefer strict equality (`===`) over loose (`==`) in JavaScript to avoid type coercion bugs.',
    whereInBetweenUse: 'Converts data comparisons into a boolean decision.',
  },
  {
    partName: 'Ternary Conditional (? :)',
    category: 'Operators & Expressions',
    matchLine: (line) => {
      const m = line.match(/([^?\n]+\?\s*[^:\n]+\s*:\s*[^;\n]+)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Inline ternary conditional expression choosing between two values.',
    howItWorks: 'Evaluates the condition before `?`; returns the middle value if truthy or the value after `:` if falsy.',
    purpose: (lines) => `Selects between two inline expressions or UI states on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Popular in ${lang} and React JSX for concise conditional text or rendering.`,
    whereToUse: 'For short two-branch value selections.',
    whereNotToUse: 'Avoid deeply nested ternaries; use `if/else` or a helper function instead.',
    whereInBetweenUse: 'Converts a boolean state directly into a chosen value or element.',
  },
  {
    partName: 'Return Statement',
    category: 'Functions & Scope',
    matchLine: (line) => {
      const m = line.match(/\b(return\b[^;\n]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Return statement that finishes a function and sends a result back to its caller.',
    howItWorks: 'Evaluates the return expression, pops the current frame from the call stack, and hands the value to the caller.',
    purpose: (lines) => `Outputs the function’s final value or UI markup on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Delivers computed values in ${lang} functions, JSX in React components, and HTTP responses in Express/Laravel.`,
    whereToUse: 'At the end of functions/components or early in guard clauses.',
    whereNotToUse: 'Outside of functions (top-level return causes syntax errors in standard scripts).',
    whereInBetweenUse: 'Bridges internal function work back to the outer caller.',
  },
  {
    partName: 'Function Call',
    category: 'Functions & Calls',
    matchLine: (line) => {
      const cleaned = stripInlineComment(line);
      if (!cleaned || /^\s*(?:function|def|for|if|else\s+if|while|switch|catch|return|class|namespace)\b/.test(cleaned)) return null;
      if (/^\s*(?:console\.log|print|echo|printf|System\.out\.println|use(?:State|Effect|Memo|Callback|Ref))\b/.test(cleaned)) return null;
      const m = cleaned.match(/([A-Za-z_$][\w$.]*\s*\([^)]*\))/);
      if (!m) return null;
      return m[1].trim();
    },
    whatItIs: 'Function or method invocation expression that runs logic with concrete arguments.',
    howItWorks: 'Passes arguments into parameters, pushes a new call stack frame, executes the function body, and receives its return value.',
    purpose: (lines) => `Executes reusable logic or API methods on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Triggers helper functions, utilities, and library/API calls in ${lang}.`,
    whereToUse: 'Whenever you want to run a reusable function with specific inputs.',
    whereNotToUse: 'Passing a function call result (`fn()`) when a callback reference (`() => fn()`) is expected.',
    whereInBetweenUse: 'Connects data variables to reusable processing functions.',
  },
  {
    partName: 'Console / Standard Output',
    category: 'Built-ins & Output',
    matchLine: (line) => {
      const m = line.match(/\b((?:console\.log|print|echo|printf|System\.out\.println|std::cout\s*<<)\s*[^;\n]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Built-in output call that prints values to the terminal or browser developer console.',
    howItWorks: 'Evaluates the arguments and sends formatted text to the runtime standard output stream.',
    purpose: (lines) => `Displays final results or diagnostic values on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Built-in ${lang} / runtime logging facility used for verification and debugging.`,
    whereToUse: 'For CLI output, learning scripts, and debugging checks.',
    whereNotToUse: 'Avoid leaving noisy debug logs in production client code.',
    whereInBetweenUse: 'Surfaces internal program state to the user or developer.',
  },
  {
    partName: 'React State & Effect Hooks',
    category: 'Framework & Hooks',
    matchLine: (line) => {
      const m = line.match(/\b(use(?:State|Effect|Memo|Callback|Ref|Context|Reducer)\s*\([^)]*)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'React Hook call (`useState`, `useEffect`, etc.) for component state and lifecycle synchronization.',
    howItWorks: 'Registers hook slots on the React fiber node so state persists across re-renders and effects run after commit.',
    purpose: (lines) => `Manages interactive UI state or side effects on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Core React framework mechanism connecting component state updates to automatic UI re-rendering.',
    whereToUse: 'At the top level of React function components or custom hooks.',
    whereNotToUse: 'Inside loops, conditions, or nested callbacks (violates Rules of Hooks).',
    whereInBetweenUse: 'Bridges user interactions to React re-renders and DOM updates.',
  },
  {
    partName: 'JSX / HTML Element & Attributes',
    category: 'Markup & UI Syntax',
    matchLine: (line) => {
      const m = line.match(/^\s*(<[A-Za-z][\w.-]*(?:\s+[^>]+)?\/?>)/);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'HTML/JSX markup element describing UI structure, attributes, classes, or event props.',
    howItWorks: 'In HTML, the browser parses tags into DOM nodes; in React JSX, tags compile to `React.createElement(...)` calls.',
    purpose: (lines) => `Defines visual UI elements and attributes on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Core ${lang} / React declarative syntax for building page structure and interactive components.`,
    whereToUse: 'Inside HTML documents or React component `return` statements.',
    whereNotToUse: 'Without closing tags or a single root wrapper (in JSX).',
    whereInBetweenUse: 'Connects application data and event handlers to visible UI elements.',
  },
  {
    partName: 'CSS Selector & Rule Property',
    category: 'Styling & Layout',
    matchLine: (line) => {
      const m = line.match(/^\s*([a-z-]+\s*:\s*[^;{}]+;)\s*$/);
      if (!m || /^\s*(?:case|default)\b/.test(line)) return null;
      return m[1].trim();
    },
    whatItIs: 'CSS declaration assigning a visual styling value to a layout, color, or typography property.',
    howItWorks: 'The browser style engine matches the parent selector and applies each `property: value` pair during layout and paint.',
    purpose: (lines) => `Controls visual appearance and layout rules on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Standard CSS styling consumed by browsers and styling systems.',
    whereToUse: 'Inside CSS selector blocks (`{ ... }`) to style elements.',
    whereNotToUse: 'Avoid excessive `!important` overrides which make stylesheets brittle.',
    whereInBetweenUse: 'Translates design rules into rendered pixel layout and colors.',
  },
  {
    partName: 'Template Literal (`${...}`)',
    category: 'Strings & Formatting',
    matchLine: (line) => {
      const m = line.match(/(`[^`]*\$\{[^}]+\}[^`]*`)/);
      return m ? m[1] : null;
    },
    whatItIs: 'Backtick template string with `${...}` expression interpolation.',
    howItWorks: 'Evaluates expressions inside `${...}` and embeds their string values into the surrounding text.',
    purpose: (lines) => `Formats dynamic text cleanly on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: (lang) => `Modern ${lang} string interpolation syntax used in JSX, logs, titles, and API URLs.`,
    whereToUse: 'Whenever combining text and dynamic variables.',
    whereNotToUse: 'For plain static strings that need no interpolation.',
    whereInBetweenUse: 'Converts computed numbers/variables into readable formatted strings.',
  },
  {
    partName: 'SQL Query Clauses',
    category: 'Database & Query',
    matchLine: (line) => {
      const m = line.match(/^\s*((?:SELECT|FROM|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|INSERT\s+INTO|UPDATE|SET|DELETE\s+FROM|LIMIT)\b.*)/i);
      return m ? m[1].trim() : null;
    },
    whatItIs: 'Declarative SQL clause specifying which columns, tables, joins, filters, or sorting to apply.',
    howItWorks: 'The database query planner executes FROM/JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY -> LIMIT.',
    purpose: (lines) => `Shapes, filters, or modifies relational database rows on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}.`,
    frameworkUsage: () => 'Standard relational SQL executed by PostgreSQL, MySQL, or SQLite engines.',
    whereToUse: 'When querying, joining, aggregating, or sorting structured database tables.',
    whereNotToUse: 'Never concatenate untrusted user input into raw SQL strings—use parameterized queries.',
    whereInBetweenUse: 'Filters and aggregates raw table rows into report-ready output.',
  },
];

export function extractAllLanguageParts(
  code: string,
  detectedLanguage: string
): LanguagePartItem[] {
  if (!code.trim()) return [];
  const lines = code.split('\n');
  const results: LanguagePartItem[] = [];

  for (const rule of COMMON_PART_RULES) {
    const matchedLines: number[] = [];
    let firstToken = '';
    let firstCodeLine = '';

    lines.forEach((rawLine, idx) => {
      const token = rule.matchLine(rawLine);
      if (token) {
        matchedLines.push(idx + 1);
        if (!firstToken) {
          firstToken = token;
          firstCodeLine = rawLine.trim();
        }
      }
    });

    if (matchedLines.length > 0) {
      results.push({
        partName: rule.partName,
        category: rule.category,
        syntaxToken: firstToken,
        lineNumbers: matchedLines,
        codeSnippet: firstCodeLine,
        whatItIs: rule.whatItIs,
        howItWorks: rule.howItWorks,
        purpose: rule.purpose(matchedLines, firstToken),
        whereToUse: rule.whereToUse,
        whereNotToUse: rule.whereNotToUse,
        whereInBetweenUse: rule.whereInBetweenUse,
        explanation: `${rule.whatItIs} ${rule.howItWorks}`,
        frameworkUsage: rule.frameworkUsage(detectedLanguage),
        syntaxBreakdown: buildFallbackSyntaxBreakdown(firstToken, firstCodeLine),
      });
    }
  }

  return results;
}

/**
 * Combines AI-identified language parts with deterministic full-file scan so
 * EVERY syntax part used across the submitted code is represented.
 */
export function mergeAllLanguageParts(
  aiParts: LanguagePartItem[],
  code: string,
  detectedLanguage: string
): LanguagePartItem[] {
  const deterministicParts = extractAllLanguageParts(code, detectedLanguage);
  if (aiParts.length === 0) return deterministicParts;

  const merged: LanguagePartItem[] = aiParts.map((part) => ({ ...part }));

  const isCoveredByAi = (det: LanguagePartItem): boolean => {
    const detName = det.partName.toLowerCase();
    const detToken = normalizeToken(det.syntaxToken);
    const detSnippet = normalizeToken(det.codeSnippet);
    const detLines = new Set(det.lineNumbers);

    return merged.some((ai) => {
      const aiName = ai.partName.toLowerCase();
      if (aiName === detName) {
        return true;
      }
      const aiToken = normalizeToken(ai.syntaxToken);
      const aiSnippet = normalizeToken(ai.codeSnippet);
      const sharesLine = (ai.lineNumbers ?? []).some((ln) => detLines.has(ln));
      if (!sharesLine) return false;

      if (detToken && aiToken && aiToken === detToken) {
        return true;
      }
      if (
        detSnippet &&
        aiSnippet &&
        aiSnippet === detSnippet &&
        ai.category?.toLowerCase() === det.category?.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  };

  for (const det of deterministicParts) {
    if (!isCoveredByAi(det)) {
      merged.push(det);
    }
  }

  // Sort cleanly by first line number so user sees parts in top-to-bottom code order
  return merged.sort((a, b) => {
    const aLine = a.lineNumbers?.[0] ?? 9999;
    const bLine = b.lineNumbers?.[0] ?? 9999;
    return aLine - bLine;
  });
}
