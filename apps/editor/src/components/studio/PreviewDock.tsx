import React from 'react';
import {
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  ExternalLinkIcon,
} from '../common/Icons';

export interface PreviewDockProps {
  projectId: string;
  canvasWidth: number;
  canvasHeight: number;
  aspectRatio?: string;
  isPlaying: boolean;
  isPopout: boolean;
  previewUrl?: string;
  onTogglePlay: () => void;
  onReload: () => void;
  onTogglePopout: () => void;
}

export function formatAspectRatioString(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const wRatio = width / divisor;
  const hRatio = height / divisor;
  return `${width} × ${height} (${wRatio}:${hRatio})`;
}

export const PreviewDock: React.FC<PreviewDockProps> = ({
  projectId: _projectId,
  canvasWidth,
  canvasHeight,
  isPlaying,
  isPopout,
  previewUrl = 'about:blank',
  onTogglePlay,
  onReload,
  onTogglePopout,
}) => {
  const isPortrait = canvasHeight > canvasWidth;

  return (
    <div
      data-testid="preview-dock"
      className="flex flex-col h-full w-full bg-neutral-950 text-neutral-100 select-none overflow-hidden"
    >
      {/* Top Controls Toolbar */}
      <div className="flex h-10 items-center justify-between border-b border-neutral-800 px-3 bg-neutral-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-neutral-300">
            Live Preview
          </span>
          <span
            className={`h-2 w-2 rounded-full ${
              isPopout
                ? 'bg-amber-400'
                : isPlaying
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-neutral-600'
            }`}
            title={
              isPopout
                ? 'Pop-out window active'
                : isPlaying
                ? 'Preview running'
                : 'Standby'
            }
          />
        </div>

        {/* Resolution Badge */}
        <div
          data-testid="preview-resolution-badge"
          className="rounded bg-neutral-800/90 px-2 py-0.5 text-[10px] font-mono text-neutral-400 border border-neutral-700/50"
        >
          {formatAspectRatioString(canvasWidth, canvasHeight)}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            data-testid={isPlaying ? 'btn-preview-pause' : 'btn-preview-play'}
            onClick={onTogglePlay}
            disabled={isPopout}
            title={
              isPopout
                ? 'Running in popout window'
                : isPlaying
                ? 'Pause Preview'
                : 'Run Live Preview'
            }
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isPlaying ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          {/* Reload / Restart */}
          <button
            type="button"
            data-testid="btn-preview-reload"
            onClick={onReload}
            title="Restart Scene"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <RotateCcwIcon size={13} />
          </button>

          {/* Pop-out Window */}
          <button
            type="button"
            data-testid="btn-preview-popout"
            onClick={onTogglePopout}
            title={
              isPopout
                ? 'Dock Preview Window'
                : 'Pop-out Window (BroadcastChannel)'
            }
            className={`rounded p-1 transition ${
              isPopout
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <ExternalLinkIcon size={13} />
          </button>
        </div>
      </div>

      {/* 100% Full-Height Stage Display Area */}
      <div className="flex flex-1 items-center justify-center p-3 sm:p-4 overflow-hidden bg-neutral-950">
        <div
          data-testid="preview-dock-container"
          className="relative flex items-center justify-center rounded border border-neutral-800 bg-black shadow-2xl overflow-hidden"
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            maxHeight: '100%',
            maxWidth: '100%',
            width: isPortrait ? 'auto' : '100%',
            height: isPortrait ? '100%' : 'auto',
          }}
        >
          {isPopout ? (
            /* Pop-out Window Standby Screen */
            <div
              data-testid="preview-standby-screen"
              className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-xs font-mono text-neutral-400"
            >
              <div className="mb-2 rounded-full bg-amber-500/10 p-3 text-amber-400 border border-amber-500/20">
                <ExternalLinkIcon size={24} />
              </div>
              <span className="font-semibold text-neutral-200 text-sm mb-1">
                Pop-out Window Active
              </span>
              <p className="text-[11px] text-neutral-500 max-w-xs mb-3 font-sans">
                Runtime rendering transferred to isolated popout window via BroadcastChannel.
              </p>
              <button
                type="button"
                onClick={onTogglePopout}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
              >
                Return to Dock
              </button>
            </div>
          ) : !isPlaying ? (
            /* Standby Screen before Play */
            <div
              data-testid="preview-standby-screen"
              className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-xs font-mono text-neutral-400"
            >
              <button
                type="button"
                onClick={onTogglePlay}
                className="group flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 border border-neutral-700 hover:border-white hover:bg-neutral-800 transition mb-3"
                title="Start Live Preview"
              >
                <PlayIcon size={20} className="text-neutral-300 group-hover:text-white transition" />
              </button>
              <span className="font-semibold text-neutral-300 mb-1">
                Live Preview Standby
              </span>
              <span className="text-[11px] text-neutral-500 font-sans">
                Click Play or Quick Play in header to run active script
              </span>
            </div>
          ) : (
            /* Live Iframe Player */
            <iframe
              data-testid="preview-player-iframe"
              src={previewUrl}
              title="Visual Novel Live Preview"
              allow="autoplay; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="h-full w-full border-none bg-black"
            />
          )}
        </div>
      </div>
    </div>
  );
};
