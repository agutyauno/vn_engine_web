import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import { ProjectHubView } from '../src/components/hub/ProjectHubView';

describe('ProjectHubView (TDD)', () => {
  let repo: IndexedDBProjectRepository;

  beforeEach(async () => {
    // Unique DB name per test to prevent leakage
    repo = new IndexedDBProjectRepository(`test-hub-${Date.now()}-${Math.random()}`);
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

  it('UT-EDT-HUB-03: creates a new project via NewProjectModal with preset and validation', async () => {
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
      expect(screen.getByText('Original VN - Copy')).toBeInTheDocument();
    });

    const list = await repo.listProjects();
    expect(list).toHaveLength(2);
  });

  it('UT-EDT-HUB-05: deletes a project after confirmation modal', async () => {
    const toDelete = await repo.createProject({
      title: 'Draft Project',
      description: 'To be deleted',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const handleOpen = vi.fn();
    render(<ProjectHubView repository={repo} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText('Draft Project')).toBeInTheDocument();
    });

    // Click delete button
    fireEvent.click(screen.getByTestId(`btn-delete-project-${toDelete.id}`));

    // Delete modal should be visible
    expect(screen.getByTestId('modal-delete-project')).toBeInTheDocument();

    // Confirm delete
    fireEvent.click(screen.getByTestId('btn-confirm-delete-project'));

    await waitFor(() => {
      expect(screen.queryByText('Draft Project')).not.toBeInTheDocument();
    });

    const remaining = await repo.listProjects();
    expect(remaining).toHaveLength(0);
  });
});
