import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { parseTypewriterSegments } from '../../core/typewriter';
import type { TypewriterSegment } from '../../core/contracts';

export interface UseTypewriterOptions {
  rawText: string;
  isComplete: boolean;
  baseCharsPerSecond: number;
  playbackMode: 'NORMAL' | 'AUTO' | 'SKIP';
  onComplete: () => void;
}

export interface UseTypewriterResult {
  segments: Array<{ text: string; color?: string }>;
  isTyping: boolean;
  skipTypewriter: () => void;
}

interface PreparedSegment extends TypewriterSegment {
  text: string;
}

/**
 * Prepares typewriter segments from raw text.
 * Handles edge cases like trailing punctuation after a pause/wait tag
 * (e.g., 'Stop{wait:0.5s}!') to ensure the punctuation is revealed AFTER the pause.
 */
function prepareSegments(rawText: string): PreparedSegment[] {
  if (!rawText) return [];
  const parsed = parseTypewriterSegments(rawText);

  // If rawText ended with a pause/wait tag before trailing punctuation,
  // split that punctuation into a separate segment so it appears AFTER the pause.
  const trailingPunctMatch = /\{\s*(?:pause|wait)\s*:[^}]*\}\s*([!?.…,:;~'"\s]+)$/.exec(rawText);
  if (trailingPunctMatch && trailingPunctMatch[1] && parsed.length > 0) {
    const punct = trailingPunctMatch[1];
    const lastSeg = parsed[parsed.length - 1]!;
    if (lastSeg.text.endsWith(punct) && lastSeg.text.length > punct.length && lastSeg.pauseAfterMs) {
      const baseText = lastSeg.text.slice(0, -punct.length);
      const pauseMs = lastSeg.pauseAfterMs;
      parsed[parsed.length - 1] = {
        ...lastSeg,
        text: baseText,
        pauseAfterMs: pauseMs,
      };
      parsed.push({
        text: punct,
        color: lastSeg.color,
        speedMultiplier: lastSeg.speedMultiplier,
      });
    }
  }

  return parsed;
}

function computeTotalChars(segments: PreparedSegment[]): number {
  return segments.reduce((acc, seg) => acc + seg.text.length, 0);
}

function getVisibleSegments(
  segments: PreparedSegment[],
  revealedCount: number,
): Array<{ text: string; color?: string }> {
  let remaining = revealedCount;
  const result: Array<{ text: string; color?: string }> = [];

  for (const seg of segments) {
    if (remaining <= 0) break;
    const take = Math.min(seg.text.length, remaining);
    if (take > 0) {
      result.push({
        text: seg.text.slice(0, take),
        color: seg.color,
      });
    }
    remaining -= take;
  }

  return result;
}

export function useTypewriter({
  rawText,
  isComplete,
  baseCharsPerSecond,
  playbackMode,
  onComplete,
}: UseTypewriterOptions): UseTypewriterResult {
  const segments = useMemo(() => prepareSegments(rawText), [rawText]);
  const totalChars = useMemo(() => computeTotalChars(segments), [segments]);

  const shouldBypass =
    isComplete ||
    playbackMode === 'SKIP' ||
    baseCharsPerSecond <= 0 ||
    totalChars === 0;

  const [revealedCount, setRevealedCount] = useState<number>(() => {
    return shouldBypass ? totalChars : 0;
  });

  const [isTyping, setIsTyping] = useState<boolean>(() => {
    return !shouldBypass;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const skipTypewriter = useCallback(() => {
    clearTimer();
    setRevealedCount(totalChars);
    setIsTyping(false);
  }, [clearTimer, totalChars]);

  useEffect(() => {
    clearTimer();

    if (shouldBypass) {
      setRevealedCount(totalChars);
      setIsTyping(false);
      return;
    }

    setRevealedCount(0);
    setIsTyping(true);

    let currentRevealed = 0;

    const scheduleNextChar = (currentCount: number) => {
      if (currentCount >= totalChars) {
        setIsTyping(false);
        onCompleteRef.current();
        return;
      }

      // Identify the segment of the character being revealed
      let countSoFar = 0;
      let targetSeg = segments[0]!;
      let charInSegIndex = 0;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        if (currentCount >= countSoFar && currentCount < countSoFar + seg.text.length) {
          targetSeg = seg;
          charInSegIndex = currentCount - countSoFar;
          break;
        }
        countSoFar += seg.text.length;
      }

      const speedMultiplier = targetSeg.speedMultiplier ?? 1.0;
      const baseDelay = 1000 / baseCharsPerSecond;
      const charDelay = baseDelay / speedMultiplier;

      timerRef.current = setTimeout(() => {
        currentRevealed = currentCount + 1;
        setRevealedCount(currentRevealed);

        if (currentRevealed >= totalChars) {
          if (targetSeg.pauseAfterMs && targetSeg.pauseAfterMs > 0) {
            timerRef.current = setTimeout(() => {
              setIsTyping(false);
              onCompleteRef.current();
            }, targetSeg.pauseAfterMs);
          } else {
            setIsTyping(false);
            onCompleteRef.current();
          }
          return;
        }

        const isLastCharOfSegment = charInSegIndex === targetSeg.text.length - 1;
        if (isLastCharOfSegment && targetSeg.pauseAfterMs && targetSeg.pauseAfterMs > 0) {
          timerRef.current = setTimeout(() => {
            scheduleNextChar(currentRevealed);
          }, targetSeg.pauseAfterMs);
        } else {
          scheduleNextChar(currentRevealed);
        }
      }, charDelay);
    };

    scheduleNextChar(0);

    return () => {
      clearTimer();
    };
  }, [rawText, shouldBypass, baseCharsPerSecond, clearTimer, totalChars, segments]);

  const visibleSegments = useMemo(() => {
    if (shouldBypass || revealedCount >= totalChars) {
      return segments.map((s) => ({ text: s.text, color: s.color }));
    }
    return getVisibleSegments(segments, revealedCount);
  }, [shouldBypass, revealedCount, totalChars, segments]);

  return {
    segments: visibleSegments,
    isTyping,
    skipTypewriter,
  };
}
