import React from 'react';
import type { EditorDiagnostic } from '../../core/services/reconciliation';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ZapIcon,
  CheckIcon,
} from '../common/Icons';

export interface DockProblemsTableProps {
  diagnostics: EditorDiagnostic[];
  onDiagnosticClick?: (diag: EditorDiagnostic) => void;
  onQuickFix?: (diag: EditorDiagnostic) => void;
}

export const DockProblemsTable: React.FC<DockProblemsTableProps> = ({
  diagnostics,
  onDiagnosticClick,
  onQuickFix,
}) => {
  if (!diagnostics || diagnostics.length === 0) {
    return (
      <div
        data-testid="zero-problems-message"
        className="flex h-full items-center justify-center p-6 text-neutral-500 font-mono text-xs"
      >
        <div className="flex items-center gap-2">
          <CheckIcon size={14} className="text-emerald-500" />
          <span>Zero issues detected in current script workspace.</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dock-problems-table" className="h-full overflow-auto select-none">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/60 text-[10px] uppercase font-mono text-neutral-400">
            <th className="py-1 px-3 w-8">Type</th>
            <th className="py-1 px-3 w-20">Category</th>
            <th className="py-1 px-3">Description</th>
            <th className="py-1 px-3 w-32">Source</th>
            <th className="py-1 px-3 w-28 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-900">
          {diagnostics.map((diag) => {
            const isError = diag.severity === 'error';
            const isWarning = diag.severity === 'warning';

            return (
              <tr
                key={diag.id}
                data-testid={`problem-row-${diag.id}`}
                onClick={() => onDiagnosticClick?.(diag)}
                className="group cursor-pointer hover:bg-neutral-900 transition-colors"
              >
                {/* Severity Icon */}
                <td className="py-1.5 px-3">
                  {isError && <AlertCircleIcon size={13} className="text-rose-400" />}
                  {isWarning && <AlertTriangleIcon size={13} className="text-amber-400" />}
                  {!isError && !isWarning && <InfoIcon size={13} className="text-sky-400" />}
                </td>

                {/* Category Badge */}
                <td className="py-1.5 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                      diag.category === 'compiler'
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                        : diag.category === 'asset'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                        : diag.category === 'character'
                        ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                        : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    {diag.category}
                  </span>
                </td>

                {/* Description */}
                <td className="py-1.5 px-3 text-neutral-200">
                  <span className="font-sans text-xs group-hover:text-white transition-colors">
                    {diag.message}
                  </span>
                </td>

                {/* Source File & Line */}
                <td className="py-1.5 px-3 font-mono text-[11px] text-neutral-400">
                  {diag.fileName ? (
                    <span>
                      {diag.fileName}
                      {diag.line ? `:${diag.line}` : ''}
                    </span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>

                {/* 1-Click QuickFix Action */}
                <td className="py-1.5 px-3 text-right">
                  {diag.quickFix && onQuickFix && (
                    <button
                      type="button"
                      data-testid={`btn-quickfix-${diag.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickFix(diag);
                      }}
                      title={`Quick Fix: ${diag.quickFix.type}`}
                      className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition"
                    >
                      <ZapIcon size={10} />
                      <span>Quick Fix</span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
