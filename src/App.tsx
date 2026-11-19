import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Code2, Cpu, Database, GitBranch, Layers, Play, Terminal, Workflow, X } from 'lucide-react';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { ComponentsTreePanel } from './components/ComponentsTreePanel';
import { ExecutionStepPlayer } from './components/ExecutionStepPlayer';
import { FlowchartPanel } from './components/FlowchartPanel';
import { FrameworksConceptsPanel } from './components/FrameworksConceptsPanel';
import {
  ExpectedOutputPanel,
  RealWorldExamplePanel,
} from './components/OutputAndRealWorldPanels';
import { OverviewAndQualityPanel } from './components/OverviewAndQualityPanel';
import { RightInspector } from './components/RightInspector';
import { TerminologyPanel } from './components/TerminologyPanel';
import { TopBar } from './components/TopBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { VariablesMemoryPanel } from './components/VariablesMemoryPanel';
import { SAMPLE_SNIPPETS } from './data/sampleSnippets';
import { detectLanguageFromCode } from './engine/languageDetector';
import { analyzeCodeDeterministically } from './engine/staticAnalyzer';
import type {
  CodeAnalysisResult,
  DifficultyLevel,
  ExplanationStyle,
  LineChatMessage,
  SupportedLanguage,
} from './types/visualizer';
import { normalizeLineNumbers } from './utils/codeLines';
import {
  buildInstantLiveSteps,
  ensureMultiLineSteps,
} from './utils/liveCodeStepper';

type DashboardTab =
  | 'overview'
  | 'execution'
  | 'memory'
  | 'flowchart'
  | 'components'
  | 'terminology'
  | 'frameworks'
  | 'output'
  | 'realworld';

type MobilePane = 'editor' | 'learning' | 'inspector';

const DASHBOARD_TABS: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof BookOpen;
}> = [
  { id: 'overview', label: 'Code Overview', icon: BookOpen },
  { id: 'execution', label: 'Execution Flow', icon: Play },
  { id: 'memory', label: 'Variables & Memory', icon: Database },
  { id: 'flowchart', label: 'Flowchart', icon: Workflow },
  { id: 'components', label: 'Components', icon: Layers },
  { id: 'terminology', label: 'Terminology', icon: Code2 },
  { id: 'frameworks', label: 'Language & Frameworks', icon: Cpu },
  { id: 'output', label: 'Output', icon: Terminal },
  { id: 'realworld', label: 'Real-World Example', icon: GitBranch },
];

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [code, setCode] = useState<string>(SAMPLE_SNIPPETS[0].code);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('auto');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner');
  const [explanationStyle, setExplanationStyle] = useState<ExplanationStyle>('simple');

  const [activeTab, setActiveTab] = useState<DashboardTab>('execution');
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');
  const [showExamples, setShowExamples] = useState(false);

  const [analysis, setAnalysis] = useState<CodeAnalysisResult | null>(null);
  const [analyzedCode, setAnalyzedCode] = useState<string>('');
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const [selectedLineNumber, setSelectedLineNumber] = useState(1);
  const [selectedTermName, setSelectedTermName] = useState<string | null>(null);
  const [focusedLineNumbers, setFocusedLineNumbers] = useState<number[]>([]);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);

  const [chatMessages, setChatMessages] = useState<LineChatMessage[]>([]);
  const [isAskingLine, setIsAskingLine] = useState(false);

  // Sync dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const detectedLanguage = useMemo(() => detectLanguageFromCode(code), [code]);

  const codeLines = useMemo(() => code.split('\n'), [code]);
  const selectedLineText = codeLines[selectedLineNumber - 1]?.trim() ?? '';

  const effectiveLangForLive =
    selectedLanguage === 'auto' ? detectedLanguage : selectedLanguage;

  const isCodeEditedAfterAnalysis =
    Boolean(analysis) && code.trim() !== analyzedCode.trim();

  const isUsingLivePreview =
    Boolean(code.trim()) &&
    (isCodeEditedAfterAnalysis || (!analysis && livePreviewEnabled));

  const instantLive = useMemo(() => {
    if (!isUsingLivePreview) return null;
    return buildInstantLiveSteps(code, effectiveLangForLive);
  }, [isUsingLivePreview, code, effectiveLangForLive]);

  const activeSteps = useMemo(() => {
    if (isUsingLivePreview && instantLive) {
      return instantLive.steps;
    }
    return Array.isArray(analysis?.executionSteps) ? analysis.executionSteps : [];
  }, [isUsingLivePreview, instantLive, analysis]);

  const currentStep = useMemo(() => {
    if (activeSteps.length === 0) return null;
    return activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)] ?? null;
  }, [activeSteps, currentStepIndex]);

  const activeLineNumber = currentStep?.lineNumber ?? null;
  const dependsOnLineNumbers = useMemo(
    () =>
      Array.from(
        new Set((currentStep?.dependsOnLines ?? []).map((d) => d.lineNumber))
      ),
    [currentStep]
  );
  const feedsIntoLineNumbers = useMemo(
    () =>
      Array.from(
        new Set((currentStep?.feedsIntoLines ?? []).map((f) => f.lineNumber))
      ),
    [currentStep]
  );

  // Clamp step index when live editing reduces step count
  useEffect(() => {
    if (activeSteps.length > 0 && currentStepIndex >= activeSteps.length) {
      setCurrentStepIndex(0);
    }
  }, [activeSteps.length, currentStepIndex]);

  // Step playback timer
  useEffect(() => {
    if (!isPlaying || activeSteps.length === 0) return;

    const intervalMs = Math.max(350, Math.round(1800 / speed));
    const timer = window.setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= activeSteps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, speed, activeSteps.length]);

  const runAnalysis = useCallback(
    async (
      targetCode: string,
      targetLang: SupportedLanguage,
      targetDifficulty: DifficultyLevel,
      targetStyle: ExplanationStyle
    ) => {
      if (!targetCode.trim()) return;
      setIsAnalyzing(true);
      setIsPlaying(false);
      setErrorMessage(null);
      setFocusedLineNumbers([]);
      setFocusLabel(null);

      try {
        const { resolvedLanguage, staticFacts, deterministicTrace } =
          analyzeCodeDeterministically(targetCode, targetLang);

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: targetCode,
            language: resolvedLanguage,
            difficulty: targetDifficulty,
            explanationStyle: targetStyle,
            staticFacts,
            deterministicTrace,
          }),
        });

        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          throw new Error(
            res.ok
              ? 'Server returned an unexpected response format.'
              : `Server error (${res.status}). Please try again.`
          );
        }

        if (!res.ok) {
          throw new Error(
            (typeof data.error === 'string' && data.error) ||
              'Failed to analyze source code.'
          );
        }

        const rawResult = data as unknown as Partial<CodeAnalysisResult>;
        const result: CodeAnalysisResult = {
          detectedLanguage: rawResult.detectedLanguage || resolvedLanguage,
          traceSource: rawResult.traceSource || 'ai-structured',
          overview: {
            title: rawResult.overview?.title || 'Code Overview',
            summary: rawResult.overview?.summary || '',
            whyWrittenThisWay: rawResult.overview?.whyWrittenThisWay || '',
            keyTakeaways: Array.isArray(rawResult.overview?.keyTakeaways)
              ? rawResult.overview.keyTakeaways
              : [],
            complexitySummary: rawResult.overview?.complexitySummary || '',
          },
          executionSteps: ensureMultiLineSteps(
            Array.isArray(rawResult.executionSteps)
              ? rawResult.executionSteps
              : [],
            targetCode,
            resolvedLanguage
          ),
          flowchart: {
            nodes: Array.isArray(rawResult.flowchart?.nodes)
              ? rawResult.flowchart.nodes
              : [],
            edges: Array.isArray(rawResult.flowchart?.edges)
              ? rawResult.flowchart.edges
              : [],
          },
          componentsAndFunctions: Array.isArray(rawResult.componentsAndFunctions)
            ? rawResult.componentsAndFunctions
            : [],
          terminology: Array.isArray(rawResult.terminology)
            ? rawResult.terminology
            : [],
          frameworksAndLibraries: Array.isArray(rawResult.frameworksAndLibraries)
            ? rawResult.frameworksAndLibraries.map((fw) => ({
                ...fw,
                importantMethods: Array.isArray(fw.importantMethods) ? fw.importantMethods : [],
                dependencies: Array.isArray(fw.dependencies) ? fw.dependencies : [],
                whereUsedLocations: Array.isArray(fw.whereUsedLocations)
                  ? fw.whereUsedLocations
                  : [],
              }))
            : [],
          languageParts: Array.isArray(rawResult.languageParts)
            ? rawResult.languageParts.map((lp) => ({
                ...lp,
                lineNumbers: Array.isArray(lp.lineNumbers) ? lp.lineNumbers : [],
                syntaxBreakdown: Array.isArray(lp.syntaxBreakdown)
                  ? lp.syntaxBreakdown
                  : [],
              }))
            : [],
          taxonomyGuide: {
            languageVsFramework: rawResult.taxonomyGuide?.languageVsFramework || '',
            libraryVsPackage: rawResult.taxonomyGuide?.libraryVsPackage || '',
            runtimeRole: rawResult.taxonomyGuide?.runtimeRole || '',
          },
          languageConcepts: Array.isArray(rawResult.languageConcepts)
            ? rawResult.languageConcepts
            : [],
          codeQuality: {
            issues: Array.isArray(rawResult.codeQuality?.issues)
              ? rawResult.codeQuality.issues
              : [],
            bestPractices: Array.isArray(rawResult.codeQuality?.bestPractices)
              ? rawResult.codeQuality.bestPractices
              : [],
            simplifiedCode: rawResult.codeQuality?.simplifiedCode || '',
            simplifiedExplanation: rawResult.codeQuality?.simplifiedExplanation || '',
            alternativeTitle:
              rawResult.codeQuality?.alternativeTitle || 'Alternative Approach',
            alternativeCode: rawResult.codeQuality?.alternativeCode || '',
            alternativeExplanation: rawResult.codeQuality?.alternativeExplanation || '',
          },
          expectedOutput: {
            outputKind: rawResult.expectedOutput?.outputKind || 'console',
            lines: Array.isArray(rawResult.expectedOutput?.lines)
              ? rawResult.expectedOutput.lines
              : [],
            explanation: rawResult.expectedOutput?.explanation || '',
            tableColumns: Array.isArray(rawResult.expectedOutput?.tableColumns)
              ? rawResult.expectedOutput.tableColumns
              : [],
            tableRows: Array.isArray(rawResult.expectedOutput?.tableRows)
              ? rawResult.expectedOutput.tableRows
              : [],
            htmlPreviewSnippet: rawResult.expectedOutput?.htmlPreviewSnippet || '',
          },
          realWorldExample: {
            analogyTitle: rawResult.realWorldExample?.analogyTitle || '',
            analogyStory: rawResult.realWorldExample?.analogyStory || '',
            mappingPoints: Array.isArray(rawResult.realWorldExample?.mappingPoints)
              ? rawResult.realWorldExample.mappingPoints
              : [],
            productionUseCase: rawResult.realWorldExample?.productionUseCase || '',
            practicalSnippet: rawResult.realWorldExample?.practicalSnippet || '',
          },
        };

        setAnalysis(result);
        setAnalyzedCode(targetCode);
        setLivePreviewEnabled(true);
        setCurrentStepIndex(0);
        setSelectedTermName(result.terminology?.[0]?.term ?? null);
        setActiveTab('execution');
        setMobilePane('learning');
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to analyze code.'
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  const handleAnalyzeClick = () => {
    void runAnalysis(code, selectedLanguage, difficulty, explanationStyle);
  };

  const handleClear = () => {
    setIsPlaying(false);
    setCode('');
    setAnalysis(null);
    setAnalyzedCode('');
    setLivePreviewEnabled(false);
    setErrorMessage(null);
    setChatMessages([]);
    setCurrentStepIndex(0);
    setFocusedLineNumbers([]);
    setFocusLabel(null);
  };

  const handleDifficultyChange = (nextDifficulty: DifficultyLevel) => {
    setDifficulty(nextDifficulty);
    if (analysis && code.trim()) {
      void runAnalysis(code, selectedLanguage, nextDifficulty, explanationStyle);
    }
  };

  const handleStyleChange = (nextStyle: ExplanationStyle) => {
    setExplanationStyle(nextStyle);
    if (analysis && code.trim()) {
      void runAnalysis(code, selectedLanguage, difficulty, nextStyle);
    }
  };

  const handleAskLineQuestion = async (questionText: string) => {
    const userMsg: LineChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      lineNumber: selectedLineNumber,
      content: questionText,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsAskingLine(true);

    try {
      const effectiveLang =
        selectedLanguage === 'auto' ? detectedLanguage : selectedLanguage;
      const res = await fetch('/api/ask-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language: effectiveLang,
          lineNumber: selectedLineNumber,
          lineContent: selectedLineText,
          question: questionText,
          difficulty,
          explanationStyle,
          history: chatMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get an answer.');
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          lineNumber: selectedLineNumber,
          content: data.answer || 'No explanation returned.',
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            err instanceof Error
              ? `Could not answer right now: ${err.message}`
              : 'Could not answer right now.',
        },
      ]);
    } finally {
      setIsAskingLine(false);
    }
  };

  const handleLoadSample = (snippetCode: string, snippetLang: SupportedLanguage) => {
    setIsPlaying(false);
    setCode(snippetCode);
    setSelectedLanguage(snippetLang);
    setShowExamples(false);
    setAnalysis(null);
    setAnalyzedCode('');
    setLivePreviewEnabled(false);
    setChatMessages([]);
    setCurrentStepIndex(0);
    setErrorMessage(null);
    setFocusedLineNumbers([]);
    setFocusLabel(null);
  };

  const handleFocusCodeLines = useCallback(
    (lineNumbers: number[], label: string) => {
      const normalized = normalizeLineNumbers(lineNumbers, code);
      if (normalized.length === 0) return;

      const firstLine = normalized[0];
      setFocusedLineNumbers(normalized);
      setFocusLabel(label);
      setFocusTrigger((prev) => prev + 1);
      setSelectedLineNumber(firstLine);

      const matchingStepIdx = activeSteps.findIndex((s) => s.lineNumber === firstLine);
      if (matchingStepIdx >= 0) {
        setIsPlaying(false);
        setCurrentStepIndex(matchingStepIdx);
      }
    },
    [code, activeSteps]
  );

  const handleClearFocus = useCallback(() => {
    setFocusedLineNumbers([]);
    setFocusLabel(null);
  }, []);

  const handleJumpToStep = (stepNumber: number, lineNumber: number) => {
    if (!analysis) return;
    setIsPlaying(false);
    const steps = Array.isArray(analysis.executionSteps) ? analysis.executionSteps : [];
    const idx = steps.findIndex((s) => s.stepNumber === stepNumber);
    if (idx >= 0) {
      setCurrentStepIndex(idx);
    } else {
      const byLine = steps.findIndex((s) => s.lineNumber === lineNumber);
      if (byLine >= 0) setCurrentStepIndex(byLine);
    }
    handleFocusCodeLines([lineNumber], `Step ${stepNumber} · Line ${lineNumber}`);
    setActiveTab('execution');
  };

  return (
    <div id="top" className="min-h-screen xl:h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onOpenExamples={() => setShowExamples(true)}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setMobilePane('learning');
        }}
      />

      {/* Mobile / Tablet Pane Switcher */}
      <div className="xl:hidden flex items-center gap-1 p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {(
          [
            { id: 'editor', label: 'Code Editor' },
            { id: 'learning', label: 'Visual Learning' },
            { id: 'inspector', label: 'Memory & AI Chat' },
          ] as const
        ).map((pane) => (
          <button
            key={pane.id}
            type="button"
            onClick={() => setMobilePane(pane.id)}
            className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              mobilePane === pane.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {pane.label}
          </button>
        ))}
      </div>

      {/* Main 3-Column Desktop Workbench */}
      <main className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 overflow-hidden">
        {/* LEFT: Code Input & Editor */}
        <section
          className={`xl:col-span-4 h-full min-h-[480px] xl:min-h-0 overflow-hidden ${
            mobilePane === 'editor' ? 'block' : 'hidden xl:block'
          }`}
        >
          <CodeEditorPanel
            code={code}
            selectedLanguage={selectedLanguage}
            detectedLanguage={detectedLanguage}
            activeLineNumber={activeLineNumber}
            dependsOnLineNumbers={dependsOnLineNumbers}
            feedsIntoLineNumbers={feedsIntoLineNumbers}
            focusedLineNumbers={focusedLineNumbers}
            focusLabel={focusLabel}
            focusTrigger={focusTrigger}
            selectedLineNumber={selectedLineNumber}
            isDark={isDark}
            isAnalyzing={isAnalyzing}
            onChangeCode={setCode}
            onChangeLanguage={setSelectedLanguage}
            onSelectLine={(line) => setSelectedLineNumber(line)}
            onClearFocus={handleClearFocus}
            onAnalyze={handleAnalyzeClick}
            onClear={handleClear}
            onOpenExamples={() => setShowExamples(true)}
          />
        </section>

        {/* CENTER: Code Execution & 9-Tab Learning Dashboard */}
        <section
          className={`xl:col-span-5 h-full flex flex-col min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950 ${
            mobilePane === 'learning' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          {/* Workspace Learning Mode Toolbar */}
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['beginner', 'intermediate', 'advanced'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => handleDifficultyChange(lvl)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap cursor-pointer ${
                    difficulty === lvl
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(
                [
                  { id: 'simple', label: 'Simple English' },
                  { id: 'technical', label: 'Technical' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleStyleChange(st.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    explanationStyle === st.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* 9 Interactive Dashboard Tabs */}
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 overflow-x-auto">
            <div className="flex items-center gap-1 py-1.5 min-w-max">
              {DASHBOARD_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {errorMessage && (
              <div className="mb-4 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Analysis Error</div>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {isAnalyzing ? (
              <div className="space-y-4 py-4">
                <div className="h-6 w-2/3 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
                <div className="h-44 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
                <div className="h-32 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
              </div>
            ) : !analysis && !isUsingLivePreview ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center">
                  <Play className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Understand Any Code Step by Step
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Paste any code snippet on the left—or choose a sample in JavaScript, React, Python, Laravel, Node.js, or SQL—and click Understand Code to trace execution, memory, flowcharts, and terminology.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeClick}
                    disabled={!code.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors cursor-pointer"
                  >
                    Understand Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLivePreviewEnabled(true);
                      setCurrentStepIndex(0);
                      setActiveTab('execution');
                      setMobilePane('learning');
                    }}
                    disabled={!code.trim()}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer"
                  >
                    Live Preview (Instant)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExamples(true)}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Browse Examples
                  </button>
                </div>
              </div>
            ) : !analysis && isUsingLivePreview ? (
              activeTab === 'memory' ? (
                <VariablesMemoryPanel step={currentStep} />
              ) : (
                <ExecutionStepPlayer
                  originalCode={code}
                  steps={activeSteps}
                  currentStepIndex={currentStepIndex}
                  isPlaying={isPlaying}
                  speed={speed}
                  terminology={[]}
                  isLivePreview
                  onAnalyzeWithAi={handleAnalyzeClick}
                  onStepChange={(idx) => {
                    setIsPlaying(false);
                    handleClearFocus();
                    setCurrentStepIndex(idx);
                  }}
                  onTogglePlay={() => {
                    handleClearFocus();
                    setIsPlaying((p) => !p);
                  }}
                  onRestart={() => {
                    setIsPlaying(false);
                    handleClearFocus();
                    setCurrentStepIndex(0);
                  }}
                  onSpeedChange={setSpeed}
                  onSelectTerm={(term) => {
                    setSelectedTermName(term);
                    setActiveTab('terminology');
                  }}
                  onAskAboutLine={(ln) => {
                    setSelectedLineNumber(ln);
                    setMobilePane('inspector');
                  }}
                  onSelectLines={handleFocusCodeLines}
                />
              )
            ) : analysis ? (
              <>
                {activeTab === 'overview' && (
                  <OverviewAndQualityPanel
                    analysis={analysis}
                    originalCode={code}
                    onSelectLines={handleFocusCodeLines}
                    onStartStepTrace={() => setActiveTab('execution')}
                  />
                )}

                {activeTab === 'execution' && (
                  <ExecutionStepPlayer
                    originalCode={code}
                    steps={activeSteps}
                    currentStepIndex={currentStepIndex}
                    isPlaying={isPlaying}
                    speed={speed}
                    terminology={analysis.terminology}
                    isLivePreview={isUsingLivePreview}
                    onAnalyzeWithAi={handleAnalyzeClick}
                    onStepChange={(idx) => {
                      setIsPlaying(false);
                      handleClearFocus();
                      setCurrentStepIndex(idx);
                    }}
                    onTogglePlay={() => {
                      handleClearFocus();
                      setIsPlaying((p) => !p);
                    }}
                    onRestart={() => {
                      setIsPlaying(false);
                      handleClearFocus();
                      setCurrentStepIndex(0);
                    }}
                    onSpeedChange={setSpeed}
                    onSelectTerm={(term) => {
                      setSelectedTermName(term);
                      setActiveTab('terminology');
                    }}
                    onAskAboutLine={(ln) => {
                      setSelectedLineNumber(ln);
                      setMobilePane('inspector');
                    }}
                    onSelectLines={handleFocusCodeLines}
                  />
                )}

                {activeTab === 'memory' && (
                  <VariablesMemoryPanel step={currentStep} />
                )}

                {activeTab === 'flowchart' && (
                  <FlowchartPanel
                    nodes={analysis.flowchart.nodes}
                    edges={analysis.flowchart.edges}
                    currentStep={currentStep}
                    isDark={isDark}
                    onJumpToStep={handleJumpToStep}
                  />
                )}

                {activeTab === 'components' && (
                  <ComponentsTreePanel
                    items={analysis.componentsAndFunctions}
                    originalCode={code}
                    isDark={isDark}
                    onSelectLines={handleFocusCodeLines}
                  />
                )}

                {activeTab === 'terminology' && (
                  <TerminologyPanel
                    terms={analysis.terminology}
                    originalCode={code}
                    selectedTermName={selectedTermName}
                    onSelectTerm={(term) => setSelectedTermName(term)}
                    onSelectLines={handleFocusCodeLines}
                  />
                )}

                {activeTab === 'frameworks' && (
                  <FrameworksConceptsPanel
                    detectedLanguage={analysis.detectedLanguage}
                    originalCode={code}
                    frameworks={analysis.frameworksAndLibraries}
                    languageParts={analysis.languageParts}
                    taxonomyGuide={analysis.taxonomyGuide}
                    languageConcepts={analysis.languageConcepts}
                    onSelectLines={handleFocusCodeLines}
                  />
                )}

                {activeTab === 'output' && (
                  <ExpectedOutputPanel expectedOutput={analysis.expectedOutput} />
                )}

                {activeTab === 'realworld' && (
                  <RealWorldExamplePanel realWorld={analysis.realWorldExample} />
                )}
              </>
            ) : null}
          </div>
        </section>

        {/* RIGHT: Live Memory Watch, Terminology, Components & Ask AI About Line */}
        <section
          className={`xl:col-span-3 h-full min-h-0 overflow-hidden ${
            mobilePane === 'inspector' ? 'block' : 'hidden xl:block'
          }`}
        >
          <RightInspector
            currentStep={currentStep}
            terminology={analysis?.terminology ?? []}
            components={analysis?.componentsAndFunctions ?? []}
            selectedLineNumber={selectedLineNumber}
            selectedLineText={selectedLineText}
            chatMessages={chatMessages}
            isAskingLine={isAskingLine}
            onAskLineQuestion={handleAskLineQuestion}
            onSelectTerm={(term) => {
              setSelectedTermName(term);
              setActiveTab('terminology');
              setMobilePane('learning');
            }}
            onOpenFullMemory={() => {
              setActiveTab('memory');
              setMobilePane('learning');
            }}
            onOpenComponents={() => {
              setActiveTab('components');
              setMobilePane('learning');
            }}
            onSelectLines={handleFocusCodeLines}
          />
        </section>
      </main>

      {/* Examples Modal */}
      {showExamples && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a sample code snippet"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Sample Code Snippets
              </h2>
              <button
                type="button"
                onClick={() => setShowExamples(false)}
                aria-label="Close examples modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
              {SAMPLE_SNIPPETS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleLoadSample(sample.code, sample.language)}
                  className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-400 bg-slate-50/70 dark:bg-slate-800/40 transition-colors space-y-1 cursor-pointer"
                >
                  <div className="text-xs font-mono text-sky-600 dark:text-sky-400">
                    {sample.subtitle}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {sample.title}
                  </div>
                  <pre className="text-[11px] font-mono text-slate-500 dark:text-slate-400 line-clamp-2 pt-1">
                    {sample.code}
                  </pre>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <OfflineIndicator />
    </div>
  );
}
