// apps/editor/tests/asset_modal.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  validateAssetFile,
  slugifyAssetId,
} from '../src/core/utils/assetValidation';
import { CreateAssetModal } from '../src/components/studio/CreateAssetModal';
import type { AssetRef } from '@vn-engine/shared-types';

describe('Asset File Whitelist Validation & ID Slugification', () => {
  // TC-ASSET-01: Chấp nhận các định dạng ảnh hợp lệ
  it('TC-ASSET-01: should validate and accept whitelisted image file formats (.png, .jpg, .jpeg, .webp, .avif, .svg)', () => {
    const validImages = [
      { name: 'bg_room.png', type: 'image/png' },
      { name: 'cg_scene.jpg', type: 'image/jpeg' },
      { name: 'cg_scene.jpeg', type: 'image/jpeg' },
      { name: 'sprite_alice.webp', type: 'image/webp' },
      { name: 'bg_night.avif', type: 'image/avif' },
      { name: 'icon_item.svg', type: 'image/svg+xml' },
    ];

    for (const img of validImages) {
      const file = new File(['mock content'], img.name, { type: img.type });
      const result = validateAssetFile(file);
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image');
      expect(result.error).toBeUndefined();
    }
  });

  // TC-ASSET-02: Chấp nhận các định dạng âm thanh hợp lệ
  it('TC-ASSET-02: should validate and accept whitelisted audio file formats (.mp3, .wav, .ogg, .m4a, .aac, .flac)', () => {
    const validAudios = [
      { name: 'bgm_main.mp3', type: 'audio/mpeg' },
      { name: 'sfx_click.wav', type: 'audio/wav' },
      { name: 'bgm_battle.ogg', type: 'audio/ogg' },
      { name: 'voice_ch1.m4a', type: 'audio/mp4' },
      { name: 'voice_ch2.aac', type: 'audio/aac' },
      { name: 'bgm_flac.flac', type: 'audio/flac' },
    ];

    for (const audio of validAudios) {
      const file = new File(['mock content'], audio.name, { type: audio.type });
      const result = validateAssetFile(file);
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('audio');
      expect(result.error).toBeUndefined();
    }
  });

  // TC-ASSET-03: Từ chối các định dạng không được phép (.exe, .zip, .pdf)
  it('TC-ASSET-03: should reject unsupported file formats (.exe, .zip, .pdf) with explicit error', () => {
    const invalidFiles = [
      { name: 'danger.exe', type: 'application/x-msdownload' },
      { name: 'bundle.zip', type: 'application/zip' },
      { name: 'manual.pdf', type: 'application/pdf' },
      { name: 'script.js', type: 'text/javascript' },
    ];

    for (const inv of invalidFiles) {
      const file = new File(['malicious'], inv.name, { type: inv.type });
      const result = validateAssetFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/không được hỗ trợ|unsupported|invalid/i);
    }
  });

  // TC-ASSET-04: Tự động sinh ID slug hợp lệ chuẩn VNS identifier từ tên file
  it('TC-ASSET-04: should slugify filenames into valid VNS identifiers (e.g. "School Rooftop (Evening).png" -> "school_rooftop_evening")', () => {
    expect(slugifyAssetId('School Rooftop (Evening).png')).toBe('school_rooftop_evening');
    expect(slugifyAssetId('bg-forest-01.jpg')).toBe('bg_forest_01');
    expect(slugifyAssetId('BGM - Theme 01.mp3')).toBe('bgm_theme_01');
    expect(slugifyAssetId('123 Intro.png')).toBe('_123_intro'); // Must not start with digit

    const vnsIdentifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    expect(vnsIdentifierRegex.test(slugifyAssetId('School Rooftop (Evening).png'))).toBe(true);
    expect(vnsIdentifierRegex.test(slugifyAssetId('123 Intro.png'))).toBe(true);
  });
});

describe('CreateAssetModal Component', () => {
  const mockImageFile = new File(['image-data'], 'School Rooftop (Evening).png', {
    type: 'image/png',
  });

  // TC-ASSET-05: CreateAssetModal cảnh báo lỗi nếu Asset ID bị trùng với existingAssetIds
  it('TC-ASSET-05: should warn and prevent saving if Asset ID already exists in existingAssetIds', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateAssetModal
        isOpen={true}
        initialFile={mockImageFile}
        existingAssetIds={['school_rooftop_evening', 'bg_classroom']}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const errorBadge = await screen.findByTestId('asset-id-duplicate-error');
    expect(errorBadge).toBeInTheDocument();
    expect(errorBadge.textContent).toMatch(/đã tồn tại|already exists|trùng/i);

    const saveBtn = screen.getByTestId('btn-save-asset');
    expect(saveBtn).toBeDisabled();

    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  // TC-ASSET-06: Render preview ảnh với nền checkerboard và cho phép click-to-zoom
  it('TC-ASSET-06: should render preview with checkerboard background and allow click-to-zoom (lightbox)', async () => {
    render(
      <CreateAssetModal
        isOpen={true}
        initialFile={mockImageFile}
        existingAssetIds={[]}
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    const previewContainer = screen.getByTestId('asset-preview-container');
    expect(previewContainer).toBeInTheDocument();
    expect(
      previewContainer.className.includes('checkerboard') ||
      previewContainer.getAttribute('style')?.includes('url') ||
      previewContainer.className.includes('bg-')
    ).toBe(true);

    const previewImage = screen.getByTestId('asset-preview-image');
    expect(previewImage).toBeInTheDocument();

    fireEvent.click(previewImage);
    const lightboxOverlay = await screen.findByTestId('asset-lightbox-overlay');
    expect(lightboxOverlay).toBeInTheDocument();
  });

  // TC-ASSET-07: Khi điền form hợp lệ và submit, gọi callback onSave với AssetRef và Blob
  it('TC-ASSET-07: should invoke onSave callback with valid AssetRef and Blob when form is submitted', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateAssetModal
        isOpen={true}
        initialFile={mockImageFile}
        existingAssetIds={['other_asset']}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const idInput = screen.getByTestId('input-asset-id');
    const categorySelect = screen.getByTestId('select-asset-category');

    expect((idInput as HTMLInputElement).value).toBe('school_rooftop_evening');

    fireEvent.change(categorySelect, { target: { value: 'background' } });

    const saveBtn = screen.getByTestId('btn-save-asset');
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const [savedAsset, savedBlob] = onSave.mock.calls[0] as [AssetRef, Blob];
    expect(savedAsset.id).toBe('school_rooftop_evening');
    expect(savedAsset.name).toBe('School Rooftop (Evening).png');
    expect(savedAsset.type).toBe('image');
    expect(savedAsset.category).toBe('background');
    expect(savedBlob).toBeInstanceOf(Blob);
  });
});
