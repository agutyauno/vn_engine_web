import React, { useState } from 'react';
import type { EngineDiagnostic } from '@vn-engine/shared-types';
import type { EditorDiagnostic } from '../../core/services/reconciliation';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ZapIcon,
  CheckIcon,
} from '../common/Icons';

export type DiagnosticItem = EngineDiagnostic | EditorDiagnostic;

export interface DockProblemsTableProps {
  diagnostics: DiagnosticItem[];
  onDiagnosticClick?: (diag: DiagnosticItem) => void;
  onQuickFix?: (diag: DiagnosticItem) => void;
  filter?: 'all' | 'error' | 'warning' | 'info';
  onFilterChange?: (filter: 'all' | 'error' | 'warning' | 'info') => void;
}

export const DockProblemsTable: React.FC<DockProblemsTableProps> = ({
  diagnostics,
  onDiagnosticClick,
  onQuickFix,
  filter: controlledFilter,
  onFilterChange,
}) => {
  const [internalFilter, setInternalFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const currentFilter = controlledFilter ?? internalFilter;

  const handleFilterClick = (f: 'all' | 'error' | 'warning' | 'info') => {
    setInternalFilter(f);
    onFilterChange?.(f);
  };

  const filteredDiagnostics = (diagnostics || []).filter((d) => {
    if (currentFilter === 'all') return true;
    return d.severity === currentFilter;
  });

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
    <div data-testid="dock-problems-table" className="h-full flex flex-col overflow-hidden select-none">
      {/* Filter toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/40 px-3 py-1 text-xs">
        <span className="text-[11px] font-medium text-neutral-400">Filter:</span>
        <button
          type="button"
          data-testid="btn-filter-all"
          onClick={() => handleFilterClick('all')}
          className={`rounded px-2 py-0.5 text-[11px] transition ${
            currentFilter === 'all'
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          All ({diagnostics.length})
        </button>
        <button
          type="button"
          data-testid="btn-filter-error"
          onClick={() => handleFilterClick('error')}
          className={`rounded px-2 py-0.5 text-[11px] transition ${
            currentFilter === 'error'
              ? 'bg-rose-950 text-rose-300 border border-rose-800'
              : 'text-neutral-400 hover:text-rose-300'
          }`}
        >
          Errors ({diagnostics.filter((d) => d.severity === 'error').length})
        </button>
        <button
          type="button"
          data-testid="btn-filter-warning"
          onClick={() => handleFilterClick('warning')}
          className={`rounded px-2 py-0.5 text-[11px] transition ${
            currentFilter === 'warning'
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'text-neutral-400 hover:text-amber-300'
          }`}
        >
          Warnings ({diagnostics.filter((d) => d.severity === 'warning').length})
        </button>
        <button
          type="button"
          data-testid="btn-filter-info"
          onClick={() => handleFilterClick('info')}
          className={`rounded px-2 py-0.5 text-[11px] transition ${
            currentFilter === 'info'
              ? 'bg-sky-950 text-sky-300 border border-sky-800'
              : 'text-neutral-400 hover:text-sky-300'
          }`}
        >
          Info ({diagnostics.filter((d) => d.severity === 'info').length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
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
            {filteredDiagnostics.map((diag, idx) => {
              const diagId = 'id' in diag && diag.id ? diag.id : `diag-${idx}`;
              const isError = diag.severity === 'error';
              const isWarning = diag.severity === 'warning';
              const category = 'category' in diag ? diag.category : 'compiler';
              const fileName = 'fileName' in diag ? diag.fileName : undefined;
              const line = 'line' in diag ? diag.line : undefined;
              const quickFix = 'quickFix' in diag ? diag.quickFix : undefined;

              return (
                <tr
                  key={diagId}
                  data-testid={`problem-row-${diagId}`}
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
                        category === 'compiler'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                          : category === 'asset'
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                          : category === 'character'
                          ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      {category}
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
                    {fileName ? (
                      <span>
                        {fileName}
                        {line ? `:${line}` : ''}
                      </span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>

                  {/* 1-Click QuickFix Action */}
                  <td className="py-1.5 px-3 text-right">
                    {quickFix && onQuickFix && (
                      <button
                        type="button"
                        data-testid={`btn-quickfix-${diagId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickFix(diag);
                        }}
                        title={`Quick Fix: ${quickFix.type}`}
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
    </div>
  );
};
