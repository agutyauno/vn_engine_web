import React from 'react';
import { TrashIcon, TerminalIcon } from '../common/Icons';

export interface ConsoleLogEntry {
  id?: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface ConsoleLogStreamProps {
  logs: ConsoleLogEntry[];
  onClearLogs: () => void;
}

export const ConsoleLogStream: React.FC<ConsoleLogStreamProps> = ({
  logs,
  onClearLogs,
}) => {
  const formatTime = (ts: number): string => {
    try {
      const d = new Date(ts);
      return d.toTimeString().substring(0, 8);
    } catch {
      return '00:00:00';
    }
  };

  return (
    <div data-testid="console-log-stream" className="flex h-full flex-col font-mono text-xs select-none">
      {/* Console Top Bar */}
      <div className="flex h-7 items-center justify-between border-b border-neutral-800 px-3 bg-neutral-900/40">
        <div className="flex items-center gap-1.5 text-neutral-400 text-[10px] uppercase font-semibold">
          <TerminalIcon size={11} />
          <span>Engine Event Stream ({logs.length})</span>
        </div>

        <button
          type="button"
          data-testid="btn-clear-logs"
          onClick={onClearLogs}
          title="Clear Console"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <TrashIcon size={11} />
          <span>Clear</span>
        </button>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {logs.length === 0 ? (
          <div
            data-testid="empty-console-logs"
            className="flex h-24 items-center justify-center text-neutral-600 text-xs"
          >
            No console output. Engine logs will appear here during preview.
          </div>
        ) : (
          logs.map((log, idx) => {
            const levelClass =
              log.level === 'error'
                ? 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                : log.level === 'warn'
                ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
                : log.level === 'debug'
                ? 'text-neutral-400 bg-neutral-800'
                : 'text-sky-400 bg-sky-950/40 border-sky-800/40';

            return (
              <div
                key={log.id || `${log.timestamp}-${idx}`}
                data-testid="console-log-item"
                className="flex items-start gap-2.5 py-0.5 px-1 rounded hover:bg-neutral-900 transition-colors"
              >
                <span className="text-[10px] text-neutral-500 shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.2 text-[9px] uppercase border font-semibold shrink-0 ${levelClass}`}
                >
                  {log.level}
                </span>
                <span className="text-neutral-200 break-all">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
