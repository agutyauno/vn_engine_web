// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import { AssetLibraryPane } from '../src/components/studio/AssetLibraryPane';

const mockAssets: AssetRef[] = [
  {
    id: 'ast-bg-park',
    name: 'bg_park.png',
    type: 'image',
    category: 'background',
    storageUrl: 'blob:bg-park',
    sizeBytes: 1024,
  },
  {
    id: 'ast-char-alice',
    name: 'alice_normal.png',
    type: 'image',
    category: 'sprite',
    storageUrl: 'blob:alice-normal',
    sizeBytes: 2048,
  },
  {
    id: 'ast-char-fallback',
    name: 'char_bob.png',
    type: 'image',
    storageUrl: 'blob:char-bob',
    sizeBytes: 2048,
  },
  {
    id: 'ast-bgm-theme',
    name: 'theme_opening.mp3',
    type: 'audio',
    category: 'bgm',
    storageUrl: 'blob:bgm-theme',
    sizeBytes: 4096,
  },
  {
    id: 'ast-bgm-fallback',
    name: 'bgm_battle.ogg',
    type: 'audio',
    storageUrl: 'blob:bgm-battle',
    sizeBytes: 4096,
  },
  {
    id: 'ast-sfx-click',
    name: 'click.wav',
    type: 'audio',
    category: 'sfx',
    storageUrl: 'blob:sfx-click',
    sizeBytes: 512,
  },
  {
    id: 'ast-voice-01',
    name: 'voice_ch1_01.mp3',
    type: 'audio',
    category: 'voice',
    storageUrl: 'blob:voice-01',
    sizeBytes: 1024,
  },
  {
    id: 'ast-ui-button',
    name: 'btn_start.png',
    type: 'image',
    category: 'ui',
    storageUrl: 'blob:btn-start',
    sizeBytes: 512,
  },
  {
    id: 'ast-misc-font',
    name: 'custom_font.ttf',
    type: 'font' as any,
    category: 'other',
    storageUrl: 'blob:custom-font',
    sizeBytes: 8192,
  },
];

const mockProject: Project = {
  id: 'test-tabs-proj',
  title: 'Test Tabs VN',
  version: 1,
  ownerId: 'owner-1',
  defaultLanguage: 'vi',
  files: [],
  characters: [],
  variables: [],
  assets: mockAssets,
  uiScreens: [],
  customScripts: [],
};

describe('AssetLibraryPane: 7 Category Filter Tabs', () => {
  it('TC-CAT-01: renders all 7+ category tab buttons: All, Backgrounds, Sprites, BGM, SFX, Voice, UI, and Other', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    // Verify presence of all category tab elements by testId
    expect(screen.getByTestId('tab-asset-all')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-backgrounds')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-sprites')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-bgm')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-sfx')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-voice')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-ui')).toBeInTheDocument();
    expect(screen.getByTestId('tab-asset-other')).toBeInTheDocument();

    // Verify button label text
    expect(screen.getByTestId('tab-asset-all')).toHaveTextContent(/all/i);
    expect(screen.getByTestId('tab-asset-backgrounds')).toHaveTextContent(/backgrounds/i);
    expect(screen.getByTestId('tab-asset-sprites')).toHaveTextContent(/sprites/i);
    expect(screen.getByTestId('tab-asset-bgm')).toHaveTextContent(/bgm/i);
    expect(screen.getByTestId('tab-asset-sfx')).toHaveTextContent(/sfx/i);
    expect(screen.getByTestId('tab-asset-voice')).toHaveTextContent(/voice/i);
    expect(screen.getByTestId('tab-asset-ui')).toHaveTextContent(/ui/i);
    expect(screen.getByTestId('tab-asset-other')).toHaveTextContent(/other/i);
  });

  it('TC-CAT-02: filters asset list to show only BGM assets when BGM tab is clicked', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    const bgmTab = screen.getByTestId('tab-asset-bgm');
    fireEvent.click(bgmTab);

    // BGM assets (explicit category 'bgm' or prefix 'bgm_') should be visible
    expect(screen.getByText('theme_opening.mp3')).toBeInTheDocument();
    expect(screen.getByText('bgm_battle.ogg')).toBeInTheDocument();

    // Other categories should NOT be visible
    expect(screen.queryByText('click.wav')).not.toBeInTheDocument();
    expect(screen.queryByText('voice_ch1_01.mp3')).not.toBeInTheDocument();
    expect(screen.queryByText('bg_park.png')).not.toBeInTheDocument();
    expect(screen.queryByText('alice_normal.png')).not.toBeInTheDocument();
    expect(screen.queryByText('btn_start.png')).not.toBeInTheDocument();
    expect(screen.queryByText('custom_font.ttf')).not.toBeInTheDocument();
  });

  it('TC-CAT-03: displays all assets when All tab is active', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    const allTab = screen.getByTestId('tab-asset-all');
    fireEvent.click(allTab);

    expect(screen.getByText('bg_park.png')).toBeInTheDocument();
    expect(screen.getByText('alice_normal.png')).toBeInTheDocument();
    expect(screen.getByText('char_bob.png')).toBeInTheDocument();
    expect(screen.getByText('theme_opening.mp3')).toBeInTheDocument();
    expect(screen.getByText('bgm_battle.ogg')).toBeInTheDocument();
    expect(screen.getByText('click.wav')).toBeInTheDocument();
    expect(screen.getByText('voice_ch1_01.mp3')).toBeInTheDocument();
    expect(screen.getByText('btn_start.png')).toBeInTheDocument();
    expect(screen.getByText('custom_font.ttf')).toBeInTheDocument();
  });
});
