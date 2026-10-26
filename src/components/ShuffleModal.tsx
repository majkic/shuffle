import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { ShuffledResult, ShuffleList } from '../types/index.ts';
import { executeShuffle } from '../utils/shuffle.ts';
import { exportShuffledListToPDF } from '../utils/pdfExport.ts';
import {
  X,
  Shuffle,
  Download,
  Printer,
  Copy,
  Check,
  Star,
  Sparkles,
  Calendar,
  User as UserIcon,
  Layers,
  Lock,
} from 'lucide-react';

interface ShuffleModalProps {
  list: ShuffleList | null;
  isOpen: boolean;
  onClose: () => void;
  onShuffleCountUpdated?: () => void;
}

export const ShuffleModal: React.FC<ShuffleModalProps> = ({
  list,
  isOpen,
  onClose,
  onShuffleCountUpdated,
}) => {
  const [shuffledResult, setShuffledResult] = useState<ShuffledResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Initialize or re-run shuffle when modal opens or list changes
  React.useEffect(() => {
    if (isOpen && list) {
      triggerShuffle();
    } else {
      setShuffledResult(null);
    }
  }, [isOpen, list?.id]);

  if (!isOpen || !list) return null;

  const triggerShuffle = () => {
    setIsAnimating(true);

    // Trigger subtle confetti burst
    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#6366f1', '#eab308', '#ec4899', '#10b981'],
        disableForReducedMotion: true,
      });
    } catch {
      // ignore in environments without canvas
    }

    setTimeout(() => {
      const result = executeShuffle(list);
      setShuffledResult(result);
      fetch(`/api/lists/${encodeURIComponent(list.id)}/shuffle`, { method: 'POST' })
        .then(async (response) => {
          if (!response.ok) throw new Error(await response.text());
          onShuffleCountUpdated?.();
        })
        .catch((error: unknown) => {
          console.error('Unable to record list shuffle:', error);
        });
      setIsAnimating(false);
    }, 280);
  };

  const handleExportPDF = () => {
    if (!shuffledResult) return;
    setIsExporting(true);
    try {
      exportShuffledListToPDF(shuffledResult);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    if (!shuffledResult) return;
    const textLines = [
      `--- ${shuffledResult.listName} (Shuffled) ---`,
      `Category: ${shuffledResult.category}`,
      `Generated: ${new Date(shuffledResult.shuffledAt).toLocaleString()}`,
      '',
    ];

    shuffledResult.items.forEach((it) => {
      const prefix = it.prioritized ? `⭐ [Priority #${it.rank}]` : `[#${it.rank}]`;
      textLines.push(`${prefix} ${it.text}`);
    });

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedCount = list.items.filter((i) => i.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-linear-to-r from-indigo-50/50 via-white to-amber-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {list.category}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" />
                  {list.creatorName}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date().toLocaleDateString()}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {list.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>
                  <strong>{shuffledResult?.items.length || selectedCount}</strong> selected items
                </span>
              </div>
              {shuffledResult && shuffledResult.prioritizedCount > 0 && (
                <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                  <span>
                    <strong>{shuffledResult.prioritizedCount}</strong> kept at top
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Read-only randomized view</span>
            </div>
          </div>
        </div>

        {/* Shuffled Items Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 bg-slate-50/60 dark:bg-slate-950/40">
          {selectedCount === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Layers className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                No items are currently selected
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Only selected items are included in the shuffled result. Please close this view and
                select at least one item from the list.
              </p>
            </div>
          ) : !shuffledResult || isAnimating ? (
            <div className="py-16 text-center space-y-4">
              <div className="inline-flex p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 animate-spin">
                <Shuffle className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Randomizing items and locking priority order at the top...
              </p>
            </div>
          ) : (
            shuffledResult.items.map((item) => (
              <div
                key={item.id}
                className={`relative flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  item.prioritized
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 shadow-xs'
                    : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/60 shadow-xs'
                }`}
              >
                {/* Rank Badge */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                    item.prioritized
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {item.rank}
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    {item.prioritized && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        Priority (Top)
                      </span>
                    )}
                  </div>
                  <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 select-text break-words">
                    {item.text}
                  </p>
                </div>

                {/* Read-only Lock Indicator */}
                <div className="shrink-0 text-slate-300 dark:text-slate-600" title="Item is read-only in shuffled view">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Actions Bar (Mobile-first responsive layout) */}
        <div className="p-3.5 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Shuffle Again Button */}
          <button
            onClick={triggerShuffle}
            disabled={isAnimating || selectedCount === 0}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Shuffle className={`w-4 h-4 ${isAnimating ? 'animate-spin' : ''}`} />
            Shuffle Again
          </button>

          {/* Export and utility actions */}
          <div className="w-full sm:w-auto flex items-center justify-end gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              disabled={!shuffledResult || selectedCount === 0}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Copy shuffled results to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              disabled={!shuffledResult || selectedCount === 0}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Print results"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>Print</span>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={!shuffledResult || selectedCount === 0 || isExporting}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              title="Export formatted PDF for printing"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating...' : 'Export PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
