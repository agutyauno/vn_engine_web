// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetCategory } from '@vn-engine/shared-types';
import { AssetLibraryPane } from '../src/components/studio/AssetLibraryPane';

const mockProject: Project = {
  id: 'test-qf-proj',
  title: 'Test QuickFix Project',
  version: 1,
  ownerId: 'owner-1',
  defaultLanguage: 'vi',
  files: [],
  characters: [],
  variables: [],
  assets: [],
  uiScreens: [],
  customScripts: [],
};

describe('Asset QuickFix Pipeline Integration', () => {
  it('TC-QF-01: clicking Create on quickfix-pending-badge opens CreateAssetModal with prefilled assetId and category', () => {
    const quickFixAsset: { id: string; category?: AssetCategory } = {
      id: 'bg_courtyard',
      category: 'background',
    };

    render(
      <AssetLibraryPane
        project={mockProject}
        quickFixAsset={quickFixAsset}
        quickFixAssetName={quickFixAsset.id}
        onAddAsset={vi.fn()}
        onReplaceAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />
    );

    // Verify badge displays the missing asset ID
    const badge = screen.getByTestId('quickfix-pending-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/bg_courtyard/i);

    // Click Create button on the badge
    const createBtn = screen.getByTestId('btn-quickfix-create-asset');
    fireEvent.click(createBtn);

    // Verify CreateAssetModal is opened
    expect(screen.getByText('Thêm Tài Nguyên Mới')).toBeInTheDocument();

    // Verify prefilled ID in input-asset-id
    const idInput = screen.getByTestId('input-asset-id');
    expect((idInput as HTMLInputElement).value).toBe('bg_courtyard');

    // Verify prefilled Category in select-asset-category
    const catSelect = screen.getByTestId('select-asset-category');
    expect((catSelect as HTMLSelectElement).value).toBe('background');
  });
});
