import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CodeAnalysisResult,
  DeterministicTracePayload,
  DifficultyLevel,
  ExplanationStyle,
  StaticFacts,
} from './src/types/visualizer.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

const analysisCache = new Map<string, CodeAnalysisResult>();
const MAX_CACHE_ENTRIES = 40;

function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota')
  );
}

function formatGeminiError(err: unknown, defaultMessage: string): {
  status: number;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return {
      status: 400,
      message:
        'GEMINI_API_KEY is not configured. Please select or add an API key in Settings > Secrets.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'The configured Gemini API key was rejected. Please check or update your API key in Settings > Secrets.',
    };
  }
  if (isQuotaExceededError(err)) {
    return {
      status: 429,
      message:
        'Gemini API free-tier quota has been reached for today. Please wait for the quota to reset or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || defaultMessage,
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isDailyQuota =
        msg.includes('GenerateRequestsPerDay') || msg.includes('free_tier_requests');
      const isTransient =
        !isDailyQuota &&
        (msg.includes('503') ||
          msg.includes('500') ||
          msg.includes('ECONNRESET') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('429'));
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function buildAnalysisSchema(slimExecutionSteps: boolean) {
  const stepProperties: Record<string, unknown> = {
    stepNumber: { type: Type.INTEGER },
    lineNumber: { type: Type.INTEGER },
    whatIsHappening: { type: Type.STRING },
    whyRequired: { type: Type.STRING },
    whatHappensInternally: { type: Type.STRING },
    output: { type: Type.STRING },
    whatHappensNext: { type: Type.STRING },
    flowNodeId: { type: Type.STRING },
  };

  if (!slimExecutionSteps) {
    stepProperties.codeLine = { type: Type.STRING };
    stepProperties.actionType = { type: Type.STRING };
    stepProperties.variables = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          value: { type: Type.STRING },
          type: { type: Type.STRING },
          scope: { type: Type.STRING },
          changed: { type: Type.BOOLEAN },
          previousValue: { type: Type.STRING },
          heapRef: { type: Type.STRING },
        },
      },
    };
    stepProperties.heapObjects = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          kind: { type: Type.STRING },
          label: { type: Type.STRING },
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                value: { type: Type.STRING },
                ref: { type: Type.STRING },
              },
            },
          },
        },
      },
    };
    stepProperties.callStack = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          functionName: { type: Type.STRING },
          argumentsSummary: { type: Type.STRING },
          line: { type: Type.INTEGER },
          status: { type: Type.STRING },
          returnValue: { type: Type.STRING },
        },
      },
    };
    stepProperties.consoleOutput = { type: Type.ARRAY, items: { type: Type.STRING } };
    stepProperties.dependsOnLines = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          lineNumber: { type: Type.INTEGER },
          symbol: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
      },
    };
    stepProperties.feedsIntoLines = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          lineNumber: { type: Type.INTEGER },
          symbol: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
      },
    };
  }

  return {
    type: Type.OBJECT,
    properties: {
      detectedLanguage: { type: Type.STRING },
      overview: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          whyWrittenThisWay: { type: Type.STRING },
          keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
          complexitySummary: { type: Type.STRING },
        },
      },
      executionSteps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: stepProperties,
        },
      },
    flowchart: {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              kind: { type: Type.STRING },
              lineNumber: { type: Type.INTEGER },
              stepNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              detail: { type: Type.STRING },
            },
          },
        },
        edges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              source: { type: Type.STRING },
              target: { type: Type.STRING },
              label: { type: Type.STRING },
            },
          },
        },
      },
    },
    componentsAndFunctions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          kind: { type: Type.STRING },
          lineRange: { type: Type.STRING },
          purpose: { type: Type.STRING },
          parametersOrProps: { type: Type.ARRAY, items: { type: Type.STRING } },
          returnOrRenderBehavior: { type: Type.STRING },
          stateAndHooks: { type: Type.ARRAY, items: { type: Type.STRING } },
          internalInteractions: { type: Type.STRING },
          parentName: { type: Type.STRING },
          childrenNames: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'id',
          'name',
          'kind',
          'lineRange',
          'purpose',
          'parametersOrProps',
          'returnOrRenderBehavior',
          'stateAndHooks',
          'internalInteractions',
        ],
      },
    },
    terminology: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          category: { type: Type.STRING },
          simpleDefinition: { type: Type.STRING },
          whyUsed: { type: Type.STRING },
          howItWorks: { type: Type.STRING },
          whereUsedInCode: { type: Type.STRING },
          whereToUse: { type: Type.STRING },
          whereNotToUse: { type: Type.STRING },
          whereInBetweenUse: { type: Type.STRING },
          example: { type: Type.STRING },
          relatedConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'term',
          'category',
          'simpleDefinition',
          'whyUsed',
          'howItWorks',
          'whereUsedInCode',
          'example',
          'relatedConcepts',
        ],
      },
    },
    frameworksAndLibraries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          kind: { type: Type.STRING },
          whatItIs: { type: Type.STRING },
          howItWorks: { type: Type.STRING },
          whyDevelopersUseIt: { type: Type.STRING },
          purposeInThisCode: { type: Type.STRING },
          whereToUse: { type: Type.STRING },
          whereNotToUse: { type: Type.STRING },
          whereInBetweenUse: { type: Type.STRING },
          interactions: { type: Type.STRING },
          importantMethods: { type: Type.ARRAY, items: { type: Type.STRING } },
          dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
          whereUsedLocations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                lineNumber: { type: Type.INTEGER },
                codeSnippet: { type: Type.STRING },
                roleExplanation: { type: Type.STRING },
              },
              required: ['lineNumber', 'codeSnippet', 'roleExplanation'],
            },
          },
        },
        required: [
          'name',
          'kind',
          'whatItIs',
          'howItWorks',
          'whyDevelopersUseIt',
          'purposeInThisCode',
          'interactions',
          'whereUsedLocations',
        ],
      },
    },
    languageParts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partName: { type: Type.STRING },
          category: { type: Type.STRING },
          syntaxToken: { type: Type.STRING },
          lineNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          codeSnippet: { type: Type.STRING },
          whatItIs: { type: Type.STRING },
          howItWorks: { type: Type.STRING },
          purpose: { type: Type.STRING },
          whereToUse: { type: Type.STRING },
          whereNotToUse: { type: Type.STRING },
          whereInBetweenUse: { type: Type.STRING },
          explanation: { type: Type.STRING },
          frameworkUsage: { type: Type.STRING },
          syntaxBreakdown: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                token: { type: Type.STRING },
                howItWorks: { type: Type.STRING },
                purpose: { type: Type.STRING },
              },
              required: ['token', 'howItWorks', 'purpose'],
            },
          },
        },
        required: [
          'partName',
          'category',
          'syntaxToken',
          'lineNumbers',
          'codeSnippet',
          'whatItIs',
          'howItWorks',
          'purpose',
          'explanation',
          'frameworkUsage',
          'syntaxBreakdown',
        ],
      },
    },
    taxonomyGuide: {
      type: Type.OBJECT,
      properties: {
        languageVsFramework: { type: Type.STRING },
        libraryVsPackage: { type: Type.STRING },
        runtimeRole: { type: Type.STRING },
      },
      required: ['languageVsFramework', 'libraryVsPackage', 'runtimeRole'],
    },
    languageConcepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          syntaxFound: { type: Type.STRING },
          howItWorks: { type: Type.STRING },
          purposeInThisCode: { type: Type.STRING },
          explanation: { type: Type.STRING },
          whyLanguageDesignsItThisWay: { type: Type.STRING },
          miniExample: { type: Type.STRING },
        },
        required: [
          'concept',
          'syntaxFound',
          'howItWorks',
          'purposeInThisCode',
          'explanation',
          'whyLanguageDesignsItThisWay',
          'miniExample',
        ],
      },
    },
    codeQuality: {
      type: Type.OBJECT,
      properties: {
        issues: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              lineNumber: { type: Type.INTEGER },
              severity: { type: Type.STRING },
              title: { type: Type.STRING },
              explanation: { type: Type.STRING },
              howToFix: { type: Type.STRING },
            },
          },
        },
        bestPractices: { type: Type.ARRAY, items: { type: Type.STRING } },
        simplifiedCode: { type: Type.STRING },
        simplifiedExplanation: { type: Type.STRING },
        alternativeTitle: { type: Type.STRING },
        alternativeCode: { type: Type.STRING },
        alternativeExplanation: { type: Type.STRING },
      },
    },
    expectedOutput: {
      type: Type.OBJECT,
      properties: {
        outputKind: { type: Type.STRING },
        lines: { type: Type.ARRAY, items: { type: Type.STRING } },
        explanation: { type: Type.STRING },
        tableColumns: { type: Type.ARRAY, items: { type: Type.STRING } },
        tableRows: {
          type: Type.ARRAY,
          items: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        htmlPreviewSnippet: { type: Type.STRING },
      },
    },
    realWorldExample: {
      type: Type.OBJECT,
      properties: {
        analogyTitle: { type: Type.STRING },
        analogyStory: { type: Type.STRING },
        mappingPoints: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              codeElement: { type: Type.STRING },
              realWorldCounterpart: { type: Type.STRING },
            },
          },
        },
        productionUseCase: { type: Type.STRING },
        practicalSnippet: { type: Type.STRING },
      },
    },
    },
    required: [
      'detectedLanguage',
      'overview',
      'executionSteps',
      'flowchart',
      'componentsAndFunctions',
      'terminology',
      'frameworksAndLibraries',
      'languageParts',
      'taxonomyGuide',
      'languageConcepts',
      'codeQuality',
      'expectedOutput',
      'realWorldExample',
    ],
  };
}

function tryParseOrRepairJson(rawText: string): Partial<CodeAnalysisResult> | null {
  const cleanJson = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleanJson) as Partial<CodeAnalysisResult>;
  } catch {
    // Attempt safe truncation repair if output hit max tokens mid-JSON
    let candidate = cleanJson;
    // Close open string if odd number of unescaped quotes
    let inString = false;
    let escaped = false;
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
      }
    }
    if (inString) {
      // Trim trailing incomplete escape if present
      if (candidate.endsWith('\\')) candidate = candidate.slice(0, -1);
      candidate += '"';
    }

    // Strip trailing comma or incomplete key-value token before closing brackets
    candidate = candidate.replace(/,\s*$/, '');
    const stack: string[] = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if ((ch === '}' || ch === ']') && stack.length > 0) {
        stack.pop();
      }
    }

    while (stack.length > 0) {
      candidate += stack.pop();
    }

    try {
      return JSON.parse(candidate) as Partial<CodeAnalysisResult>;
    } catch {
      return null;
    }
  }
}

function normalizeAnalysisResult(
  raw: Partial<CodeAnalysisResult>,
  fallbackLanguage: string,
  deterministicTrace: DeterministicTracePayload | null,
  sourceCode = ''
): CodeAnalysisResult {
  const sourceLines = sourceCode ? sourceCode.split('\n') : [];
  const meaningfulLines = sourceLines.filter(
    (l) => l.trim() && !/^(?:\/\/|\/\*|\*)|^[{}()[\];,]+$/.test(l.trim())
  ).length;
  const aiSteps = Array.isArray(raw.executionSteps) ? raw.executionSteps : [];
  const hasDetSteps =
    Boolean(deterministicTrace?.supported) &&
    Array.isArray(deterministicTrace?.steps) &&
    deterministicTrace.steps.length > 0 &&
    (deterministicTrace.steps.length >= 2 || meaningfulLines <= 2);

  let executionSteps = aiSteps.map((s, idx) => {
    const ln = Math.max(1, Math.min(s.lineNumber ?? 1, Math.max(1, sourceLines.length)));
    const resolvedLine =
      (typeof s.codeLine === 'string' && s.codeLine.trim()) ||
      sourceLines[ln - 1]?.trim() ||
      '';
    return {
      stepNumber: s.stepNumber ?? idx + 1,
      lineNumber: ln,
      codeLine: resolvedLine,
      actionType: s.actionType ?? 'process',
      whatIsHappening: s.whatIsHappening ?? 'Executes this line of code.',
      whyRequired: s.whyRequired ?? 'Advances the program logic.',
      whatHappensInternally: s.whatHappensInternally ?? 'Evaluates expression in runtime memory.',
      output: s.output ?? 'No direct output on this step.',
      whatHappensNext: s.whatHappensNext ?? 'Proceeds to the next instruction.',
      variables: Array.isArray(s.variables) ? s.variables : [],
      heapObjects: Array.isArray(s.heapObjects) ? s.heapObjects : [],
      callStack: Array.isArray(s.callStack) ? s.callStack : [],
      consoleOutput: Array.isArray(s.consoleOutput) ? s.consoleOutput : [],
      flowNodeId: s.flowNodeId,
      dependsOnLines: Array.isArray(s.dependsOnLines) ? s.dependsOnLines : [],
      feedsIntoLines: Array.isArray(s.feedsIntoLines) ? s.feedsIntoLines : [],
    };
  }) as CodeAnalysisResult['executionSteps'];

  if (hasDetSteps && deterministicTrace) {
    const aiByStep = new Map(aiSteps.map((step) => [step.stepNumber, step]));
    const aiByLine = new Map<number, (typeof aiSteps)[number]>();
    for (const s of aiSteps) {
      if (s.lineNumber && !aiByLine.has(s.lineNumber)) {
        aiByLine.set(s.lineNumber, s);
      }
    }
    executionSteps = deterministicTrace.steps.map((detStep, idx) => {
      const aiStep =
        aiByStep.get(detStep.stepNumber) ??
        aiByLine.get(detStep.lineNumber) ??
        aiSteps[idx];
      const detDeps = Array.isArray(detStep.dependsOnLines) ? detStep.dependsOnLines : [];
      const detFeeds = Array.isArray(detStep.feedsIntoLines) ? detStep.feedsIntoLines : [];
      return {
        stepNumber: detStep.stepNumber,
        lineNumber: detStep.lineNumber,
        codeLine: detStep.codeLine,
        actionType: detStep.actionType,
        whatIsHappening:
          aiStep?.whatIsHappening || detStep.internalNote || `Executing line ${detStep.lineNumber}.`,
        whyRequired:
          aiStep?.whyRequired ||
          'This instruction advances the program state toward the final result.',
        whatHappensInternally: aiStep?.whatHappensInternally || detStep.internalNote,
        output:
          aiStep?.output ||
          (detStep.consoleOutput.length > 0
            ? `Console: ${detStep.consoleOutput[detStep.consoleOutput.length - 1]}`
            : 'Updates internal state without printing output.'),
        whatHappensNext:
          aiStep?.whatHappensNext ||
          (idx < deterministicTrace.steps.length - 1
            ? `Control moves to line ${deterministicTrace.steps[idx + 1].lineNumber}.`
            : 'Execution reaches the end of the script.'),
        variables: Array.isArray(detStep.variables) ? detStep.variables : [],
        heapObjects: Array.isArray(detStep.heapObjects) ? detStep.heapObjects : [],
        callStack: Array.isArray(detStep.callStack) ? detStep.callStack : [],
        consoleOutput: Array.isArray(detStep.consoleOutput) ? detStep.consoleOutput : [],
        flowNodeId: aiStep?.flowNodeId,
        dependsOnLines:
          detDeps.length > 0
            ? detDeps
            : Array.isArray(aiStep?.dependsOnLines)
              ? aiStep.dependsOnLines
              : [],
        feedsIntoLines:
          detFeeds.length > 0
            ? detFeeds
            : Array.isArray(aiStep?.feedsIntoLines)
              ? aiStep.feedsIntoLines
              : [],
      };
    });
  } else {
    // Ensure reverse feedsIntoLines edges are synced even for AI-structured traces
    for (const consumer of executionSteps) {
      for (const dep of consumer.dependsOnLines ?? []) {
        for (const producer of executionSteps) {
          if (producer.lineNumber === dep.lineNumber && producer.stepNumber !== consumer.stepNumber) {
            const feeds = producer.feedsIntoLines ?? [];
            if (!feeds.some((f) => f.lineNumber === consumer.lineNumber && f.symbol === dep.symbol)) {
              feeds.push({
                lineNumber: consumer.lineNumber,
                symbol: dep.symbol,
                reason: `Provides "${dep.symbol}" used on line ${consumer.lineNumber}`,
              });
              producer.feedsIntoLines = feeds;
            }
          }
        }
      }
    }
  }

  const lastConsole = hasDetSteps
    ? deterministicTrace?.steps[deterministicTrace.steps.length - 1]?.consoleOutput ?? []
    : [];

  const aiFlowNodes = Array.isArray(raw.flowchart?.nodes) ? raw.flowchart.nodes : [];
  const aiFlowEdges = Array.isArray(raw.flowchart?.edges) ? raw.flowchart.edges : [];
  const useDetFlow = aiFlowNodes.length === 0 && (deterministicTrace?.flowchart?.nodes?.length ?? 0) > 0;

  return {
    detectedLanguage: raw.detectedLanguage || fallbackLanguage,
    traceSource: hasDetSteps ? 'ast-sandbox' : 'ai-structured',
    overview: {
      title: raw.overview?.title || 'Code Execution Overview',
      summary: raw.overview?.summary || 'Analysis of the submitted source code.',
      whyWrittenThisWay: raw.overview?.whyWrittenThisWay || '',
      keyTakeaways: Array.isArray(raw.overview?.keyTakeaways) ? raw.overview.keyTakeaways : [],
      complexitySummary: raw.overview?.complexitySummary || '',
    },
    executionSteps,
    flowchart: {
      nodes: useDetFlow ? deterministicTrace!.flowchart.nodes : aiFlowNodes,
      edges: useDetFlow ? deterministicTrace!.flowchart.edges : aiFlowEdges,
    },
    componentsAndFunctions: Array.isArray(raw.componentsAndFunctions)
      ? raw.componentsAndFunctions
      : [],
    terminology: Array.isArray(raw.terminology)
      ? raw.terminology.map((t) => ({
          ...t,
          whereToUse: t.whereToUse || '',
          whereNotToUse: t.whereNotToUse || '',
          whereInBetweenUse: t.whereInBetweenUse || '',
          relatedConcepts: Array.isArray(t.relatedConcepts) ? t.relatedConcepts : [],
        }))
      : [],
    frameworksAndLibraries: Array.isArray(raw.frameworksAndLibraries)
      ? raw.frameworksAndLibraries.map((fw) => ({
          ...fw,
          whatItIs: fw.whatItIs || '',
          howItWorks: fw.howItWorks || fw.interactions || '',
          whyDevelopersUseIt: fw.whyDevelopersUseIt || '',
          purposeInThisCode: fw.purposeInThisCode || '',
          whereToUse: fw.whereToUse || '',
          whereNotToUse: fw.whereNotToUse || '',
          whereInBetweenUse: fw.whereInBetweenUse || '',
          importantMethods: Array.isArray(fw.importantMethods) ? fw.importantMethods : [],
          dependencies: Array.isArray(fw.dependencies) ? fw.dependencies : [],
          whereUsedLocations: Array.isArray(fw.whereUsedLocations) ? fw.whereUsedLocations : [],
        }))
      : [],
    languageParts: Array.isArray(raw.languageParts)
      ? raw.languageParts.map((lp) => ({
          partName: lp.partName || 'Language Construct',
          category: lp.category || 'Syntax',
          syntaxToken: lp.syntaxToken || '',
          lineNumbers: Array.isArray(lp.lineNumbers) ? lp.lineNumbers : [],
          codeSnippet: lp.codeSnippet || '',
          whatItIs: lp.whatItIs || lp.explanation || '',
          howItWorks: lp.howItWorks || lp.explanation || '',
          purpose: lp.purpose || lp.frameworkUsage || lp.explanation || '',
          whereToUse: lp.whereToUse || '',
          whereNotToUse: lp.whereNotToUse || '',
          whereInBetweenUse: lp.whereInBetweenUse || '',
          explanation: lp.explanation || lp.whatItIs || '',
          frameworkUsage: lp.frameworkUsage || '',
          syntaxBreakdown: Array.isArray(lp.syntaxBreakdown)
            ? lp.syntaxBreakdown
                .filter((sb) => sb && sb.token)
                .map((sb) => ({
                  token: sb.token,
                  howItWorks: sb.howItWorks || '',
                  purpose: sb.purpose || '',
                }))
            : [],
        }))
      : [],
    taxonomyGuide: {
      languageVsFramework:
        raw.taxonomyGuide?.languageVsFramework ||
        'A programming language defines syntax and rules; a framework provides a structured architecture built on top of that language.',
      libraryVsPackage:
        raw.taxonomyGuide?.libraryVsPackage ||
        'A library is reusable code you call in your program; a package is a distributable bundle containing libraries or tools.',
      runtimeRole:
        raw.taxonomyGuide?.runtimeRole ||
        'The runtime executes compiled or interpreted code and provides memory management and system APIs.',
    },
    languageConcepts: Array.isArray(raw.languageConcepts)
      ? raw.languageConcepts.map((lc) => ({
          ...lc,
          howItWorks: lc.howItWorks || lc.explanation || '',
          purposeInThisCode: lc.purposeInThisCode || lc.explanation || '',
        }))
      : [],
    codeQuality: {
      issues: Array.isArray(raw.codeQuality?.issues) ? raw.codeQuality.issues : [],
      bestPractices: Array.isArray(raw.codeQuality?.bestPractices)
        ? raw.codeQuality.bestPractices
        : [],
      simplifiedCode: raw.codeQuality?.simplifiedCode || '',
      simplifiedExplanation: raw.codeQuality?.simplifiedExplanation || '',
      alternativeTitle: raw.codeQuality?.alternativeTitle || 'Alternative Approach',
      alternativeCode: raw.codeQuality?.alternativeCode || '',
      alternativeExplanation: raw.codeQuality?.alternativeExplanation || '',
    },
    expectedOutput: {
      outputKind: raw.expectedOutput?.outputKind || 'console',
      lines:
        lastConsole.length > 0
          ? lastConsole
          : Array.isArray(raw.expectedOutput?.lines)
            ? raw.expectedOutput.lines
            : [],
      explanation: raw.expectedOutput?.explanation || '',
      tableColumns: Array.isArray(raw.expectedOutput?.tableColumns)
        ? raw.expectedOutput.tableColumns
        : [],
      tableRows: Array.isArray(raw.expectedOutput?.tableRows)
        ? raw.expectedOutput.tableRows
        : [],
      htmlPreviewSnippet: raw.expectedOutput?.htmlPreviewSnippet || '',
    },
    realWorldExample: {
      analogyTitle: raw.realWorldExample?.analogyTitle || 'Real-World Analogy',
      analogyStory: raw.realWorldExample?.analogyStory || '',
      mappingPoints: Array.isArray(raw.realWorldExample?.mappingPoints)
        ? raw.realWorldExample.mappingPoints
        : [],
      productionUseCase: raw.realWorldExample?.productionUseCase || '',
      practicalSnippet: raw.realWorldExample?.practicalSnippet || '',
    },
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const {
        code,
        language = 'auto',
        difficulty = 'beginner',
        explanationStyle = 'simple',
        staticFacts,
        deterministicTrace,
      } = req.body as {
        code: string;
        language?: string;
        difficulty?: DifficultyLevel;
        explanationStyle?: ExplanationStyle;
        staticFacts?: StaticFacts;
        deterministicTrace?: DeterministicTracePayload | null;
      };

      if (!code || typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'Please provide source code to analyze.' });
        return;
      }

      const numberedLines = code
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');

      const meaningfulCodeLines = code
        .split('\n')
        .filter((l) => l.trim() && !/^(?:\/\/|\/\*|\*)|^[{}()[\];,]+$/.test(l.trim())).length;

      const hasDeterministicSteps =
        Boolean(deterministicTrace?.supported) &&
        Array.isArray(deterministicTrace?.steps) &&
        deterministicTrace.steps.length > 0 &&
        (deterministicTrace.steps.length >= 2 || meaningfulCodeLines <= 2);

      const detSteps = deterministicTrace?.steps ?? [];
      const sampledDetSteps = (() => {
        if (detSteps.length <= 20) return detSteps;
        const seen = new Set<string>();
        const picked: typeof detSteps = [];
        for (const s of detSteps) {
          const key = `${s.lineNumber}:${s.actionType}`;
          if (!seen.has(key)) {
            seen.add(key);
            picked.push(s);
          }
          if (picked.length >= 19) break;
        }
        const last = detSteps[detSteps.length - 1];
        if (last && !picked.some((p) => p.stepNumber === last.stepNumber)) {
          picked.push(last);
        }
        return picked;
      })();

      const traceContext = hasDeterministicSteps
        ? `\n\nVERIFIED SANDBOX EXECUTION TRACE (GROUND TRUTH — DO NOT OUTPUT variables/heapObjects/callStack/consoleOutput/dependsOnLines; only explain these steps concisely):\n${JSON.stringify(
            sampledDetSteps.map((s) => ({
              stepNumber: s.stepNumber,
              lineNumber: s.lineNumber,
              codeLine: s.codeLine,
              actionType: s.actionType,
              internalNote: s.internalNote,
              consoleOutput: s.consoleOutput,
              variables: s.variables.slice(0, 8).map((v) => `${v.name}=${v.value}`),
            }))
          )}`
        : '';

      const staticContext = staticFacts
        ? `\n\nSTATIC ANALYSIS FACTS:\n${JSON.stringify(staticFacts)}`
        : '';

      const buildSystemPrompt = (compact: boolean) => `You are an expert, friendly visual programming teacher for "Code Visualizer".
Audience level: ${difficulty.toUpperCase()}.
Tone & vocabulary style: ${
        explanationStyle === 'simple'
          ? 'Simple plain English with intuitive everyday explanations and zero unnecessary jargon.'
          : 'Detailed technical engineering explanations referencing runtime internals, memory model, and architecture.'
      }

RULES:
1. Analyze the submitted code and output valid JSON matching the requested schema. Keep EVERY explanation crisp and concise (${
        compact ? '1 short sentence max 16 words per field' : '1–2 clear sentences per field'
      }) so the JSON stays compact.
2. ${
        hasDeterministicSteps
          ? 'A verified AST sandbox trace is provided. Produce an executionSteps entry for each listed stepNumber (matching stepNumber and lineNumber) explaining whatIsHappening, whyRequired, whatHappensInternally, output, and whatHappensNext.'
          : `Trace EVERY meaningful executable line in the code step by step in execution order (${
              compact ? '5–12 steps' : '6–18 steps'
            }). IMPORTANT: Enter inside callbacks (.forEach, .map, .filter, event handlers), functions, branches, and loops—if an outer variable (like sortedFields or props) is not declared in the snippet, simulate 1–2 realistic sample inputs so EVERY line inside runs! NEVER collapse a multi-line snippet into 1 step. Include realistic variables, heapObjects, callStack, and consoleOutput for every step.`
      }
3. Make sure every flowchart node has a unique id, short label, kind (start | process | decision | loop | call | output | end), lineNumber, and stepNumbers array. Ensure edges reference valid node IDs.
4. For componentsAndFunctions, list the main functions, components, hooks, classes, controllers, models, routes, or middleware with parentName and childrenNames.
5. For terminology, identify ${compact ? '4–5' : '4–6'} key programming terms used in the code and concisely provide simpleDefinition (what it is), howItWorks, whyUsed (purpose), whereUsedInCode, whereToUse, whereNotToUse, and whereInBetweenUse.
6. For frameworksAndLibraries, detect the languages, frameworks, libraries, or runtimes used, populate whereUsedLocations with exact lineNumber, codeSnippet, and roleExplanation, AND explain: whatItIs, howItWorks, whyDevelopersUseIt, purposeInThisCode, whereToUse, whereNotToUse, and whereInBetweenUse (how it acts as a middle layer / bridge or intermediate choice between alternatives). Also fill taxonomyGuide.
7. For languageParts, break down EVERY distinct syntax part used across all lines of the code (declarations, parameters, mutable/constant variables, loops, conditionals, array/object literals, indexing/property access, arithmetic/comparison operators, return statements, function calls, output calls, imports/exports, hooks, JSX tags, SQL clauses) with exact lineNumbers, codeSnippet, frameworkUsage, whatItIs, howItWorks, purpose, whereToUse, whereNotToUse, whereInBetweenUse, explanation, AND syntaxBreakdown (breaking down each token/clause inside syntaxToken with token, howItWorks, and purpose).
8. For languageConcepts, highlight ${compact ? '3–4' : '4–6'} language-specific concepts found in the code, including howItWorks and purposeInThisCode for each concept.
9. For codeQuality, identify real issues/tips, a concise simplifiedCode, and an alternativeCode.
10. For realWorldExample, provide an everyday analogy with mappingPoints and a short practical snippet.${
        hasDeterministicSteps
          ? ''
          : '\n11. Populate dependsOnLines and feedsIntoLines with key line dependencies per step.'
      }`;

      const prompt = `Language selected/detected: ${language}

NUMBERED SOURCE CODE:
\`\`\`
${numberedLines}
\`\`\`${staticContext}${traceContext}`;

      const cacheKey = JSON.stringify({
        code,
        language,
        difficulty,
        explanationStyle,
      });
      const cached = analysisCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const ai = getGeminiClient();
      const responseSchema = buildAnalysisSchema(hasDeterministicSteps);

      const generateWithModel = async (model: string, compact: boolean) => {
        const response = await withRetry(() =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: buildSystemPrompt(compact),
              responseMimeType: 'application/json',
              responseSchema,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          })
        );
        return (response.text ?? '').trim();
      };

      const callModel = async (compact: boolean) => {
        try {
          return await generateWithModel(MODEL_NAME, compact);
        } catch (err) {
          if (isQuotaExceededError(err)) {
            return await generateWithModel(FALLBACK_MODEL_NAME, compact);
          }
          throw err;
        }
      };

      const rawText = await callModel(false);
      if (!rawText) {
        throw new Error('Model returned an empty analysis response.');
      }

      let parsed = tryParseOrRepairJson(rawText);
      if (!parsed) {
        const retryText = await callModel(true);
        parsed = tryParseOrRepairJson(retryText);
      }

      if (!parsed) {
        throw new Error('Could not parse structured analysis JSON from the model.');
      }

      const merged = normalizeAnalysisResult(
        parsed,
        language,
        deterministicTrace ?? null,
        code
      );

      if (analysisCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = analysisCache.keys().next().value;
        if (oldestKey) analysisCache.delete(oldestKey);
      }
      analysisCache.set(cacheKey, merged);

      res.json(merged);
    } catch (err) {
      console.error('Error in /api/analyze:', err);
      const { status, message } = formatGeminiError(
        err,
        'Failed to analyze code with Gemini API.'
      );
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/ask-line', async (req, res) => {
    try {
      const {
        code,
        language,
        lineNumber,
        lineContent,
        question,
        difficulty = 'beginner',
        explanationStyle = 'simple',
        history = [],
      } = req.body as {
        code: string;
        language?: string;
        lineNumber?: number;
        lineContent?: string;
        question: string;
        difficulty?: DifficultyLevel;
        explanationStyle?: ExplanationStyle;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      };

      if (!question || !question.trim()) {
        res.status(400).json({ error: 'Please enter a question.' });
        return;
      }

      const ai = getGeminiClient();
      const systemInstruction = `You are a patient, crystal-clear programming tutor helping a ${difficulty} learner (${
        explanationStyle === 'simple' ? 'simple plain English' : 'detailed technical style'
      }). Answer questions specifically about the user's code and the selected line. Be concise, accurate, and give a tiny concrete example if helpful.`;

      const recentHistory = history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
        .join('\n');

      const prompt = `Language: ${language || 'unknown'}
Full Code:
\`\`\`
${code}
\`\`\`

Focused Line ${lineNumber ?? '?'}:
\`${lineContent ?? ''}\`

${recentHistory ? `Recent Conversation:\n${recentHistory}\n\n` : ''}Student Question: ${question}`;

      const askWithModel = async (model: string) =>
        withRetry(() =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          })
        );

      let response;
      try {
        response = await askWithModel(MODEL_NAME);
      } catch (err) {
        if (isQuotaExceededError(err)) {
          response = await askWithModel(FALLBACK_MODEL_NAME);
        } else {
          throw err;
        }
      }

      res.json({ answer: (response.text ?? '').trim() });
    } catch (err) {
      console.error('Error in /api/ask-line:', err);
      const { status, message } = formatGeminiError(
        err,
        'Failed to answer line question.'
      );
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Code Visualizer server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
