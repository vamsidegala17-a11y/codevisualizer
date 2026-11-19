import { Moon, Sun } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenExamples: () => void;
  onNavigateTab: (tabId: 'execution' | 'memory' | 'terminology') => void;
}

export function TopBar({
  isDark,
  onToggleTheme,
  onOpenExamples,
  onNavigateTab,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-8 px-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onNavigateTab('execution');
        }}
        className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
      >
        Code Visualizer
      </a>

      {/* Zone 2: 4 concise single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
        <button
          type="button"
          onClick={onOpenExamples}
          className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Examples
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('execution')}
          className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Execution
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('memory')}
          className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Memory
        </button>
        <button
          type="button"
          onClick={() => onNavigateTab('terminology')}
          className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Concepts
        </button>
      </nav>

      {/* Zone 3: Install App & Theme Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isDark ? 'Light Theme' : 'Dark Theme'}</span>
        </button>
      </div>
    </header>
  );
}
