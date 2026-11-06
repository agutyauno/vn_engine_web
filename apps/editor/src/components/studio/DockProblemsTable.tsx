import React, { useState, useMemo } from 'react';
import type { EngineDiagnostic } from '@vn-engine/shared-types';
import type { EditorDiagnostic } from '../../core/services/reconciliation';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ZapIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../common/Icons';

export type DiagnosticItem = EngineDiagnostic | EditorDiagnostic;

export interface DiagnosticGroup {
  groupKey: string;
  severity: 'error' | 'warning' | 'info';
  category: 'compiler' | 'asset' | 'character' | 'runtime' | string;
  message: string;
  code?: string;
  items: DiagnosticItem[];
  quickFix?: EditorDiagnostic['quickFix'];
}

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
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const currentFilter = controlledFilter ?? internalFilter;

  const handleFilterClick = (f: 'all' | 'error' | 'warning' | 'info') => {
    setInternalFilter(f);
    onFilterChange?.(f);
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const filteredDiagnostics = (diagnostics || []).filter(d => {
    if (currentFilter === 'all') return true;
    return d.severity === currentFilter;
  });

  const diagnosticGroups = useMemo<DiagnosticGroup[]>(() => {
    const map = new Map<string, DiagnosticGroup>();

    for (const diag of filteredDiagnostics) {
      const severity = diag.severity;
      const category = 'category' in diag && diag.category ? diag.category : 'compiler';
      const code = 'code' in diag && diag.code ? diag.code : undefined;
      const key = `${severity}:${category}:${code || diag.message}`;

      const existing = map.get(key);
      if (existing) {
        existing.items.push(diag);
        if (!existing.quickFix && 'quickFix' in diag && diag.quickFix) {
          existing.quickFix = diag.quickFix;
        }
      } else {
        map.set(key, {
          groupKey: key,
          severity,
          category,
          message: diag.message,
          code,
          items: [diag],
          quickFix: 'quickFix' in diag ? diag.quickFix : undefined,
        });
      }
    }

    return Array.from(map.values());
  }, [filteredDiagnostics]);

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
    <div
      data-testid="dock-problems-table"
      className="h-full flex flex-col overflow-hidden select-none"
    >
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
          Errors ({diagnostics.filter(d => d.severity === 'error').length})
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
          Warnings ({diagnostics.filter(d => d.severity === 'warning').length})
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
          Info ({diagnostics.filter(d => d.severity === 'info').length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-[10px] uppercase font-mono text-neutral-400">
              <th className="py-1 px-3 w-8">Type</th>
              <th className="py-1 px-3 w-20">Category</th>
              <th className="py-1 px-3">Description</th>
              <th className="py-1 px-3 w-36">Source</th>
              <th className="py-1 px-3 w-28 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900">
            {diagnosticGroups.map(group => {
              const isGroup = group.items.length > 1;
              const isError = group.severity === 'error';
              const isWarning = group.severity === 'warning';

              if (!isGroup) {
                // Single diagnostic row (count = 1)
                const diag = group.items[0];
                if (!diag) return null;
                const diagId = 'id' in diag && diag.id ? diag.id : group.groupKey;
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
                          group.category === 'compiler'
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                            : group.category === 'asset'
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                              : group.category === 'character'
                                ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                                : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        {group.category}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="py-1.5 px-3 text-neutral-200">
                      <div className="flex items-center gap-2">
                        {group.code && (
                          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 border border-neutral-700">
                            {group.code}
                          </span>
                        )}
                        <span className="font-sans text-xs group-hover:text-white transition-colors">
                          {group.message}
                        </span>
                      </div>
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

                    {/* Action */}
                    <td className="py-1.5 px-3 text-right">
                      {quickFix && onQuickFix && (
                        <button
                          type="button"
                          data-testid={`btn-quickfix-${diagId}`}
                          onClick={e => {
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
              }

              // Accordion Group Parent Row (count > 1)
              const isExpanded = expandedGroupKeys.has(group.groupKey);
              const firstItem = group.items[0];
              if (!firstItem) return null;
              const firstFileName = 'fileName' in firstItem ? firstItem.fileName : undefined;
              const firstLine = 'line' in firstItem ? firstItem.line : undefined;

              return (
                <React.Fragment key={`group-${group.groupKey}`}>
                  <tr
                    data-testid={`problem-row-group-${group.groupKey}`}
                    onClick={() => toggleGroup(group.groupKey)}
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
                          group.category === 'compiler'
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                            : group.category === 'asset'
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                              : group.category === 'character'
                                ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                                : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        {group.category}
                      </span>
                    </td>

                    {/* Description with Toggle Accordion & Badge Count */}
                    <td className="py-1.5 px-3 text-neutral-200">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={`btn-toggle-group-${group.groupKey}`}
                          onClick={e => {
                            e.stopPropagation();
                            toggleGroup(group.groupKey);
                          }}
                          className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                          title={isExpanded ? 'Collapse group' : 'Expand group'}
                        >
                          {isExpanded ? (
                            <ChevronDownIcon size={12} />
                          ) : (
                            <ChevronRightIcon size={12} />
                          )}
                        </button>
                        {group.code && (
                          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 border border-neutral-700">
                            {group.code}
                          </span>
                        )}
                        <span className="font-sans text-xs group-hover:text-white transition-colors">
                          {group.message}
                        </span>
                        <span
                          data-testid="badge-group-count"
                          className="rounded-full bg-neutral-800 border border-neutral-700 px-1.5 py-0.2 text-[10px] font-mono text-neutral-300 ml-1"
                        >
                          ×{group.items.length}
                        </span>
                      </div>
                    </td>

                    {/* Source: first file:line (+N) */}
                    <td className="py-1.5 px-3 font-mono text-[11px] text-neutral-400">
                      {firstFileName ? (
                        <span>
                          {firstFileName}
                          {firstLine ? `:${firstLine}` : ''}{' '}
                          <span className="text-neutral-500 font-sans text-[10px]">
                            (+{group.items.length - 1})
                          </span>
                        </span>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>

                    {/* Group Quick Fix Action */}
                    <td className="py-1.5 px-3 text-right">
                      {group.quickFix && onQuickFix && (
                        <button
                          type="button"
                          data-testid={`btn-quickfix-group-${group.groupKey}`}
                          onClick={e => {
                            e.stopPropagation();
                            const target =
                              group.items.find(it => 'quickFix' in it && it.quickFix) || firstItem;
                            if (target) onQuickFix(target);
                          }}
                          title={`Quick Fix: ${group.quickFix.type}`}
                          className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition"
                        >
                          <ZapIcon size={10} />
                          <span>Quick Fix</span>
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Child Rows when expanded */}
                  {isExpanded &&
                    group.items.map((item, itemIdx) => {
                      const childId =
                        'id' in item && item.id ? item.id : `${group.groupKey}-${itemIdx}`;
                      const childFileName = 'fileName' in item ? item.fileName : undefined;
                      const childLine = 'line' in item ? item.line : undefined;
                      const childCol = 'col' in item ? item.col : undefined;
                      const childQuickFix = 'quickFix' in item ? item.quickFix : undefined;

                      return (
                        <tr
                          key={childId}
                          data-testid={`problem-row-child-${childId}`}
                          onClick={() => onDiagnosticClick?.(item)}
                          className="group cursor-pointer bg-neutral-950/40 hover:bg-neutral-900/80 transition-colors border-b border-neutral-900/60"
                        >
                          <td className="py-1 px-3" />
                          <td className="py-1 px-3" />
                          <td className="py-1 px-3 pl-8 text-neutral-400 font-mono text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-600">↳</span>
                              <span>
                                {childFileName}:{childLine}
                                {childCol ? `:${childCol}` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="py-1 px-3 font-mono text-[11px] text-neutral-400">
                            {childFileName
                              ? `${childFileName}${childLine ? `:${childLine}` : ''}`
                              : '—'}
                          </td>
                          <td className="py-1 px-3 text-right">
                            {childQuickFix && onQuickFix && (
                              <button
                                type="button"
                                data-testid={`btn-quickfix-${childId}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  onQuickFix(item);
                                }}
                                title={`Quick Fix: ${childQuickFix.type}`}
                                className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 transition"
                              >
                                <ZapIcon size={9} />
                                <span>Fix</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
