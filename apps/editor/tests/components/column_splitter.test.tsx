// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import {
  ColumnSplitter,
  type ColumnSplitterProps,
} from '../../src/components/studio/ColumnSplitter';

describe('ColumnSplitter Component (Phase 4 TDD)', () => {
  let setPointerCaptureMock: ReturnType<typeof vi.fn>;
  let releasePointerCaptureMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setPointerCaptureMock = vi.fn();
    releasePointerCaptureMock = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = setPointerCaptureMock;
    window.HTMLElement.prototype.releasePointerCapture = releasePointerCaptureMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-SPLIT-01: Drag 'nav' splitter
  describe('TC-SPLIT-01: Nav Splitter Dragging', () => {
    it('emits positive delta when dragged right and negative delta when dragged left', () => {
      const handleResize = vi.fn();
      render(
        <ColumnSplitter
          type="nav"
          onResize={handleResize}
          onReset={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');
      expect(splitter).toBeInTheDocument();

      // Start drag at x = 200
      fireEvent.pointerDown(splitter, { clientX: 200, clientY: 100, pointerId: 1 });

      // Move right to x = 250 (+50px)
      fireEvent.pointerMove(window, { clientX: 250, clientY: 100, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(50);

      // Move left to x = 230 (-20px)
      fireEvent.pointerMove(window, { clientX: 230, clientY: 100, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(-20);

      // End drag
      fireEvent.pointerUp(window, { clientX: 230, clientY: 100, pointerId: 1 });

      // After pointer up, move should not trigger resize
      handleResize.mockClear();
      fireEvent.pointerMove(window, { clientX: 300, clientY: 100, pointerId: 1 });
      expect(handleResize).not.toHaveBeenCalled();
    });
  });

  // TC-SPLIT-02: Drag 'preview' splitter
  describe('TC-SPLIT-02: Preview Splitter Dragging', () => {
    it('emits positive delta when dragged left (expanding preview) and negative when dragged right', () => {
      const handleResize = vi.fn();
      render(
        <ColumnSplitter
          type="preview"
          onResize={handleResize}
          onReset={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');

      // Start drag at x = 800
      fireEvent.pointerDown(splitter, { clientX: 800, clientY: 100, pointerId: 1 });

      // Move left to x = 750 (expanding preview: delta = -(750 - 800) = +50)
      fireEvent.pointerMove(window, { clientX: 750, clientY: 100, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(50);

      // Move right to x = 780 (shrinking preview: delta = -(780 - 750) = -30)
      fireEvent.pointerMove(window, { clientX: 780, clientY: 100, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(-30);

      fireEvent.pointerUp(window, { clientX: 780, clientY: 100, pointerId: 1 });
    });
  });

  // TC-SPLIT-03: Drag 'drawer' splitter
  describe('TC-SPLIT-03: Drawer Splitter Dragging', () => {
    it('emits positive delta when dragged up (expanding drawer) and negative when dragged down', () => {
      const handleResize = vi.fn();
      render(
        <ColumnSplitter
          type="drawer"
          onResize={handleResize}
          onReset={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');

      // Start drag at y = 600
      fireEvent.pointerDown(splitter, { clientX: 300, clientY: 600, pointerId: 1 });

      // Move up to y = 550 (expanding drawer: delta = -(550 - 600) = +50)
      fireEvent.pointerMove(window, { clientX: 300, clientY: 550, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(50);

      // Move down to y = 580 (shrinking drawer: delta = -(580 - 550) = -30)
      fireEvent.pointerMove(window, { clientX: 300, clientY: 580, pointerId: 1 });
      expect(handleResize).toHaveBeenCalledWith(-30);

      fireEvent.pointerUp(window, { clientX: 300, clientY: 580, pointerId: 1 });
    });
  });

  // TC-SPLIT-04: Pointer Capture
  describe('TC-SPLIT-04: Pointer Capture Execution', () => {
    it('calls setPointerCapture on pointer down and releasePointerCapture on pointer up', () => {
      render(
        <ColumnSplitter
          type="nav"
          onResize={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');

      fireEvent.pointerDown(splitter, { clientX: 200, clientY: 100, pointerId: 42 });
      expect(setPointerCaptureMock).toHaveBeenCalledWith(42);

      fireEvent.pointerUp(splitter, { clientX: 200, clientY: 100, pointerId: 42 });
      expect(releasePointerCaptureMock).toHaveBeenCalledWith(42);
    });
  });

  // TC-SPLIT-05: Double click reset
  describe('TC-SPLIT-05: Double Click Reset', () => {
    it('invokes onReset callback when double-clicked', () => {
      const handleReset = vi.fn();
      render(
        <ColumnSplitter
          type="nav"
          onResize={vi.fn()}
          onReset={handleReset}
        />
      );

      const splitter = screen.getByRole('separator');
      fireEvent.doubleClick(splitter);

      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  // TC-SPLIT-06: Accessibility & Attributes
  describe('TC-SPLIT-06: Accessibility & ARIA Attributes', () => {
    it('renders role="separator" and aria-orientation="vertical" for nav and preview', () => {
      const { rerender } = render(
        <ColumnSplitter
          type="nav"
          onResize={vi.fn()}
          onReset={vi.fn()}
        />
      );

      let splitter = screen.getByRole('separator');
      expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
      expect(splitter).toHaveAttribute('tabindex', '0');

      rerender(
        <ColumnSplitter
          type="preview"
          onResize={vi.fn()}
          onReset={vi.fn()}
        />
      );
      splitter = screen.getByRole('separator');
      expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
      expect(splitter).toHaveAttribute('tabindex', '0');
    });

    it('renders aria-orientation="horizontal" for drawer', () => {
      render(
        <ColumnSplitter
          type="drawer"
          onResize={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const splitter = screen.getByRole('separator');
      expect(splitter).toHaveAttribute('aria-orientation', 'horizontal');
      expect(splitter).toHaveAttribute('tabindex', '0');
    });

    it('applies custom className if provided', () => {
      render(
        <ColumnSplitter
          type="nav"
          onResize={vi.fn()}
          onReset={vi.fn()}
          className="custom-splitter-class"
        />
      );

      const splitter = screen.getByRole('separator');
      expect(splitter.className).toContain('custom-splitter-class');
    });
  });
});
