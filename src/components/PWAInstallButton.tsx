import { useState } from 'react';
import { Check, Copy, Download, Laptop, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isMacSafari,
    isInIframe,
    install,
  } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClickInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(false);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard blocked in restricted frames; keep URL visible for manual copy
    }
  };

  const currentUrl =
    typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <button
        type="button"
        onClick={handleClickInstall}
        title="Install Code Visualizer on Mobile, Desktop, or Laptop"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-600"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install Code Visualizer App"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Install Code Visualizer App
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700 dark:text-slate-300">
              {isInIframe && (
                <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 space-y-2">
                  <p className="leading-relaxed">
                    You are viewing inside an embedded preview frame. To trigger the one-click browser install prompt on your phone, desktop, or laptop, open the app URL directly in its own browser tab:
                  </p>
                  {currentUrl && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate px-2 py-1 rounded bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-800 font-mono text-[11px]">
                        {currentUrl}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyUrl}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shrink-0"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop & Laptop instructions */}
              <div
                className={`p-3.5 rounded-lg border space-y-1.5 ${
                  !isIOS && !isAndroid
                    ? 'border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/25'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                  <Laptop className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Desktop & Laptop (Windows / macOS / Linux)</span>
                </div>
                {isMacSafari ? (
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <li>
                      In Safari’s top menu bar, click <strong>File</strong>.
                    </li>
                    <li>
                      Select <strong>Add to Dock…</strong> and confirm <strong>Add</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <li>
                      In Chrome or Edge, click the <strong>Install icon</strong> in the right side of the address bar, or open <strong>Menu (⋮) → Cast, save, and share → Install Code Visualizer</strong>.
                    </li>
                    <li>
                      Click <strong>Install</strong> to launch it as a standalone desktop/laptop app.
                    </li>
                  </ol>
                )}
              </div>

              {/* Mobile instructions */}
              <div
                className={`p-3.5 rounded-lg border space-y-1.5 ${
                  isIOS || isAndroid
                    ? 'border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/25'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                  <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Mobile (Android & iPhone / iPad)</span>
                </div>
                {isIOS ? (
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <li>
                      Tap the <strong>Share</strong> button in Safari’s toolbar.
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <li>
                      <strong>Android (Chrome / Edge):</strong> Tap <strong>⋮ Menu → Install app</strong> (or <strong>Add to Home screen</strong>).
                    </li>
                    <li>
                      <strong>iPhone / iPad (Safari):</strong> Tap <strong>Share → Add to Home Screen</strong>.
                    </li>
                  </ol>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
