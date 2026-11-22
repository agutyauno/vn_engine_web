// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import { ProjectSettingsModal } from '../../src/components/studio/ProjectSettingsModal';

const mockAssets: AssetRef[] = [
  {
    id: 'img_logo',
    name: 'logo_game.png',
    type: 'image',
    category: 'ui',
    storageUrl: 'https://cdn.example.com/logo_game.png',
    sizeBytes: 10240,
  },
  {
    id: 'img_bg',
    name: 'bg_title.png',
    type: 'image',
    category: 'background',
    storageUrl: 'https://cdn.example.com/bg_title.png',
    sizeBytes: 204800,
  },
  {
    id: 'img_other',
    name: 'sprite_chara.png',
    type: 'image',
    category: 'sprite',
    storageUrl: 'https://cdn.example.com/sprite_chara.png',
    sizeBytes: 51200,
  },
  {
    id: 'aud_theme',
    name: 'theme.mp3',
    type: 'audio',
    category: 'bgm',
    storageUrl: 'https://cdn.example.com/theme.mp3',
    sizeBytes: 307200,
  },
  {
    id: 'aud_sfx',
    name: 'click.wav',
    type: 'audio',
    category: 'sfx',
    storageUrl: 'https://cdn.example.com/click.wav',
    sizeBytes: 4096,
  },
  {
    id: 'font_main',
    name: 'roboto.ttf',
    type: 'font',
    category: 'other',
    storageUrl: 'https://cdn.example.com/roboto.ttf',
    sizeBytes: 81920,
  },
];

const createTestProject = (overrides?: Partial<Project>): Project => {
  const base: Project = {
    id: 'proj-branding-test',
    title: 'My Visual Novel Title',
    description: 'A test visual novel for branding settings.',
    version: 1,
    ownerId: 'user-branding-tester',
    defaultLanguage: 'vi',
    entryScene: 'main.vns',
    updatedAt: 1700000000000,
    assets: mockAssets,
    variables: [],
    uiScreens: [],
    customScripts: [],
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
    gameplaySettings: {
      unmetChoiceDisplay: 'hidden',
      textSpeed: 30,
      autoForwardDelay: 2,
      defaultVolumes: {
        master: 100,
        bgm: 80,
        sfx: 100,
        voice: 100,
      },
    },
    editorSettings: {
      autoSave: true,
      autoSaveDebounceMs: 1000,
    },
    files: [
      {
        id: 'file-1',
        name: 'main.vns',
        content: 'scene "bg_title.png"\n"Narrator" "Welcome"\n',
        order: 0,
        version: 1,
      },
    ],
  };

  return { ...base, ...overrides };
};

describe('Phase E2: ProjectSettingsModal Branding Tab (TDD RED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Contract 1: Có tab data-testid="tab-settings-branding" (text 'Branding'); 4 tab cũ vẫn còn.
  it('renders "Branding" tab and keeps 4 existing tabs in sidebar', () => {
    render(
      <ProjectSettingsModal
        isOpen={true}
        project={createTestProject()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const brandingTab = screen.getByTestId('tab-settings-branding');
    expect(brandingTab).toBeInTheDocument();
    expect(brandingTab).toHaveTextContent('Branding');

    expect(screen.getByTestId('tab-settings-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-settings-display')).toBeInTheDocument();
    expect(screen.getByTestId('tab-settings-editor')).toBeInTheDocument();
    expect(screen.getByTestId('tab-settings-gameplay')).toBeInTheDocument();
  });

  // Contract 2: Click tab -> panel data-testid="settings-panel-branding" chứa đúng 3 AssetPickerField
  // theo thứ tự với label 'Logo', 'Background', 'Title Music' bọc trong data-testid tương ứng.
  it('opens settings-panel-branding with 3 AssetPickerFields in strict order when tab is clicked', () => {
    render(
      <ProjectSettingsModal
        isOpen={true}
        project={createTestProject()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const panel = screen.getByTestId('settings-panel-branding');
    expect(panel).toBeInTheDocument();

    const logoField = screen.getByTestId('branding-field-logo');
    const bgField = screen.getByTestId('branding-field-background');
    const bgmField = screen.getByTestId('branding-field-bgm');

    expect(within(logoField).getByText('Logo')).toBeInTheDocument();
    expect(within(bgField).getByText('Background')).toBeInTheDocument();
    expect(within(bgmField).getByText('Title Music')).toBeInTheDocument();

    expect(within(logoField).getByTestId('asset-picker-select')).toBeInTheDocument();
    expect(within(bgField).getByTestId('asset-picker-select')).toBeInTheDocument();
    expect(within(bgmField).getByTestId('asset-picker-select')).toBeInTheDocument();

    const fieldWrappers = panel.querySelectorAll('[data-testid^="branding-field-"]');
    expect(fieldWrappers).toHaveLength(3);
    expect(fieldWrappers[0]).toHaveAttribute('data-testid', 'branding-field-logo');
    expect(fieldWrappers[1]).toHaveAttribute('data-testid', 'branding-field-background');
    expect(fieldWrappers[2]).toHaveAttribute('data-testid', 'branding-field-bgm');
  });

  // Contract 3: Picker Logo và Background chỉ liệt kê asset type: 'image'; Title Music chỉ liệt kê type: 'audio'
  it('filters assets by type: image for Logo & Background, audio for Title Music', () => {
    render(
      <ProjectSettingsModal
        isOpen={true}
        project={createTestProject()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    // 1. Logo picker: accept 'image'
    const logoWrapper = screen.getByTestId('branding-field-logo');
    fireEvent.click(within(logoWrapper).getByTestId('asset-picker-select'));

    expect(screen.getByTestId('asset-selector-modal')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_logo')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_bg')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_other')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-aud_theme')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-aud_sfx')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-font_main')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('asset-selector-close'));
    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();

    // 2. Background picker: accept 'image'
    const bgWrapper = screen.getByTestId('branding-field-background');
    fireEvent.click(within(bgWrapper).getByTestId('asset-picker-select'));

    expect(screen.getByTestId('asset-selector-modal')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_logo')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_bg')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-img_other')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-aud_theme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('asset-selector-close'));
    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();

    // 3. Title Music picker: accept 'audio'
    const bgmWrapper = screen.getByTestId('branding-field-bgm');
    fireEvent.click(within(bgmWrapper).getByTestId('asset-picker-select'));

    expect(screen.getByTestId('asset-selector-modal')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-aud_theme')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-aud_sfx')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-img_logo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-img_bg')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-font_main')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('asset-selector-close'));
    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();
  });

  // Contract 4: Chọn logo (asset id 'img_logo') rồi bấm nút Save -> onSave được gọi với project có
  // titleSettings.logoAssetId === 'img_logo' và các field khác giữ nguyên.
  it('selects logo asset and invokes onSave with updated titleSettings while preserving other fields', () => {
    const handleSave = vi.fn();
    const initialProject = createTestProject();

    render(
      <ProjectSettingsModal
        isOpen={true}
        project={initialProject}
        onClose={vi.fn()}
        onSave={handleSave}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const logoWrapper = screen.getByTestId('branding-field-logo');
    fireEvent.click(within(logoWrapper).getByTestId('asset-picker-select'));

    fireEvent.click(screen.getByTestId('asset-option-img_logo'));

    fireEvent.click(screen.getByTestId('btn-save-settings'));

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedProject: Project = handleSave.mock.calls[0]![0];
    expect(savedProject.titleSettings?.logoAssetId).toBe('img_logo');
    expect(savedProject.title).toBe(initialProject.title);
    expect(savedProject.displaySettings).toEqual(initialProject.displaySettings);
    expect(savedProject.gameplaySettings).toEqual(initialProject.gameplaySettings);
    expect(savedProject.editorSettings).toEqual(initialProject.editorSettings);
  });

  // Contract 5: Project ban đầu có titleSettings: { backgroundAssetId: 'img_bg', bgmAssetId: 'aud_theme' }:
  // field Background hiện tên asset 'bg_title.png', Title Music hiện 'theme.mp3'.
  // Bấm Clear của Background rồi Save -> onSave nhận titleSettings KHÔNG có key backgroundAssetId và vẫn còn bgmAssetId.
  it('displays existing assets, removes backgroundAssetId key on clear and keeps other titleSettings on save', () => {
    const handleSave = vi.fn();
    const projectWithSettings = createTestProject({
      titleSettings: {
        backgroundAssetId: 'img_bg',
        bgmAssetId: 'aud_theme',
      },
    });

    render(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithSettings}
        onClose={vi.fn()}
        onSave={handleSave}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const bgWrapper = screen.getByTestId('branding-field-background');
    const bgmWrapper = screen.getByTestId('branding-field-bgm');

    expect(within(bgWrapper).getByText('bg_title.png')).toBeInTheDocument();
    expect(within(bgmWrapper).getByText('theme.mp3')).toBeInTheDocument();

    const clearBgBtn = within(bgWrapper).getByTestId('asset-picker-clear');
    fireEvent.click(clearBgBtn);

    fireEvent.click(screen.getByTestId('btn-save-settings'));

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedProject: Project = handleSave.mock.calls[0]![0];
    expect(savedProject.titleSettings).toBeDefined();
    expect(savedProject.titleSettings).not.toHaveProperty('backgroundAssetId');
    expect(savedProject.titleSettings?.bgmAssetId).toBe('aud_theme');
  });

  // Contract 6: Project không có titleSettings: cả 3 field hiện 'None'; Save mà không đổi gì ->
  // onSave nhận project KHÔNG có key titleSettings (not.toHaveProperty('titleSettings')).
  it('displays "None" when titleSettings is undefined and saves without adding titleSettings property', () => {
    const handleSave = vi.fn();
    const projectWithoutSettings = createTestProject();

    render(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithoutSettings}
        onClose={vi.fn()}
        onSave={handleSave}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const logoWrapper = screen.getByTestId('branding-field-logo');
    const bgWrapper = screen.getByTestId('branding-field-background');
    const bgmWrapper = screen.getByTestId('branding-field-bgm');

    expect(within(logoWrapper).getByText('None')).toBeInTheDocument();
    expect(within(bgWrapper).getByText('None')).toBeInTheDocument();
    expect(within(bgmWrapper).getByText('None')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('btn-save-settings'));

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedProject: Project = handleSave.mock.calls[0]![0];
    expect(savedProject).not.toHaveProperty('titleSettings');
  });

  // Contract 7: Xem trước: data-testid="branding-title-preview" tồn tại trong panel:
  // - không có logo -> chứa text project.title;
  // - có logo -> chứa <img> với src là storageUrl của logo;
  // - có background -> phần tử preview có inline style background-image chứa storageUrl của background.
  it('renders branding-title-preview with text title, logo img, and background-image style accordingly', () => {
    // 7A: No logo, no background -> renders text project.title, no img, no background-image
    const initialProject = createTestProject({
      title: 'Default Story Title',
    });

    const { rerender } = render(
      <ProjectSettingsModal
        isOpen={true}
        project={initialProject}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const preview = screen.getByTestId('branding-title-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent('Default Story Title');
    expect(within(preview).queryByRole('img')).not.toBeInTheDocument();
    expect(preview.style.backgroundImage).toBe('');

    // 7B: With logo -> preview renders <img> with storageUrl
    const projectWithLogo = createTestProject({
      title: 'Story With Logo',
      titleSettings: {
        logoAssetId: 'img_logo',
      },
    });

    rerender(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithLogo}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const logoImg = within(screen.getByTestId('branding-title-preview')).getByRole('img');
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', 'https://cdn.example.com/logo_game.png');

    // 7C: With background -> preview element has background-image style containing storageUrl
    const projectWithBg = createTestProject({
      title: 'Story With Background',
      titleSettings: {
        backgroundAssetId: 'img_bg',
      },
    });

    rerender(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithBg}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const previewWithBg = screen.getByTestId('branding-title-preview');
    expect(previewWithBg.style.backgroundImage).toContain('https://cdn.example.com/bg_title.png');
  });

  // Contract 8: titleSettings.logoAssetId trỏ tới asset không tồn tại -> field Logo hiện 'Missing asset',
  // và preview quay về hiện text title.
  it('displays "Missing asset" in logo field and falls back to text title in preview for non-existent asset id', () => {
    const projectWithMissingAsset = createTestProject({
      title: 'Novel with Broken Ref',
      titleSettings: {
        logoAssetId: 'deleted_asset_id_999',
      },
    });

    render(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithMissingAsset}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const logoWrapper = screen.getByTestId('branding-field-logo');
    expect(within(logoWrapper).getByText('Missing asset')).toBeInTheDocument();

    const preview = screen.getByTestId('branding-title-preview');
    expect(preview).toHaveTextContent('Novel with Broken Ref');
    expect(within(preview).queryByRole('img')).not.toBeInTheDocument();
  });

  // Contract 9: Không emoji trong panel; mọi button trong panel có text hoặc aria-label.
  it('satisfies Rule 8 hygiene: zero OS emojis and all buttons accessible in branding panel', () => {
    const projectWithFullBranding = createTestProject({
      titleSettings: {
        logoAssetId: 'img_logo',
        backgroundAssetId: 'img_bg',
        bgmAssetId: 'aud_theme',
      },
    });

    render(
      <ProjectSettingsModal
        isOpen={true}
        project={projectWithFullBranding}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-settings-branding'));

    const panel = screen.getByTestId('settings-panel-branding');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(panel.textContent).not.toMatch(emojiRegex);

    const buttons = panel.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach(button => {
      const text = button.textContent?.trim();
      const ariaLabel = button.getAttribute('aria-label')?.trim();
      const title = button.getAttribute('title')?.trim();
      const hasAccessibleName = Boolean(text || ariaLabel || title);
      expect(hasAccessibleName).toBe(true);
    });
  });
});
