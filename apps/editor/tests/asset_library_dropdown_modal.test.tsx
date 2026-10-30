// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import { AssetLibraryPane } from '../src/components/studio/AssetLibraryPane';

const mockAssets: AssetRef[] = [
  {
    id: 'ast-bg-school',
    name: 'bg_school.png',
    type: 'image',
    category: 'background',
    storageUrl: 'blob:bg-school',
    sizeBytes: 1024,
  },
  {
    id: 'ast-char-alice',
    name: 'alice_smile.png',
    type: 'image',
    category: 'sprite',
    storageUrl: 'blob:alice-smile',
    sizeBytes: 2048,
  },
  {
    id: 'ast-bgm-daily',
    name: 'daily_life.mp3',
    type: 'audio',
    category: 'bgm',
    storageUrl: 'blob:daily-life',
    sizeBytes: 4096,
  },
  {
    id: 'ast-sfx-bell',
    name: 'school_bell.wav',
    type: 'audio',
    category: 'sfx',
    storageUrl: 'blob:school-bell',
    sizeBytes: 512,
  },
];

const mockProject: Project = {
  id: 'test-dropdown-proj',
  title: 'Test Dropdown VN',
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

describe('AssetLibraryPane: Category Dropdown & Direct Modal Creation', () => {
  it('TC-ASSET-DROP-01: renders category dropdown with all options', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    const categorySelect = screen.getByTestId('select-asset-category-filter');
    expect(categorySelect).toBeInTheDocument();
    expect(categorySelect.tagName.toLowerCase()).toBe('select');

    // Verify key option values exist
    const options = Array.from((categorySelect as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain('all');
    expect(options).toContain('backgrounds');
    expect(options).toContain('sprites');
    expect(options).toContain('bgm');
    expect(options).toContain('sfx');
    expect(options).toContain('voice');
    expect(options).toContain('ui');
    expect(options).toContain('other');
  });

  it('TC-ASSET-DROP-02: changing category dropdown filters the asset list', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    const categorySelect = screen.getByTestId('select-asset-category-filter');

    // Switch to BGM
    fireEvent.change(categorySelect, { target: { value: 'bgm' } });

    expect(screen.getByText('daily_life.mp3')).toBeInTheDocument();
    expect(screen.queryByText('bg_school.png')).not.toBeInTheDocument();
    expect(screen.queryByText('alice_smile.png')).not.toBeInTheDocument();
    expect(screen.queryByText('school_bell.wav')).not.toBeInTheDocument();
  });

  it('TC-ASSET-MODAL-01: clicking "Add Asset" button opens CreateAssetModal directly without triggering file dialog', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    // Modal should not be open initially
    expect(screen.queryByText('Thêm Tài Nguyên Mới')).not.toBeInTheDocument();

    const addBtn = screen.getByTestId('btn-add-asset');
    fireEvent.click(addBtn);

    // Modal should now be visible
    expect(screen.getByText('Thêm Tài Nguyên Mới')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-asset')).toBeInTheDocument();
  });

  it('TC-ASSET-MODAL-02: clicking "Add Asset" when category is "sprites" prefills category to sprite in modal', () => {
    render(
      <AssetLibraryPane
        project={mockProject}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    const categorySelect = screen.getByTestId('select-asset-category-filter');
    fireEvent.change(categorySelect, { target: { value: 'sprites' } });

    const addBtn = screen.getByTestId('btn-add-asset');
    fireEvent.click(addBtn);

    expect(screen.getByText('Thêm Tài Nguyên Mới')).toBeInTheDocument();
    // In modal, the select category should have value 'sprite'
    const modalCategorySelect = screen.getByTestId('select-asset-category') as HTMLSelectElement;
    expect(modalCategorySelect.value).toBe('sprite');
  });
});
