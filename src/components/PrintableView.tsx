import React from 'react';
import { ShuffledResult } from '../types/index.ts';

interface PrintableViewProps {
  result: ShuffledResult | null;
}

export const PrintableView: React.FC<PrintableViewProps> = ({ result }) => {
  if (!result) return null;

  return (
    <div className="print-only p-8 text-black bg-white max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-indigo-700">
            SHUFFLE • RANDOMIZED LIST
          </div>
          <h1 className="text-2xl font-black mt-1 text-slate-950">{result.listName}</h1>
          <div className="text-xs text-slate-600 mt-1">
            Category: <strong>{result.category}</strong> • Creator: <strong>{result.creatorName}</strong> ({result.creatorEmail})
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Generated on: {new Date(result.shuffledAt).toLocaleString()}</div>
          <div className="font-bold text-slate-800 mt-1">
            Total Items: {result.items.length} ({result.prioritizedCount} Prioritized)
          </div>
        </div>
      </div>

      {/* Prioritized Section if any */}
      {result.prioritizedCount > 0 && (
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded mb-3 flex items-center justify-between">
            <span>⭐ PRIORITIZED ITEMS (Kept at Top)</span>
            <span>{result.prioritizedCount} items</span>
          </div>
          <div className="space-y-2">
            {result.items
              .filter((i) => i.prioritized)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 border border-amber-300 rounded bg-amber-50/50 print-break-inside-avoid"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
                      {item.rank}
                    </span>
                    <span className="font-semibold text-slate-900 text-sm">{item.text}</span>
                  </div>
                  <div className="w-5 h-5 border border-slate-400 rounded"></div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Standard Randomized Items */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded mb-3 flex items-center justify-between">
          <span>STANDARD RANDOMIZED ITEMS</span>
          <span>{result.unprioritizedCount} items</span>
        </div>
        <div className="space-y-2">
          {result.items
            .filter((i) => !i.prioritized)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 border border-slate-200 rounded print-break-inside-avoid"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {item.rank}
                  </span>
                  <span className="text-slate-800 text-sm">{item.text}</span>
                </div>
                <div className="w-5 h-5 border border-slate-400 rounded"></div>
              </div>
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
        <span>Printed via Shuffle Web App</span>
        <span>Fair, reproducible random list distribution</span>
      </div>
    </div>
  );
};
