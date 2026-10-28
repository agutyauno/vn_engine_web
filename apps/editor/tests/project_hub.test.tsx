// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import { ProjectHubView, getQuotaBadgeInfo } from '../src/components/hub/ProjectHubView';

describe('ProjectHubView (TDD)', () => {
  let repo: IndexedDBProjectRepository;

  beforeEach(async () => {
    // Unique DB name per test to prevent leakage
    repo = new IndexedDBProjectRepository(`test-hub-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('UT-EDT-HUB-01: renders project list and empty state when no projects exist', async () => {
    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    // Initially loading or empty state
    await waitFor(() => {
      expect(screen.getByText(/no projects found/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    expect(screen.getByTestId('input-project-search')).toBeInTheDocument();
  });

  it('UT-EDT-HUB-02: renders created projects and filters via search bar', async () => {
    await repo.createProject({
      title: 'Cyberpunk Adventure',
      description: 'Futuristic story in Neo-Tokyo',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    await repo.createProject({
      title: 'Romance at Sunset',
      description: 'Slice of life romance',
      displaySettings: { width: 1080, height: 1920, orientation: 'portrait', lockAspectRatio: true },
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Adventure')).toBeInTheDocument();
      expect(screen.getByText('Romance at Sunset')).toBeInTheDocument();
    });

    // Filter by 'Cyber'
    const searchInput = screen.getByTestId('input-project-search');
    fireEvent.change(searchInput, { target: { value: 'Cyber' } });

    expect(screen.getByText('Cyberpunk Adventure')).toBeInTheDocument();
    expect(screen.queryByText('Romance at Sunset')).not.toBeInTheDocument();
  });

  it('UT-EDT-HUB-03: creates a new project via NewProjectModal with presets and validation', async () => {
    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    });

    // Click New Project
    fireEvent.click(screen.getByTestId('btn-new-project'));

    // Modal should appear
    expect(screen.getByTestId('modal-new-project')).toBeInTheDocument();

    // Try submit without name -> validation error
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByTestId('error-project-name')).toBeInTheDocument();

    // Fill valid data with Portrait 9:16 preset
    fireEvent.change(screen.getByTestId('input-project-name'), {
      target: { value: 'Mobile Otome Game' },
    });
    fireEvent.change(screen.getByTestId('select-project-aspect'), {
      target: { value: '9:16' },
    });
    fireEvent.change(screen.getByTestId('input-project-desc'), {
      target: { value: 'A mobile portrait visual novel' },
    });

    // Submit
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));

    // Should call onOpenProject with newly created project ID
    await waitFor(() => {
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });

    // Project should now be in repository
    const projects = await repo.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].title).toBe('Mobile Otome Game');
    expect(projects[0].canvasWidth).toBe(1080);
    expect(projects[0].canvasHeight).toBe(1920);
    expect(projects[0].orientation).toBe('portrait');
  });

  it('UT-EDT-HUB-04: duplicates an existing project', async () => {
    const original = await repo.createProject({
      title: 'Original VN',
      description: 'First version',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText('Original VN')).toBeInTheDocument();
    });

    // Click duplicate button
    const dupBtn = screen.getByTestId(`btn-duplicate-project-${original.id}`);
    fireEvent.click(dupBtn);

    await waitFor(() => {
      expect(screen.getByText('Copy of Original VN')).toBeInTheDocument();
    });

    const list = await repo.listProjects();
    expect(list).toHaveLength(2);
    expect(list.some((p) => p.title === 'Copy of Original VN')).toBe(true);
  });

  it('UT-EDT-HUB-05: deletes a project with safe confirmation requiring exact title typing', async () => {
    const toDelete = await repo.createProject({
      title: 'Draft Project',
      description: 'To be deleted safely',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText('Draft Project')).toBeInTheDocument();
    });

    // Click delete button on card
    fireEvent.click(screen.getByTestId(`btn-delete-project-${toDelete.id}`));

    // Delete modal should be visible
    expect(screen.getByTestId('modal-delete-project')).toBeInTheDocument();

    const deleteBtn = screen.getByTestId('btn-confirm-delete-project');
    const titleInput = screen.getByTestId('confirm-delete-title-input');

    // 1. Initial state: delete button must be strictly disabled
    expect(deleteBtn).toBeDisabled();

    // 2. Mismatched title -> button remains disabled
    fireEvent.change(titleInput, { target: { value: 'Wrong Title' } });
    expect(deleteBtn).toBeDisabled();

    // 3. Partial title -> button remains disabled
    fireEvent.change(titleInput, { target: { value: 'Draft' } });
    expect(deleteBtn).toBeDisabled();

    // 4. Case mismatch -> button remains disabled
    fireEvent.change(titleInput, { target: { value: 'draft project' } });
    expect(deleteBtn).toBeDisabled();

    // 5. Exact title with surrounding whitespace -> button enabled!
    fireEvent.change(titleInput, { target: { value: '  Draft Project  ' } });
    expect(deleteBtn).toBeEnabled();

    // 6. Confirm delete
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Draft Project')).not.toBeInTheDocument();
    });

    const remaining = await repo.listProjects();
    expect(remaining).toHaveLength(0);
  });

  it('UT-EDT-HUB-06: validates custom resolution boundaries (min 320x240, max 3840x2160, integers)', async () => {
    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-new-project'));
    expect(screen.getByTestId('modal-new-project')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-project-name'), {
      target: { value: 'Custom Bound VN' },
    });
    fireEvent.change(screen.getByTestId('select-project-aspect'), {
      target: { value: 'custom' },
    });

    const widthInput = screen.getByTestId('input-project-width');
    const heightInput = screen.getByTestId('input-project-height');

    // 1. Below minimum (300 x 200) -> error
    fireEvent.change(widthInput, { target: { value: '300' } });
    fireEvent.change(heightInput, { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText(/minimum resolution is 320x240/i)).toBeInTheDocument();

    // 2. Above maximum (5000 x 3000) -> error
    fireEvent.change(widthInput, { target: { value: '5000' } });
    fireEvent.change(heightInput, { target: { value: '3000' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText(/maximum resolution is 3840x2160/i)).toBeInTheDocument();

    // 3. Valid custom (2560 x 1440 2K QHD) -> success
    fireEvent.change(widthInput, { target: { value: '2560' } });
    fireEvent.change(heightInput, { target: { value: '1440' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));

    await waitFor(() => {
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });

    const projects = await repo.listProjects();
    expect(projects[0].canvasWidth).toBe(2560);
    expect(projects[0].canvasHeight).toBe(1440);
    expect(projects[0].orientation).toBe('landscape');
  });

  it('UT-EDT-HUB-07: calculates storage quota status and renders correct color badge thresholds', async () => {
    // 1. Test getQuotaBadgeInfo unit logic
    expect(getQuotaBadgeInfo(10 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('normal');
    expect(getQuotaBadgeInfo(10 * 1024 * 1024, 100 * 1024 * 1024).color).toBe('green');
    expect(getQuotaBadgeInfo(10 * 1024 * 1024, 100 * 1024 * 1024).text).toBe('Storage OK');

    expect(getQuotaBadgeInfo(75 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('warning');
    expect(getQuotaBadgeInfo(75 * 1024 * 1024, 100 * 1024 * 1024).color).toBe('yellow');
    expect(getQuotaBadgeInfo(75 * 1024 * 1024, 100 * 1024 * 1024).text).toBe('Storage High');

    expect(getQuotaBadgeInfo(95 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('critical');
    expect(getQuotaBadgeInfo(95 * 1024 * 1024, 100 * 1024 * 1024).color).toBe('red');
    expect(getQuotaBadgeInfo(95 * 1024 * 1024, 100 * 1024 * 1024).text).toBe('Storage Almost Full');

    // 2. Test badge rendering in ProjectHubView with mocked quota
    vi.spyOn(repo, 'getStorageUsage').mockResolvedValue({
      usedBytes: 80 * 1024 * 1024,
      quotaBytes: 100 * 1024 * 1024,
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      const badge = screen.getByTestId('hub-quota-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('data-status', 'warning');
      expect(badge).toHaveAttribute('data-color', 'yellow');
      expect(badge).toHaveTextContent('Storage High');
      expect(badge).toHaveTextContent('80.0 MB / 100.0 MB (80%)');
    });
  });

  it('UT-EDT-HUB-08: rejects empty strings or non-integers in custom resolution fields with integer error', async () => {
    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-new-project'));
    fireEvent.change(screen.getByTestId('input-project-name'), {
      target: { value: 'Custom Bounds Project' },
    });
    fireEvent.change(screen.getByTestId('select-project-aspect'), {
      target: { value: 'custom' },
    });

    const widthInput = screen.getByTestId('input-project-width');
    const heightInput = screen.getByTestId('input-project-height');

    // 1. Empty string width -> 'Resolution dimensions must be integers', NOT minimum error
    fireEvent.change(widthInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText('Resolution dimensions must be integers')).toBeInTheDocument();
    expect(screen.queryByText(/minimum resolution is 320x240/i)).not.toBeInTheDocument();

    // 2. Empty string height -> 'Resolution dimensions must be integers'
    fireEvent.change(widthInput, { target: { value: '1920' } });
    fireEvent.change(heightInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText('Resolution dimensions must be integers')).toBeInTheDocument();
    expect(screen.queryByText(/minimum resolution is 320x240/i)).not.toBeInTheDocument();

    // 3. Whitespace string -> 'Resolution dimensions must be integers'
    fireEvent.change(widthInput, { target: { value: '   ' } });
    fireEvent.change(heightInput, { target: { value: '1080' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText('Resolution dimensions must be integers')).toBeInTheDocument();

    // 4. Non-integer float -> 'Resolution dimensions must be integers'
    fireEvent.change(widthInput, { target: { value: '1920.8' } });
    fireEvent.change(heightInput, { target: { value: '1080' } });
    fireEvent.click(screen.getByTestId('btn-confirm-create-project'));
    expect(screen.getByText('Resolution dimensions must be integers')).toBeInTheDocument();
  });

  it('UT-EDT-HUB-09: submits NewProjectModal and creates project cleanly when pressing Enter inside form', async () => {
    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-new-project'));
    const nameInput = screen.getByTestId('input-project-name');
    fireEvent.change(nameInput, { target: { value: 'Enter Key Created Project' } });

    // Submit form via Enter key / form submit event on the form containing the input
    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(() => {
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });

    const projects = await repo.listProjects();
    expect(projects.some((p) => p.title === 'Enter Key Created Project')).toBe(true);
  });

  it('UT-EDT-HUB-10: blocks duplicate creation submissions when busy guard is active (ADV-RACE-05)', async () => {
    let resolveCreate: () => void = () => {};
    const originalCreate = repo.createProject.bind(repo);
    const createSpy = vi.spyOn(repo, 'createProject').mockImplementation(async (params) => {
      await new Promise<void>((resolve) => {
        resolveCreate = resolve;
      });
      return originalCreate(params);
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-new-project'));
    const nameInput = screen.getByTestId('input-project-name');
    fireEvent.change(nameInput, { target: { value: 'Concurrent Submit VN' } });

    const form = nameInput.closest('form')!;
    // Rapid duplicate submit (e.g. multiple rapid Enter key presses or clicks)
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveCreate();

    await waitFor(() => {
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });
  });
});
