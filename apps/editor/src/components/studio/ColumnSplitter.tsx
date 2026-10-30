import React, { useRef, useEffect, useCallback } from 'react';

export interface ColumnSplitterProps {
  type: 'nav' | 'preview' | 'drawer';
  onResize: (delta: number) => void;
  onReset: () => void;
  className?: string;
}

export const ColumnSplitter: React.FC<ColumnSplitterProps> = ({
  type,
  onResize,
  onReset,
  className = '',
}) => {
  const splitterRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      activePointerIdRef.current = e.pointerId;

      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Fallback for environments lacking pointer capture
      }
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {
        // Fallback
      }
      activePointerIdRef.current = null;
    },
    []
  );

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;

      let delta = 0;
      if (type === 'nav') {
        // Drag right: delta > 0 (expanding nav)
        delta = e.clientX - lastPosRef.current.x;
      } else if (type === 'preview') {
        // Drag left: delta > 0 (expanding preview)
        delta = -(e.clientX - lastPosRef.current.x);
      } else if (type === 'drawer') {
        // Drag up: delta > 0 (expanding drawer)
        delta = -(e.clientY - lastPosRef.current.y);
      }

      lastPosRef.current = { x: e.clientX, y: e.clientY };
      onResize(delta);
    };

    const handleWindowPointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (activePointerIdRef.current !== null && splitterRef.current) {
        try {
          splitterRef.current.releasePointerCapture?.(activePointerIdRef.current);
        } catch {
          // Ignore
        }
      }
      activePointerIdRef.current = null;
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [type, onResize]);

  const isVertical = type === 'nav' || type === 'preview';
  const orientation = isVertical ? 'vertical' : 'horizontal';

  const defaultClasses = isVertical
    ? 'w-1 hover:w-1.5 cursor-col-resize bg-neutral-800 hover:bg-neutral-600 transition-all select-none shrink-0'
    : 'h-1 hover:h-1.5 cursor-row-resize bg-neutral-800 hover:bg-neutral-600 transition-all select-none shrink-0';

  return (
    <div
      ref={splitterRef}
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDoubleClick={onReset}
      className={`${defaultClasses} ${className}`.trim()}
    />
  );
};
