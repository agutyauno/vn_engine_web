import { describe, it, expect, vi } from 'vitest';
import * as monacoContainerModule from '../../src/components/studio/MonacoEditorContainer';

// ============================================================================
// Phase 2.3 Dynamic Export Typing Bridge
// Resolves upcoming exports from MonacoEditorContainer cleanly in RED phase
// without causing import resolution syntax errors or compiler breakages.
// ============================================================================
interface MonacoEditorContainerPhase23Exports {
  cleanDropText?: (text: string) => string;
  handleEditorDrop?: (
    editor: {
      executeEdits: (source: string, edits: any[]) => void;
      focus?: () => void;
      getPosition?: () => { lineNumber: number; column: number } | null;
      getTargetAtClientPoint?: (
        x: number,
        y: number,
      ) => { position: { lineNumber: number; column: number } } | null;
    },
    event: {
      clientX?: number;
      clientY?: number;
      dataTransfer?: {
        getData: (format: string) => string;
        dropEffect?: string;
      } | null;
      preventDefault?: () => void;
      stopPropagation?: () => void;
    },
  ) => boolean;
  handleContainerDragOver?: (event: {
    preventDefault: () => void;
    dataTransfer?: { dropEffect: string } | null;
  }) => void;
  getMonacoEditorOptions?: (readOnly?: boolean) => Record<string, any>;
  DEFAULT_MONACO_OPTIONS?: Record<string, any>;
}

const typedModule = monacoContainerModule as unknown as MonacoEditorContainerPhase23Exports;
const cleanDropText = typedModule.cleanDropText;
const handleEditorDrop = typedModule.handleEditorDrop;
const handleContainerDragOver = typedModule.handleContainerDragOver;
const getMonacoEditorOptions = typedModule.getMonacoEditorOptions;
const DEFAULT_MONACO_OPTIONS = typedModule.DEFAULT_MONACO_OPTIONS;

// ============================================================================
// Mock Monaco Editor Factory
// ============================================================================
function createMockEditor(overrides?: {
  position?: { lineNumber: number; column: number } | null;
  targetPosition?: { lineNumber: number; column: number } | null;
}) {
  const executeEditsMock = vi.fn();
  const focusMock = vi.fn();
  const getPositionMock = vi.fn().mockReturnValue(
    overrides?.position !== undefined
      ? overrides.position
      : { lineNumber: 1, column: 1 },
  );
  const getTargetAtClientPointMock = vi.fn().mockImplementation((_x: number, _y: number) => {
    if (overrides?.targetPosition !== undefined) {
      return overrides.targetPosition ? { position: overrides.targetPosition } : null;
    }
    return { position: { lineNumber: 3, column: 5 } };
  });

  return {
    editor: {
      executeEdits: executeEditsMock,
      focus: focusMock,
      getPosition: getPositionMock,
      getTargetAtClientPoint: getTargetAtClientPointMock,
    },
    executeEditsMock,
    focusMock,
    getPositionMock,
    getTargetAtClientPointMock,
  };
}

describe('Phase 2.3: Monaco Drop Text Cleaner & Container Drop Handler (RED Phase)', () => {
  // ==========================================================================
  // Suite 1: Utility Function cleanDropText (TASK-editor-core-bugs Section 2.2)
  // ==========================================================================
  describe('Utility cleanDropText', () => {
    it('is exported as a function from MonacoEditorContainer', () => {
      expect(typeof cleanDropText).toBe('function');
    });

    it('TC-DROP-02 (utility): strips trailing $0 snippet tabstop marker from character expression', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = 'show alice.smile$0\n';
      const output = cleanDropText!(input);
      expect(output).toBe('show alice.smile\n');
      expect(output).not.toContain('$0');
    });

    it('strips $0 marker without trailing newline', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = 'show bob.happy$0';
      const output = cleanDropText!(input);
      expect(output).toBe('show bob.happy');
      expect(output).not.toContain('$0');
    });

    it('strips multiple $0 markers occurring throughout text', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = '$0show alice.smile$0\n$0';
      const output = cleanDropText!(input);
      expect(output).toBe('show alice.smile\n');
      expect(output).not.toContain('$0');
    });

    it('TC-DROP-01 (utility): preserves clean asset snippet text without $0 unmodified', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = 'background bg_room\n';
      const output = cleanDropText!(input);
      expect(output).toBe('background bg_room\n');
    });

    it('preserves quotes, spaces, and complex DSL commands without $0', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = 'scene "bg_forest.png"\nplay music "bgm_title.mp3"\n';
      const output = cleanDropText!(input);
      expect(output).toBe('scene "bg_forest.png"\nplay music "bgm_title.mp3"\n');
    });

    it('handles empty strings and strings containing solely $0', () => {
      expect(typeof cleanDropText).toBe('function');
      expect(cleanDropText!('')).toBe('');
      expect(cleanDropText!('$0')).toBe('');
      expect(cleanDropText!('$0$0$0')).toBe('');
    });

    it('does not remove other dollar signs that are not $0 tabstops', () => {
      expect(typeof cleanDropText).toBe('function');
      const input = 'set gold = $100\n';
      const output = cleanDropText!(input);
      expect(output).toBe('set gold = $100\n');
    });
  });

  // ==========================================================================
  // Suite 2: DragOver Event Handling (TASK-editor-core-bugs Section 2.2)
  // ==========================================================================
  describe('HTML5 DragOver Handler', () => {
    it('is exported as handleContainerDragOver from MonacoEditorContainer', () => {
      expect(typeof handleContainerDragOver).toBe('function');
    });

    it('prevents default event behavior and configures dropEffect to copy', () => {
      expect(typeof handleContainerDragOver).toBe('function');
      const preventDefault = vi.fn();
      const mockEvent = {
        preventDefault,
        dataTransfer: {
          dropEffect: '',
        },
      };

      handleContainerDragOver!(mockEvent);

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(mockEvent.dataTransfer.dropEffect).toBe('copy');
    });
  });

  // ==========================================================================
  // Suite 3: TC-DROP-01 & TC-DROP-02 Editor Drop Execution
  // ==========================================================================
  describe('Editor Drop Execution (handleEditorDrop)', () => {
    it('is exported as handleEditorDrop from MonacoEditorContainer', () => {
      expect(typeof handleEditorDrop).toBe('function');
    });

    it('TC-DROP-01: drops asset text without $0 and calls executeEdits with clean text at target coordinate', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock, focusMock } = createMockEditor({
        targetPosition: { lineNumber: 5, column: 1 },
      });

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const mockEvent = {
        clientX: 120,
        clientY: 250,
        dataTransfer: {
          getData: vi.fn((format: string) =>
            format === 'text/plain' ? 'background bg_room\n' : '',
          ),
        },
        preventDefault,
        stopPropagation,
      };

      const result = handleEditorDrop!(editor, mockEvent);

      expect(result).toBe(true);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(executeEditsMock).toHaveBeenCalledTimes(1);
      expect(executeEditsMock).toHaveBeenCalledWith('drag-drop-insert', [
        {
          range: {
            startLineNumber: 5,
            startColumn: 1,
            endLineNumber: 5,
            endColumn: 1,
          },
          text: 'background bg_room\n',
          forceMoveMarkers: true,
        },
      ]);
      expect(focusMock).toHaveBeenCalledTimes(1);
    });

    it('TC-DROP-02: strips $0 from dropped character expression text before executeEdits', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock, focusMock } = createMockEditor({
        targetPosition: { lineNumber: 8, column: 3 },
      });

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const mockEvent = {
        clientX: 200,
        clientY: 300,
        dataTransfer: {
          getData: vi.fn((format: string) =>
            format === 'text/plain' ? 'show alice.smile$0\n' : '',
          ),
        },
        preventDefault,
        stopPropagation,
      };

      const result = handleEditorDrop!(editor, mockEvent);

      expect(result).toBe(true);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(executeEditsMock).toHaveBeenCalledTimes(1);
      expect(executeEditsMock).toHaveBeenCalledWith('drag-drop-insert', [
        {
          range: {
            startLineNumber: 8,
            startColumn: 3,
            endLineNumber: 8,
            endColumn: 3,
          },
          text: 'show alice.smile\n',
          forceMoveMarkers: true,
        },
      ]);

      // Crucial verification: $0 must NOT be present anywhere in the inserted text
      const insertedText = executeEditsMock.mock.calls[0]![1][0].text;
      expect(insertedText).not.toContain('$0');
      expect(insertedText).toBe('show alice.smile\n');
      expect(focusMock).toHaveBeenCalledTimes(1);
    });

    it('TC-DROP-02 (variant): strips $0 and appends trailing newline when dropped text has no newline', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock } = createMockEditor({
        targetPosition: { lineNumber: 10, column: 1 },
      });

      const mockEvent = {
        clientX: 100,
        clientY: 100,
        dataTransfer: {
          getData: vi.fn(() => 'show bob.happy$0'),
        },
      };

      const result = handleEditorDrop!(editor, mockEvent);

      expect(result).toBe(true);
      expect(executeEditsMock).toHaveBeenCalledTimes(1);
      const insertedText = executeEditsMock.mock.calls[0]![1][0].text;
      expect(insertedText).toBe('show bob.happy\n');
      expect(insertedText).not.toContain('$0');
    });
  });

  // ==========================================================================
  // Suite 4: Edge Cases & Coordinate Fallbacks
  // ==========================================================================
  describe('Drop Coordinate Fallbacks & Boundary Conditions', () => {
    it('falls back to editor.getPosition() when getTargetAtClientPoint returns null', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock } = createMockEditor({
        targetPosition: null, // Point out of bounds or null
        position: { lineNumber: 12, column: 4 },
      });

      const mockEvent = {
        clientX: 9999,
        clientY: 9999,
        dataTransfer: {
          getData: vi.fn(() => 'scene "bg_forest.png"\n'),
        },
      };

      const result = handleEditorDrop!(editor, mockEvent);

      expect(result).toBe(true);
      expect(executeEditsMock).toHaveBeenCalledWith('drag-drop-insert', [
        {
          range: {
            startLineNumber: 12,
            startColumn: 4,
            endLineNumber: 12,
            endColumn: 4,
          },
          text: 'scene "bg_forest.png"\n',
          forceMoveMarkers: true,
        },
      ]);
    });

    it('falls back safely to line 1, column 1 when both target point and cursor position are null', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock } = createMockEditor({
        targetPosition: null,
        position: null,
      });

      const mockEvent = {
        clientX: 0,
        clientY: 0,
        dataTransfer: {
          getData: vi.fn(() => 'background bg_room\n'),
        },
      };

      const result = handleEditorDrop!(editor, mockEvent);

      expect(result).toBe(true);
      expect(executeEditsMock).toHaveBeenCalledWith('drag-drop-insert', [
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
          text: 'background bg_room\n',
          forceMoveMarkers: true,
        },
      ]);
    });

    it('returns false and does not call executeEdits when dataTransfer is empty or missing text', () => {
      expect(typeof handleEditorDrop).toBe('function');
      const { editor, executeEditsMock } = createMockEditor();

      const mockEventEmpty = {
        clientX: 10,
        clientY: 10,
        dataTransfer: {
          getData: vi.fn(() => ''),
        },
      };

      const result1 = handleEditorDrop!(editor, mockEventEmpty);
      expect(result1).toBe(false);
      expect(executeEditsMock).not.toHaveBeenCalled();

      const mockEventNull = {
        clientX: 10,
        clientY: 10,
        dataTransfer: null,
      };

      const result2 = handleEditorDrop!(editor, mockEventNull);
      expect(result2).toBe(false);
      expect(executeEditsMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Suite 5: Monaco Editor Option Configuration (dropIntoEditor: { enabled: false })
  // ==========================================================================
  describe('Monaco Editor Options Configuration', () => {
    it('disables dropIntoEditor in editor configuration to prevent automatic snippet expansion', () => {
      const options =
        (typeof getMonacoEditorOptions === 'function' ? getMonacoEditorOptions() : null) ||
        DEFAULT_MONACO_OPTIONS;

      expect(options).toBeDefined();
      expect(options?.dropIntoEditor).toEqual({ enabled: false });
    });
  });
});

