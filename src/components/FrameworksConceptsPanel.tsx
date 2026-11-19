import { useMemo, useState } from 'react';
import { Code2, Layers, MapPin } from 'lucide-react';
import type {
  FrameworkEntry,
  LanguageConceptEntry,
  LanguagePartItem,
} from '../types/visualizer';
import {
  findMatchingLineNumbers,
  normalizeLineNumbers,
} from '../utils/codeLines';
import {
  buildFallbackSyntaxBreakdown,
  resolveConceptDetails,
  resolveFrameworkDetails,
  resolvePartHowAndPurpose,
  resolvePartSyntaxBreakdown,
} from '../utils/syntaxBreakdown';
import { mergeAllLanguageParts } from '../utils/languagePartsExtractor';
import { CodeSnippetPreview } from './CodeSnippetPreview';

interface FrameworksConceptsPanelProps {
  detectedLanguage: string;
  originalCode: string;
  frameworks: FrameworkEntry[];
  languageParts: LanguagePartItem[];
  taxonomyGuide: {
    languageVsFramework: string;
    libraryVsPackage: string;
    runtimeRole: string;
  };
  languageConcepts: LanguageConceptEntry[];
  onSelectLines: (lineNumbers: number[], label: string) => void;
}

export function FrameworksConceptsPanel({
  detectedLanguage,
  originalCode,
  frameworks,
  languageParts,
  taxonomyGuide,
  languageConcepts,
  onSelectLines,
}: FrameworksConceptsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedPartKey, setSelectedPartKey] = useState<string | null>(null);
  const [selectedPartLines, setSelectedPartLines] = useState<number[]>([]);
  const [selectedLocKey, setSelectedLocKey] = useState<string | null>(null);
  const [selectedConceptKey, setSelectedConceptKey] = useState<string | null>(null);

  const allLanguageParts = useMemo(
    () => mergeAllLanguageParts(languageParts, originalCode, detectedLanguage),
    [languageParts, originalCode, detectedLanguage]
  );

  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(allLanguageParts.map((p) => p.category).filter(Boolean))
    );
    return ['All', ...cats];
  }, [allLanguageParts]);

  const currentCategory = categories.includes(activeCategory)
    ? activeCategory
    : 'All';

  const filteredParts = useMemo(() => {
    if (currentCategory === 'All') return allLanguageParts;
    return allLanguageParts.filter((p) => p.category === currentCategory);
  }, [allLanguageParts, currentCategory]);

  const resolvePartLines = (part: LanguagePartItem): number[] => {
    const explicit = normalizeLineNumbers(part.lineNumbers ?? [], originalCode);
    if (explicit.length > 0) return explicit;
    return findMatchingLineNumbers(
      originalCode,
      part.syntaxToken || part.partName,
      6
    );
  };

  return (
    <div className="space-y-8">
      {/* 1. Parts of the Language Used & How They Connect to Frameworks */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Parts of {detectedLanguage} Used in This Code</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any language part or line number to show and highlight its exact code in the editor.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {allLanguageParts.length} parts identified
          </span>
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-fit">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  currentCategory === cat
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {filteredParts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No language part breakdown available for this snippet yet.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredParts.map((part, idx) => {
              const partKey = `${part.partName}-${idx}`;
              const partLines = resolvePartLines(part);
              const isSelected = selectedPartKey === partKey;
              const previewLines =
                isSelected && selectedPartLines.length > 0
                  ? selectedPartLines
                  : partLines;
              const tokenBreakdown = resolvePartSyntaxBreakdown(part, originalCode);
              const { howItWorks: resolvedHow, purpose: resolvedPurpose } =
                resolvePartHowAndPurpose(part, originalCode);

              return (
                <div
                  key={partKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedPartKey(partKey);
                    setSelectedPartLines(partLines);
                    if (partLines.length > 0) {
                      onSelectLines(partLines, part.partName);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPartKey(partKey);
                      setSelectedPartLines(partLines);
                      if (partLines.length > 0) {
                        onSelectLines(partLines, part.partName);
                      }
                    }
                  }}
                  className={`p-4 rounded-xl border transition-colors bg-white dark:bg-slate-900 space-y-3 cursor-pointer ${
                    isSelected
                      ? 'border-violet-500 dark:border-violet-400 ring-1 ring-violet-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-600'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span>{part.category}</span>
                        {part.syntaxToken && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono text-sky-700 dark:text-sky-400">
                              {part.syntaxToken}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {part.partName}
                      </h3>
                    </div>

                    {partLines.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="text-slate-400 dark:text-slate-500">Show code:</span>
                        {partLines.map((ln, lIdx) => (
                          <button
                            key={`${ln}-${lIdx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPartKey(partKey);
                              setSelectedPartLines([ln]);
                              onSelectLines([ln], `${part.partName} · Line ${ln}`);
                            }}
                            className={`px-1.5 py-0.5 rounded font-medium cursor-pointer tabular-nums transition-colors ${
                              isSelected &&
                              selectedPartLines.length === 1 &&
                              selectedPartLines[0] === ln
                                ? 'bg-violet-600 text-white'
                                : 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60'
                            }`}
                          >
                            Line {ln}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isSelected && previewLines.length > 0 ? (
                    <CodeSnippetPreview
                      code={originalCode}
                      lineNumbers={previewLines}
                      title={part.partName}
                      onClickLine={(ln) => {
                        setSelectedPartLines([ln]);
                        onSelectLines([ln], `${part.partName} · Line ${ln}`);
                      }}
                    />
                  ) : (
                    part.codeSnippet && (
                      <pre className="p-2.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto">
                        <code>{part.codeSnippet}</code>
                      </pre>
                    )
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        How It Works
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {resolvedHow}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-violet-950/25 border border-violet-200/80 dark:border-violet-900/60 space-y-1">
                      <div className="font-semibold text-violet-900 dark:text-violet-200">
                        Purpose in This Code
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {resolvedPurpose}
                      </p>
                    </div>
                  </div>

                  {part.whatItIs &&
                    part.whatItIs !== (part.howItWorks || part.explanation) && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          What it is:{' '}
                        </span>
                        {part.whatItIs}
                      </p>
                    )}

                  {tokenBreakdown.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Every Part Inside This Syntax
                      </div>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                        {tokenBreakdown.map((sb, sbIdx) => (
                          <div
                            key={`${sb.token}-${sbIdx}`}
                            className="p-2.5 bg-slate-50/70 dark:bg-slate-800/30 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs"
                          >
                            <div className="md:col-span-3 font-mono font-semibold text-sky-700 dark:text-sky-300 break-all">
                              {sb.token}
                            </div>
                            <div className="md:col-span-5 text-slate-700 dark:text-slate-300">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                How:{' '}
                              </span>
                              {sb.howItWorks}
                            </div>
                            <div className="md:col-span-4 text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                Purpose:{' '}
                              </span>
                              {sb.purpose}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {part.frameworkUsage && (
                    <div className="p-3 rounded-lg bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 text-xs space-y-1">
                      <div className="font-semibold text-sky-800 dark:text-sky-300">
                        Role in Framework / Runtime
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {part.frameworkUsage}
                      </p>
                    </div>
                  )}

                  {(part.whereToUse || part.whereNotToUse || part.whereInBetweenUse) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                      {part.whereToUse && (
                        <div>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                            Where to use
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {part.whereToUse}
                          </p>
                        </div>
                      )}
                      {part.whereNotToUse && (
                        <div>
                          <span className="font-semibold text-amber-700 dark:text-amber-400 block mb-0.5">
                            Where not to use
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {part.whereNotToUse}
                          </p>
                        </div>
                      )}
                      {part.whereInBetweenUse && (
                        <div>
                          <span className="font-semibold text-sky-700 dark:text-sky-400 block mb-0.5">
                            In-between / Bridge role
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {part.whereInBetweenUse}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* 2. Detected Frameworks & Libraries + Exact Where Used Locations */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Detected Frameworks, Libraries & Where Used</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any location or line number below to jump straight to that code in the editor.
          </p>
        </div>

        {frameworks.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This snippet relies purely on standard {detectedLanguage} built-in features.
          </p>
        ) : (
          <div className="space-y-4">
            {frameworks.map((fw, idx) => {
              const fwDetails = resolveFrameworkDetails(fw, detectedLanguage);
              return (
              <div
                key={`${fw.name}-${idx}`}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {fw.name}
                  </h3>
                  <span className="text-xs font-mono text-sky-700 dark:text-sky-400">
                    {fw.kind}
                  </span>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {fwDetails.whatItIs}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">
                      How it works
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {fwDetails.howItWorks}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">
                      Why developers use it
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {fwDetails.whyDevelopersUseIt}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-violet-50/50 dark:bg-violet-950/25 border border-violet-200/80 dark:border-violet-900/60">
                    <span className="font-semibold text-violet-900 dark:text-violet-200 block mb-0.5">
                      Purpose in this code
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {fwDetails.purposeInThisCode}
                    </p>
                  </div>
                </div>

                {/* Exact Lines Where This Framework/Library Was Used */}
                {fw.whereUsedLocations && fw.whereUsedLocations.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>Where {fw.name} Is Used in Your Code</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      {fw.whereUsedLocations.map((loc, lIdx) => {
                        const locKey = `${fw.name}-loc-${lIdx}`;
                        const isLocSelected = selectedLocKey === locKey;
                        return (
                          <div
                            key={locKey}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedLocKey(locKey);
                              onSelectLines(
                                [loc.lineNumber],
                                `${fw.name} · Line ${loc.lineNumber}`
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedLocKey(locKey);
                                onSelectLines(
                                  [loc.lineNumber],
                                  `${fw.name} · Line ${loc.lineNumber}`
                                );
                              }
                            }}
                            className={`p-3 space-y-2 text-xs cursor-pointer transition-colors ${
                              isLocSelected
                                ? 'bg-violet-50/70 dark:bg-violet-950/30'
                                : 'bg-slate-50/70 dark:bg-slate-800/30 hover:bg-sky-50/60 dark:hover:bg-slate-800/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLocKey(locKey);
                                  onSelectLines(
                                    [loc.lineNumber],
                                    `${fw.name} · Line ${loc.lineNumber}`
                                  );
                                }}
                                className={`px-1.5 py-0.5 rounded font-mono font-semibold cursor-pointer tabular-nums ${
                                  isLocSelected
                                    ? 'bg-violet-600 text-white'
                                    : 'text-sky-700 dark:text-sky-300 bg-sky-100/70 dark:bg-sky-950/60 hover:underline'
                                }`}
                              >
                                Line {loc.lineNumber}
                              </button>
                              <code className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[75%]">
                                {loc.codeSnippet}
                              </code>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              {loc.roleExplanation}
                            </p>
                            {isLocSelected && (
                              <CodeSnippetPreview
                                code={originalCode}
                                lineNumbers={[loc.lineNumber]}
                                title={fw.name}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-xs space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      How it interacts:{' '}
                    </span>
                    {fwDetails.interactions}
                  </p>
                  {fw.importantMethods?.length > 0 && (
                    <p className="font-mono text-slate-600 dark:text-slate-400">
                      <span className="font-sans font-semibold text-slate-800 dark:text-slate-200">
                        Key methods:{' '}
                      </span>
                      {fw.importantMethods.join(' · ')}
                    </p>
                  )}
                  {fw.dependencies?.length > 0 && (
                    <p className="font-mono text-slate-500 dark:text-slate-400">
                      <span className="font-sans font-semibold text-slate-800 dark:text-slate-200">
                        Dependencies:{' '}
                      </span>
                      {fw.dependencies.join(', ')}
                    </p>
                  )}
                  {(fw.whereToUse || fw.whereNotToUse || fw.whereInBetweenUse) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                      {fw.whereToUse && (
                        <div>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                            Where to use
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {fw.whereToUse}
                          </p>
                        </div>
                      )}
                      {fw.whereNotToUse && (
                        <div>
                          <span className="font-semibold text-amber-700 dark:text-amber-400 block mb-0.5">
                            Where not to use
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {fw.whereNotToUse}
                          </p>
                        </div>
                      )}
                      {fw.whereInBetweenUse && (
                        <div>
                          <span className="font-semibold text-sky-700 dark:text-sky-400 block mb-0.5">
                            In-between / Bridge role
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            {fw.whereInBetweenUse}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* 3. Taxonomy Guide */}
      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Language vs. Framework vs. Library vs. Runtime vs. Package
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
              Language vs. Framework
            </h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {taxonomyGuide.languageVsFramework}
            </p>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
              Library vs. Package
            </h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {taxonomyGuide.libraryVsPackage}
            </p>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
              Role of the Runtime
            </h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {taxonomyGuide.runtimeRole}
            </p>
          </div>
        </div>
      </section>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* 4. Language-Specific Concepts */}
      <section className="space-y-3">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {detectedLanguage} Language Concepts in Action
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Syntax rules and language mechanics demonstrated by this snippet. Click a concept to see its matching lines.
          </p>
        </div>

        <div className="space-y-3">
          {languageConcepts.map((concept, idx) => {
            const conceptKey = `${concept.concept}-${idx}`;
            const {
              howItWorks: conceptHow,
              purposeInThisCode: conceptPurpose,
              matchedLines,
            } = resolveConceptDetails(concept, detectedLanguage, originalCode);
            const isConceptSelected = selectedConceptKey === conceptKey;

            return (
              <div
                key={conceptKey}
                role={matchedLines.length > 0 ? 'button' : undefined}
                tabIndex={matchedLines.length > 0 ? 0 : undefined}
                onClick={() => {
                  setSelectedConceptKey(conceptKey);
                  if (matchedLines.length > 0) {
                    onSelectLines(matchedLines, concept.concept);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && matchedLines.length > 0) {
                    e.preventDefault();
                    setSelectedConceptKey(conceptKey);
                    onSelectLines(matchedLines, concept.concept);
                  }
                }}
                className={`p-4 rounded-xl border transition-colors bg-white dark:bg-slate-900 space-y-2.5 ${
                  matchedLines.length > 0 ? 'cursor-pointer' : ''
                } ${
                  isConceptSelected
                    ? 'border-violet-500 dark:border-violet-400 ring-1 ring-violet-500/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-600'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {concept.concept}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {concept.syntaxFound && (
                      <span className="font-mono text-xs text-sky-600 dark:text-sky-400">
                        {concept.syntaxFound}
                      </span>
                    )}
                    {matchedLines.map((ln) => (
                      <button
                        key={ln}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConceptKey(conceptKey);
                          onSelectLines([ln], `${concept.concept} · Line ${ln}`);
                        }}
                        className="px-1.5 py-0.5 rounded font-mono text-[11px] font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 cursor-pointer tabular-nums"
                      >
                        Line {ln}
                      </button>
                    ))}
                  </div>
                </div>
                {isConceptSelected && matchedLines.length > 0 && (
                  <CodeSnippetPreview
                    code={originalCode}
                    lineNumbers={matchedLines}
                    title={concept.concept}
                    onClickLine={(ln) =>
                      onSelectLines([ln], `${concept.concept} · Line ${ln}`)
                    }
                  />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      How It Works
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {conceptHow}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-violet-950/25 border border-violet-200/80 dark:border-violet-900/60 space-y-1">
                    <div className="font-semibold text-violet-900 dark:text-violet-200">
                      Purpose in This Code
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {conceptPurpose}
                    </p>
                  </div>
                </div>
                {(() => {
                  const matchedLineText =
                    matchedLines.length > 0
                      ? originalCode.split('\n')[matchedLines[0] - 1] ?? ''
                      : '';
                  const conceptTokens = buildFallbackSyntaxBreakdown(
                    concept.syntaxFound,
                    matchedLineText
                  );
                  if (conceptTokens.length === 0) return null;
                  return (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {conceptTokens.map((sb, sbIdx) => (
                        <div
                          key={`${sb.token}-${sbIdx}`}
                          className="p-2.5 bg-slate-50/70 dark:bg-slate-800/30 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs"
                        >
                          <div className="md:col-span-3 font-mono font-semibold text-sky-700 dark:text-sky-300 break-all">
                            {sb.token}
                          </div>
                          <div className="md:col-span-5 text-slate-700 dark:text-slate-300">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              How:{' '}
                            </span>
                            {sb.howItWorks}
                          </div>
                          <div className="md:col-span-4 text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Purpose:{' '}
                            </span>
                            {sb.purpose}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Why designed this way: {concept.whyLanguageDesignsItThisWay}
                </p>
                {concept.miniExample && (
                  <pre className="p-2.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-sky-200 font-mono text-xs overflow-x-auto">
                    <code>{concept.miniExample}</code>
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

