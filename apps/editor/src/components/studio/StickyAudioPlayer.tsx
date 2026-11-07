import React, { useState, useEffect, useRef } from 'react';
import type { AssetRef } from '@vn-engine/shared-types';
import { PlayIcon, PauseIcon, CloseIcon } from '../common/Icons';

export interface StickyAudioPlayerProps {
  asset: AssetRef;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const StickyAudioPlayer: React.FC<StickyAudioPlayerProps> = ({ asset, onClose }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(asset.storageUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.warn('Playback error or blocked by policy:', err);
          setIsPlaying(false);
        });
    }

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [asset.storageUrl]);

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(err => {
            console.warn('Playback error:', err);
            setIsPlaying(false);
          });
      }
    }
  };

  return (
    <div
      data-testid="sticky-audio-player"
      className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-neutral-800 bg-neutral-900/95 px-3 py-2 backdrop-blur shadow-lg text-xs"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          data-testid="btn-sticky-player-toggle"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          title={isPlaying ? 'Pause' : 'Play'}
          draggable={false}
          onClick={handleTogglePlay}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:text-white transition shrink-0"
        >
          {isPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
        </button>

        <div className="flex flex-col min-w-0 flex-1">
          <span
            data-testid="sticky-player-track-name"
            className="truncate font-medium text-neutral-200 text-[11px]"
            title={asset.name}
          >
            {asset.name}
          </span>
          <span
            data-testid="sticky-player-duration"
            className="text-[10px] text-neutral-400 font-mono"
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <button
        type="button"
        data-testid="btn-sticky-player-close"
        aria-label="Close audio player"
        title="Close audio player"
        draggable={false}
        onClick={onClose}
        className="ml-2 flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition shrink-0"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
};

