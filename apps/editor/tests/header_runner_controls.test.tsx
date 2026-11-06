// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, cleanup } from '@testing-library/react';
import { StudioHeader, type StudioHeaderProps } from '../src/components/studio/StudioHeader';
import { useKeyboardShortcuts, type KeyboardShortcutOptions } from '../src/hooks/useKeyboardShortcuts';

// Mở rộng kiểu dữ liệu theo Data Contract trong TASK-decouple-preview-and-hotreload.md (Mục 2.2 & 2.3)
type ExtendedStudioHeaderProps = StudioHeaderProps & {
  scenes?: string[];
  selectedScene?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'standby';
  onQuickPlay?: () => void;
  onRunFromCursor?: () => void;
  onSelectScene?: (scene: string) => void;
};

type ExtendedKeyboardShortcutOptions = KeyboardShortcutOptions & {
  onRunFromCursor?: () => void;
};

describe('Editor Header Runner Controls & Shortcuts (TASK-decouple-preview-and-hotreload)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TEST-EDT-01 & TEST-EDT-02: Keyboard Shortcuts (useKeyboardShortcuts)
  // =========================================================================
  describe('Keyboard Shortcuts (useKeyboardShortcuts)', () => {
    it('TEST-EDT-01: should trigger onRunFromCursor when pressing Alt + F5', () => {
      const handleRunFromCursor = vi.fn();
      const handleTogglePlay = vi.fn();

      renderHook(() =>
        (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
          onRunFromCursor: handleRunFromCursor,
          onTogglePlay: handleTogglePlay,
          enabled: true,
        })
      );

      // Nhấn tổ hợp Alt + F5
      const altF5Event = new KeyboardEvent('keydown', {
        key: 'F5',
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(altF5Event);

      expect(handleRunFromCursor).toHaveBeenCalledTimes(1);
      // Alt + F5 không được kích hoạt nhầm onTogglePlay
      expect(handleTogglePlay).not.toHaveBeenCalled();
      expect(altF5Event.defaultPrevented).toBe(true);
    });

    it('TEST-EDT-01 (Edge): should not trigger onRunFromCursor when shortcut is disabled or other modifiers pressed', () => {
      const handleRunFromCursor = vi.fn();

      const { rerender } = renderHook(
        ({ enabled }) =>
          (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
            onRunFromCursor: handleRunFromCursor,
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      // 1. Khi enabled = false
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F5', altKey: true, bubbles: true, cancelable: true })
      );
      expect(handleRunFromCursor).not.toHaveBeenCalled();

      // 2. Khi enabled = true nhưng nhấn Ctrl + Alt + F5
      rerender({ enabled: true });
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F5',
          altKey: true,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      // Tổ hợp có Ctrl không phải là Alt + F5 thuần tuý
      expect(handleRunFromCursor).not.toHaveBeenCalled();
    });

    it('TEST-EDT-02: should trigger onTogglePlay when pressing F5 or Ctrl + Enter', () => {
      const handleTogglePlay = vi.fn();
      const handleRunFromCursor = vi.fn();

      renderHook(() =>
        (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
          onTogglePlay: handleTogglePlay,
          onRunFromCursor: handleRunFromCursor,
          enabled: true,
        })
      );

      // 1. Nhấn phím F5 đơn thuần (không Alt)
      const f5Event = new KeyboardEvent('keydown', {
        key: 'F5',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(f5Event);

      expect(handleTogglePlay).toHaveBeenCalledTimes(1);
      expect(handleRunFromCursor).not.toHaveBeenCalled();
      expect(f5Event.defaultPrevented).toBe(true);

      // 2. Nhấn tổ hợp Ctrl + Enter
      const ctrlEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlEnterEvent);

      expect(handleTogglePlay).toHaveBeenCalledTimes(2);
      expect(handleRunFromCursor).not.toHaveBeenCalled();
      expect(ctrlEnterEvent.defaultPrevented).toBe(true);

      // 3. Nhấn tổ hợp Cmd + Enter (macOS metaKey)
      const cmdEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(cmdEnterEvent);

      expect(handleTogglePlay).toHaveBeenCalledTimes(3);
    });

    it('TEST-EDT-02 (Edge): should not trigger onTogglePlay when enabled is false', () => {
      const handleTogglePlay = vi.fn();

      renderHook(() =>
        (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
          onTogglePlay: handleTogglePlay,
          enabled: false,
        })
      );

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true })
      );
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
      );

      expect(handleTogglePlay).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TEST-EDT-03: Render StudioHeader with Runner Controls
  // =========================================================================
  describe('StudioHeader Runner Controls Rendering (TEST-EDT-03)', () => {
    it('renders Play button with title containing "Play (F5)" and testid "btn-header-play"', () => {
      render(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            scenes: ['scene1.vns', 'scene2.vns'],
            selectedScene: 'scene1.vns',
            connectionStatus: 'standby',
            onQuickPlay: vi.fn(),
            onRunFromCursor: vi.fn(),
            onSelectScene: vi.fn(),
          } as ExtendedStudioHeaderProps)}
        />
      );

      const playBtn = screen.getByTestId('btn-header-play');
      expect(playBtn).toBeInTheDocument();
      expect(playBtn).toHaveAttribute('title', expect.stringContaining('Play (F5)'));
    });

    it('renders Run from Cursor button with title containing "Run from Cursor (Alt+F5)" and testid "btn-header-run-cursor"', () => {
      render(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            scenes: ['scene1.vns', 'scene2.vns'],
            selectedScene: 'scene1.vns',
            connectionStatus: 'standby',
            onQuickPlay: vi.fn(),
            onRunFromCursor: vi.fn(),
            onSelectScene: vi.fn(),
          } as ExtendedStudioHeaderProps)}
        />
      );

      const runCursorBtn = screen.getByTestId('btn-header-run-cursor');
      expect(runCursorBtn).toBeInTheDocument();
      expect(runCursorBtn).toHaveAttribute('title', expect.stringContaining('Run from Cursor (Alt+F5)'));
    });

    it('renders Scene Selector dropdown with options and selected scene', () => {
      const scenes = ['intro.vns', 'ch1_morning.vns', 'ch1_evening.vns', 'ending.vns'];
      render(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            scenes,
            selectedScene: 'ch1_morning.vns',
            connectionStatus: 'standby',
            onQuickPlay: vi.fn(),
            onRunFromCursor: vi.fn(),
            onSelectScene: vi.fn(),
          } as ExtendedStudioHeaderProps)}
        />
      );

      const sceneSelect = screen.getByTestId('select-header-scene') as HTMLSelectElement;
      expect(sceneSelect).toBeInTheDocument();
      expect(sceneSelect.value).toBe('ch1_morning.vns');

      // Kiểm tra tất cả options được render đầy đủ
      const options = sceneSelect.querySelectorAll('option');
      expect(options).toHaveLength(scenes.length);
      scenes.forEach((sceneName, idx) => {
        expect(options[idx]).toHaveValue(sceneName);
        expect(options[idx]).toHaveTextContent(sceneName);
      });
    });

    it('renders Preview Status dot and correctly reflects connectionStatus (connected, standby, disconnected)', () => {
      const { rerender } = render(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            connectionStatus: 'connected',
          } as ExtendedStudioHeaderProps)}
        />
      );

      // 1. Connected
      const statusConnected = screen.getByTestId('header-preview-status');
      expect(statusConnected).toBeInTheDocument();
      expect(statusConnected).toHaveAttribute('data-status', 'connected');

      // 2. Standby
      rerender(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            connectionStatus: 'standby',
          } as ExtendedStudioHeaderProps)}
        />
      );
      const statusStandby = screen.getByTestId('header-preview-status');
      expect(statusStandby).toHaveAttribute('data-status', 'standby');

      // 3. Disconnected
      rerender(
        <StudioHeader
          {...({
            projectTitle: 'Visual Novel Alpha',
            connectionStatus: 'disconnected',
          } as ExtendedStudioHeaderProps)}
        />
      );
      const statusDisconnected = screen.getByTestId('header-preview-status');
      expect(statusDisconnected).toHaveAttribute('data-status', 'disconnected');
    });

    it('strictly complies with Rule 8: zero colored OS emojis in Header DOM', () => {
      const { container } = render(
        <StudioHeader
          {...({
            projectTitle: 'Emoji Compliance VN',
            scenes: ['scene1.vns'],
            selectedScene: 'scene1.vns',
            connectionStatus: 'connected',
            onQuickPlay: vi.fn(),
            onRunFromCursor: vi.fn(),
            onSelectScene: vi.fn(),
          } as ExtendedStudioHeaderProps)}
        />
      );

      // Biểu thức regex kiểm tra các dải ký tự emoji Unicode màu mè
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  // =========================================================================
  // TEST-EDT-04: Header Controls User Interactions
  // =========================================================================
  describe('StudioHeader Runner Controls Interactions (TEST-EDT-04)', () => {
    it('clicking Play button triggers onQuickPlay callback', () => {
      const handleQuickPlay = vi.fn();
      render(
        <StudioHeader
          {...({
            projectTitle: 'Interactive VN',
            onQuickPlay: handleQuickPlay,
          } as ExtendedStudioHeaderProps)}
        />
      );

      const playBtn = screen.getByTestId('btn-header-play');
      fireEvent.click(playBtn);

      expect(handleQuickPlay).toHaveBeenCalledTimes(1);
    });

    it('clicking Run from Cursor button triggers onRunFromCursor callback', () => {
      const handleRunFromCursor = vi.fn();
      render(
        <StudioHeader
          {...({
            projectTitle: 'Interactive VN',
            onRunFromCursor: handleRunFromCursor,
          } as ExtendedStudioHeaderProps)}
        />
      );

      const runCursorBtn = screen.getByTestId('btn-header-run-cursor');
      fireEvent.click(runCursorBtn);

      expect(handleRunFromCursor).toHaveBeenCalledTimes(1);
    });

    it('selecting a scene from dropdown triggers onSelectScene callback with selected value', () => {
      const handleSelectScene = vi.fn();
      const scenes = ['prologue.vns', 'chapter1.vns', 'chapter2.vns'];

      render(
        <StudioHeader
          {...({
            projectTitle: 'Interactive VN',
            scenes,
            selectedScene: 'prologue.vns',
            onSelectScene: handleSelectScene,
          } as ExtendedStudioHeaderProps)}
        />
      );

      const sceneSelect = screen.getByTestId('select-header-scene');
      fireEvent.change(sceneSelect, { target: { value: 'chapter2.vns' } });

      expect(handleSelectScene).toHaveBeenCalledTimes(1);
      expect(handleSelectScene).toHaveBeenCalledWith('chapter2.vns');
    });

    it('does not crash when runner buttons or select are clicked without callbacks provided', () => {
      render(
        <StudioHeader
          {...({
            projectTitle: 'No Callbacks VN',
            scenes: ['scene1.vns', 'scene2.vns'],
            selectedScene: 'scene1.vns',
          } as ExtendedStudioHeaderProps)}
        />
      );

      const playBtn = screen.getByTestId('btn-header-play');
      const runCursorBtn = screen.getByTestId('btn-header-run-cursor');
      const sceneSelect = screen.getByTestId('select-header-scene');

      expect(() => {
        fireEvent.click(playBtn);
        fireEvent.click(runCursorBtn);
        fireEvent.change(sceneSelect, { target: { value: 'scene2.vns' } });
      }).not.toThrow();
    });
  });
});

