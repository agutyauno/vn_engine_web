// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { AssetRef, Project } from '@vn-engine/shared-types';
import { AssetLibraryPane } from '../../src/components/studio/AssetLibraryPane';
import { useEditorUIStore } from '../../src/core/stores/uiStore';
import { setupTestStore } from '../testStoreHelpers';

describe('Phase 3: AssetLibraryPane Enhanced (Grid/List, Filter/Sort & Sticky Audio Player)', () => {
  const mockAssets: AssetRef[] = [
    {
      id: 'asset-bg-forest',
      name: 'bg_forest.png',
      type: 'image',
      category: 'background',
      storageUrl: 'https://cdn.example.com/bg_forest.png',
      sizeBytes: 5000,
    },
    {
      id: 'asset-bg-town',
      name: 'bg_town.png',
      type: 'image',
      category: 'background',
      storageUrl: 'https://cdn.example.com/bg_town.png',
      sizeBytes: 10000,
    },
    {
      id: 'asset-sprite-alice',
      name: 'char_alice_smile.png',
      type: 'image',
      category: 'sprite',
      storageUrl: 'https://cdn.example.com/char_alice_smile.png',
      sizeBytes: 2000,
    },
    {
      id: 'asset-bgm-theme',
      name: 'theme_epic.mp3',
      type: 'audio',
      category: 'bgm',
      storageUrl: 'https://cdn.example.com/theme_epic.mp3',
      sizeBytes: 20000,
    },
    {
      id: 'asset-sfx-click',
      name: 'ui_click.ogg',
      type: 'audio',
      category: 'sfx',
      storageUrl: 'https://cdn.example.com/ui_click.ogg',
      sizeBytes: 1000,
    },
  ];

  // Project with a script referencing bg_forest and char_alice_smile
  // Unused assets: bg_town.png, theme_epic.mp3, ui_click.ogg
  const mockProject: Project = {
    id: 'proj-1',
    title: 'Test Visual Novel',
    createdAt: 1000,
    updatedAt: 2000,
    version: '1.0.0',
    assets: mockAssets,
    characters: [],
    scenes: [],
    variables: [],
    files: [
      {
        id: 'main-vns',
        name: 'main.vns',
        path: 'main.vns',
        content: 'background bg_forest\nshow char_alice_smile\n"Hello world"',
        isEntry: true,
      },
    ],
  };

  const defaultProps = {
    project: mockProject,
    onAddAsset: vi.fn(),
    onUpdateAsset: vi.fn(),
    onReplaceAsset: vi.fn(),
    onDeleteAsset: vi.fn(),
    onInsertSnippet: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    setupTestStore();
    vi.useFakeTimers();

    // Mock HTMLMediaElement play and pause
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('TC-ASSET-VIEW-01: toggles between list view and grid view', () => {
    render(<AssetLibraryPane {...defaultProps} />);

    // Default view mode is 'list'
    const btnGrid = screen.getByRole('button', { name: /grid view/i });
    const btnList = screen.getByRole('button', { name: /list view/i });
    expect(btnGrid).toBeInTheDocument();
    expect(btnList).toBeInTheDocument();

    const assetContainer = screen.getByTestId('asset-list-container');
    expect(assetContainer).toHaveAttribute('data-view-mode', 'list');

    // Toggle to grid view
    fireEvent.click(btnGrid);
    expect(useEditorUIStore.getState().assetViewMode).toBe('grid');
    expect(assetContainer).toHaveAttribute('data-view-mode', 'grid');

    // Toggle back to list view
    fireEvent.click(btnList);
    expect(useEditorUIStore.getState().assetViewMode).toBe('list');
    expect(assetContainer).toHaveAttribute('data-view-mode', 'list');
  });

  it('TC-ASSET-FILTER-01: filters assets by status (all, in_use, unused)', () => {
    render(<AssetLibraryPane {...defaultProps} />);

    const filterSelect = screen.getByTestId('select-status-filter') as HTMLSelectElement;
    expect(filterSelect.value).toBe('all');

    // In 'all', all 5 assets are present
    expect(screen.getByTestId('asset-item-asset-bg-forest')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-bg-town')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-sprite-alice')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-bgm-theme')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-sfx-click')).toBeInTheDocument();

    // Filter by 'in_use': only bg_forest and char_alice_smile are in use
    fireEvent.change(filterSelect, { target: { value: 'in_use' } });
    expect(screen.getByTestId('asset-item-asset-bg-forest')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-sprite-alice')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-item-asset-bg-town')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-item-asset-bgm-theme')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-item-asset-sfx-click')).not.toBeInTheDocument();

    // Filter by 'unused': bg_town, theme_epic, ui_click are unused
    fireEvent.change(filterSelect, { target: { value: 'unused' } });
    expect(screen.queryByTestId('asset-item-asset-bg-forest')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-item-asset-sprite-alice')).not.toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-bg-town')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-bgm-theme')).toBeInTheDocument();
    expect(screen.getByTestId('asset-item-asset-sfx-click')).toBeInTheDocument();
  });

  it('TC-ASSET-SORT-01: sorts assets by name and sizeBytes', () => {
    render(<AssetLibraryPane {...defaultProps} />);

    const sortSelect = screen.getByTestId('select-sort-by') as HTMLSelectElement;
    expect(sortSelect.value).toBe('name_asc');

    // Sort by size_desc (largest first)
    fireEvent.change(sortSelect, { target: { value: 'size_desc' } });
    let items = screen.getAllByTestId(/^asset-item-/);
    // theme_epic (20000) -> bg_town (10000) -> bg_forest (5000) -> char_alice_smile (2000) -> ui_click (1000)
    expect(items[0]).toHaveAttribute('data-testid', 'asset-item-asset-bgm-theme');
    expect(items[1]).toHaveAttribute('data-testid', 'asset-item-asset-bg-town');
    expect(items[4]).toHaveAttribute('data-testid', 'asset-item-asset-sfx-click');

    // Sort by size_asc (smallest first)
    fireEvent.change(sortSelect, { target: { value: 'size_asc' } });
    items = screen.getAllByTestId(/^asset-item-/);
    expect(items[0]).toHaveAttribute('data-testid', 'asset-item-asset-sfx-click');
    expect(items[4]).toHaveAttribute('data-testid', 'asset-item-asset-bgm-theme');
  });

  it('TC-ASSET-PLAYER-01: auditions audio asset via sticky audio player and closes cleanly', () => {
    render(<AssetLibraryPane {...defaultProps} />);

    // Click audition button on theme_epic
    const btnAuditionTheme = screen.getByTestId('btn-audition-asset-asset-bgm-theme');
    fireEvent.click(btnAuditionTheme);

    // Sticky audio player appears at the bottom
    const player = screen.getByTestId('sticky-audio-player');
    expect(player).toBeInTheDocument();
    expect(screen.getByTestId('sticky-player-track-name')).toHaveTextContent('theme_epic.mp3');

    // Close audio player
    const btnClose = screen.getByTestId('btn-sticky-player-close');
    fireEvent.click(btnClose);
    expect(screen.queryByTestId('sticky-audio-player')).not.toBeInTheDocument();
  });

  it('TC-ASSET-DRAG-01: sets correct text/plain drag snippet for different asset categories', () => {
    render(<AssetLibraryPane {...defaultProps} />);

    // Drag background asset -> `background bg_forest\n`
    const bgForestItem = screen.getByTestId('asset-item-asset-bg-forest');
    const bgDataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(bgForestItem, { dataTransfer: bgDataTransfer });
    expect(bgDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'background bg_forest\n');

    // Drag sprite asset -> `show char_alice_smile\n`
    const spriteItem = screen.getByTestId('asset-item-asset-sprite-alice');
    const spriteDataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(spriteItem, { dataTransfer: spriteDataTransfer });
    expect(spriteDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'show char_alice_smile\n');

    // Drag bgm asset -> `play music "theme_epic.mp3"\n`
    const bgmItem = screen.getByTestId('asset-item-asset-bgm-theme');
    const bgmDataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(bgmItem, { dataTransfer: bgmDataTransfer });
    expect(bgmDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'play music "theme_epic.mp3"\n');
  });

  it('TC-ASSET-COPY-01: copies asset DSL snippet with in-place CheckIcon feedback for 1500ms', () => {
    const originalClipboard = navigator.clipboard;
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<AssetLibraryPane {...defaultProps} />);

    const btnCopyBg = screen.getByTestId('btn-copy-asset-asset-bg-forest');
    expect(btnCopyBg).toHaveAttribute('title', 'Copy DSL snippet');

    fireEvent.click(btnCopyBg);
    expect(writeTextMock).toHaveBeenCalledWith('background bg_forest');
    expect(btnCopyBg).toHaveAttribute('data-copied', 'true');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(btnCopyBg).toHaveAttribute('data-copied', 'false');

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('TC-ASSET-INSERT-01: calls onInsertSnippet when insert button is clicked', () => {
    const onInsertSnippetMock = vi.fn();
    render(<AssetLibraryPane {...defaultProps} onInsertSnippet={onInsertSnippetMock} />);

    const btnInsertBg = screen.getByTestId('btn-insert-asset-asset-bg-forest');
    fireEvent.click(btnInsertBg);
    expect(onInsertSnippetMock).toHaveBeenCalledWith('background bg_forest');

    const btnInsertBgm = screen.getByTestId('btn-insert-asset-asset-bgm-theme');
    fireEvent.click(btnInsertBgm);
    expect(onInsertSnippetMock).toHaveBeenCalledWith('play music "theme_epic.mp3"');
  });
});
