// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

interface CapturedDownload {
  href: string;
  download: string;
  blob?: Blob;
}

const sampleProject: Project = {
  id: 'proj-export-flow-test',
  title: 'Export Flow Novel',
  version: 1,
  ownerId: 'user-export-flow',
  defaultLanguage: 'vi',
  updatedAt: 1715000000000,
  assets: [],
  variables: [],
  uiScreens: [],
  customScripts: [],
  displaySettings: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    lockAspectRatio: true,
  },
  files: [
    {
      id: 'f-main',
      name: 'main.vns',
      content: 'scene start {\n  "Narrator" "Game has begun."\n}\n',
      order: 0,
      version: 1,
    },
  ],
};

describe('L3 Integration Tests: StudioWorkspacePage Export Flow', () => {
  let capturedDownloads: CapturedDownload[] = [];
  let blobStorage: Map<string, Blob> = new Map();
  let repo: IndexedDBProjectRepository;

  beforeEach(async () => {
    capturedDownloads = [];
    blobStorage = new Map();

    // jsdom không có URL.createObjectURL/revokeObjectURL, nên gán trực tiếp thay vì spyOn.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((obj: Blob | MediaSource) => {
        const mockUrl = `blob:test-download-${Math.random()}`;
        if (obj instanceof Blob) {
          blobStorage.set(mockUrl, obj);
        }
        return mockUrl;
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const matchingBlob = blobStorage.get(this.href);
      capturedDownloads.push({
        href: this.href,
        download: this.download,
        blob: matchingBlob,
      });
    });

    repo = new IndexedDBProjectRepository(`studio_export_zip_${Date.now()}_${Math.random()}`);
    await repo.updateProject(sampleProject);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a ZIP package ending with _web.zip with type application/zip when target is web', async () => {
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={repo}
        initialProject={sampleProject}
      />,
    );

    // 1. Open Export Wizard modal from StudioHeader
    const exportBtn = screen.getByTestId('btn-header-export');
    fireEvent.click(exportBtn);

    expect(screen.getByTestId('modal-export-wizard')).toBeInTheDocument();

    // 2. Select Web target (default or explicit click)
    const webTargetOption = screen.getByTestId('export-target-web');
    fireEvent.click(webTargetOption);

    // 3. Trigger Download
    const downloadBtn = screen.getByTestId('btn-export-download');
    fireEvent.click(downloadBtn);

    // 4. Await download completion and assert file extension & mime type
    await waitFor(() => {
      expect(capturedDownloads.length).toBeGreaterThan(0);
    });

    const downloadEntry = capturedDownloads[capturedDownloads.length - 1];
    expect(downloadEntry).toBeDefined();
    if (!downloadEntry) throw new Error('Download entry missing');

    expect(downloadEntry.download.endsWith('_web.zip')).toBe(true);
    expect(downloadEntry.blob).toBeDefined();
    expect(downloadEntry.blob?.type).toBe('application/zip');
  });

  it('downloads raw project snapshot ending with _backup.json with type application/json when target is backup', async () => {
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={repo}
        initialProject={sampleProject}
      />,
    );

    // 1. Open Export Wizard modal from StudioHeader
    const exportBtn = screen.getByTestId('btn-header-export');
    fireEvent.click(exportBtn);

    expect(screen.getByTestId('modal-export-wizard')).toBeInTheDocument();

    // 2. Select Backup target
    const backupTargetOption = screen.getByTestId('export-target-backup');
    fireEvent.click(backupTargetOption);

    // 3. Trigger Download
    const downloadBtn = screen.getByTestId('btn-export-download');
    fireEvent.click(downloadBtn);

    // 4. Await download completion and assert file extension & JSON payload
    await waitFor(() => {
      expect(capturedDownloads.length).toBeGreaterThan(0);
    });

    const downloadEntry = capturedDownloads[capturedDownloads.length - 1];
    expect(downloadEntry).toBeDefined();
    if (!downloadEntry) throw new Error('Download entry missing');

    expect(downloadEntry.download.endsWith('_backup.json')).toBe(true);
    expect(downloadEntry.blob).toBeDefined();
    expect(downloadEntry.blob?.type).toBe('application/json');

    if (downloadEntry.blob) {
      const text = await downloadEntry.blob.text();
      const parsed = JSON.parse(text) as Project;
      expect(parsed.id).toBe(sampleProject.id);
      expect(parsed.title).toBe(sampleProject.title);
    }
  });
  it('never downloads a _desktop.json file when the desktop card is clicked (TASK-EXP-DESKTOP)', async () => {
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={repo}
        initialProject={sampleProject}
      />,
    );

    fireEvent.click(screen.getByTestId('btn-header-export'));
    fireEvent.click(screen.getByTestId('export-target-desktop'));
    fireEvent.click(screen.getByTestId('btn-export-download'));

    await waitFor(() => {
      expect(capturedDownloads.length).toBeGreaterThan(0);
    });

    expect(capturedDownloads.some(d => d.download.endsWith('_desktop.json'))).toBe(false);
    expect(capturedDownloads[capturedDownloads.length - 1]?.download.endsWith('_web.zip')).toBe(
      true,
    );
  });
});
