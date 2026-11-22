// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AssetRef } from '@vn-engine/shared-types';
import { AssetSelectorModal } from '../../src/components/studio/AssetSelectorModal';
import { AssetPickerField } from '../../src/components/studio/AssetPickerField';

const mockAssets: AssetRef[] = [
  {
    id: 'asset-img-1',
    name: 'bg_classroom.png',
    type: 'image',
    category: 'background',
    storageUrl: 'https://cdn.example.com/bg_classroom.png',
    sizeBytes: 204800,
  },
  {
    id: 'asset-img-2',
    name: 'logo_title.png',
    type: 'image',
    category: 'ui',
    storageUrl: 'https://cdn.example.com/logo_title.png',
    sizeBytes: 102400,
  },
  {
    id: 'asset-audio-1',
    name: 'bgm_main_theme.mp3',
    type: 'audio',
    category: 'bgm',
    storageUrl: 'https://cdn.example.com/bgm_main_theme.mp3',
    sizeBytes: 2048,
  },
  {
    id: 'asset-font-1',
    name: 'roboto.ttf',
    type: 'font',
    category: 'other',
    storageUrl: 'https://cdn.example.com/roboto.ttf',
    sizeBytes: 51200,
  },
];

describe('Phase E1: AssetSelectorModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-ASM-01: does not render modal when isOpen is false', () => {
    render(
      <AssetSelectorModal
        isOpen={false}
        assets={mockAssets}
        accept="image"
        title="Select Title Asset"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();
  });

  it('TC-ASM-02: renders dialog with aria-modal="true" and displays title when opened', () => {
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Choose Background"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('asset-selector-modal')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Choose Background')).toBeInTheDocument();
  });

  it('TC-ASM-03: lists only assets matching accept prop as buttons or options', () => {
    const isButtonOrOption = (el: HTMLElement): boolean =>
      el.tagName.toLowerCase() === 'button' || el.getAttribute('role') === 'option';

    const { rerender } = render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // accept 'image': exactly 2 image items rendered
    const imgItem1 = screen.getByTestId('asset-option-asset-img-1');
    const imgItem2 = screen.getByTestId('asset-option-asset-img-2');
    expect(imgItem1).toBeInTheDocument();
    expect(imgItem2).toBeInTheDocument();
    expect(isButtonOrOption(imgItem1)).toBe(true);
    expect(isButtonOrOption(imgItem2)).toBe(true);
    expect(screen.queryByTestId('asset-option-asset-audio-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-font-1')).not.toBeInTheDocument();

    // accept 'audio': exactly 1 audio item rendered
    rerender(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="audio"
        title="Select Audio"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const audioItem = screen.getByTestId('asset-option-asset-audio-1');
    expect(audioItem).toBeInTheDocument();
    expect(isButtonOrOption(audioItem)).toBe(true);
    expect(screen.queryByTestId('asset-option-asset-img-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-img-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-font-1')).not.toBeInTheDocument();
  });

  it('TC-ASM-04: renders thumbnail <img> for image and name + formatted size for audio', () => {
    const { rerender } = render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const imgItem = screen.getByTestId('asset-option-asset-img-1');
    const imgTag = imgItem.querySelector('img');
    expect(imgTag).not.toBeNull();
    expect(imgTag?.src).toBe('https://cdn.example.com/bg_classroom.png');
    expect(imgTag?.alt).toContain('bg_classroom.png');

    rerender(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="audio"
        title="Select Audio"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const audioItem = screen.getByTestId('asset-option-asset-audio-1');
    expect(audioItem.querySelector('img')).toBeNull();
    expect(audioItem).toHaveTextContent('bgm_main_theme.mp3');
    expect(audioItem.textContent).toMatch(/2(\.0)? KB/);
  });

  it('TC-ASM-05: filters assets case-insensitively and shows empty state when no match', () => {
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByTestId('asset-selector-search');
    expect(searchInput).toBeInTheDocument();

    // Type 'BG' -> matches 'bg_classroom.png', excludes 'logo_title.png'
    fireEvent.change(searchInput, { target: { value: 'BG' } });
    expect(screen.getByTestId('asset-option-asset-img-1')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-img-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-selector-empty')).not.toBeInTheDocument();

    // Type non-matching query -> displays asset-selector-empty
    fireEvent.change(searchInput, { target: { value: 'not_found_query_xyz' } });
    expect(screen.queryByTestId('asset-option-asset-img-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-img-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('asset-selector-empty')).toBeInTheDocument();
  });

  it('TC-ASM-06: shows asset-selector-empty initially when asset list has no matching assets', () => {
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={[]}
        accept="image"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('asset-selector-empty')).toBeInTheDocument();
  });

  it('TC-ASM-07: calls onSelect with full AssetRef object when an item is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Image"
        onSelect={handleSelect}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('asset-option-asset-img-1'));
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(mockAssets[0]);
  });

  it('TC-ASM-08: marks item matching selectedId with aria-selected="true" and others "false"', () => {
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        selectedId="asset-img-1"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('asset-option-asset-img-1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('asset-option-asset-img-2')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('TC-ASM-09: handles modal close via button, Escape key, and backdrop click', () => {
    const handleClose = vi.fn();
    render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Image"
        onSelect={vi.fn()}
        onClose={handleClose}
      />,
    );

    // 1. Close button with aria-label
    const closeBtn = screen.getByTestId('asset-selector-close');
    expect(closeBtn).toHaveAttribute('aria-label');
    expect(closeBtn.getAttribute('aria-label')).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // 2. Escape key
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);

    // 3. Backdrop click
    const backdrop = screen.getByTestId('asset-selector-modal');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(3);

    // 4. Content click inside dialog does NOT trigger onClose
    const searchInput = screen.getByTestId('asset-selector-search');
    fireEvent.click(searchInput);
    expect(handleClose).toHaveBeenCalledTimes(3);

    const dialog = screen.getByRole('dialog');
    if (dialog !== backdrop) {
      fireEvent.click(dialog);
      expect(handleClose).toHaveBeenCalledTimes(3);
    }
  });
});

describe('Phase E1: AssetPickerField Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-APF-01: renders the field label', () => {
    render(
      <AssetPickerField
        label="Title Background"
        accept="image"
        assets={mockAssets}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Title Background')).toBeInTheDocument();
  });

  it('TC-APF-02: displays "None" and no clear button when value is undefined', () => {
    render(
      <AssetPickerField
        label="Background"
        accept="image"
        assets={mockAssets}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-picker-clear')).not.toBeInTheDocument();
  });

  it('TC-APF-03: displays thumbnail and name for image asset, with working Clear button', () => {
    const handleChange = vi.fn();
    render(
      <AssetPickerField
        label="Logo"
        accept="image"
        assets={mockAssets}
        value="asset-img-2"
        onChange={handleChange}
      />,
    );

    expect(screen.getByText('logo_title.png')).toBeInTheDocument();
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/logo_title.png');

    const clearBtn = screen.getByTestId('asset-picker-clear');
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveAttribute('aria-label');
    expect(clearBtn.getAttribute('aria-label')).toBeTruthy();

    fireEvent.click(clearBtn);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it('TC-APF-04: displays "Missing asset" and Clear button when value does not exist', () => {
    const handleChange = vi.fn();
    render(
      <AssetPickerField
        label="Background"
        accept="image"
        assets={mockAssets}
        value="missing-asset-id"
        onChange={handleChange}
      />,
    );

    expect(screen.getByText('Missing asset')).toBeInTheDocument();
    const clearBtn = screen.getByTestId('asset-picker-clear');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it('TC-APF-05: opens AssetSelectorModal via select button and updates value on selection', () => {
    const handleChange = vi.fn();
    render(
      <AssetPickerField
        label="Background"
        accept="image"
        assets={mockAssets}
        value={undefined}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();

    const selectBtn = screen.getByTestId('asset-picker-select');
    fireEvent.click(selectBtn);

    // Modal opens with accept="image"
    expect(screen.getByTestId('asset-selector-modal')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-asset-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('asset-option-asset-img-2')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-option-asset-audio-1')).not.toBeInTheDocument();

    // Select asset-img-1
    fireEvent.click(screen.getByTestId('asset-option-asset-img-1'));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('asset-img-1');
    expect(screen.queryByTestId('asset-selector-modal')).not.toBeInTheDocument();
  });
});

describe('Phase E1: Iconography & Emoji Hygiene Standards', () => {
  it('TC-HYGIENE-01: contains no emojis in rendered textContent and no inline <svg in sources', () => {
    const { container: modalContainer } = render(
      <AssetSelectorModal
        isOpen={true}
        assets={mockAssets}
        accept="image"
        title="Select Asset"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const { container: fieldContainer } = render(
      <AssetPickerField
        label="Background"
        accept="image"
        assets={mockAssets}
        value="asset-img-1"
        onChange={vi.fn()}
      />,
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(modalContainer.textContent).not.toMatch(emojiRegex);
    expect(fieldContainer.textContent).not.toMatch(emojiRegex);

    const modalPath = resolve(__dirname, '../../src/components/studio/AssetSelectorModal.tsx');
    const fieldPath = resolve(__dirname, '../../src/components/studio/AssetPickerField.tsx');

    const modalSource = readFileSync(modalPath, 'utf8');
    const fieldSource = readFileSync(fieldPath, 'utf8');

    expect(modalSource).not.toMatch(/<svg/i);
    expect(fieldSource).not.toMatch(/<svg/i);
  });
});
