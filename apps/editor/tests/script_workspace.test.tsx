// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Project, ScriptFile } from '@vn-engine/shared-types';
import { EditorTabBar } from '../src/components/studio/EditorTabBar';
import { MonacoEditorContainer } from '../src/components/studio/MonacoEditorContainer';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

describe('Milestone 6: Monaco Script Workspace (Column 2 Top)', () => {
  const sampleFiles: ScriptFile[] = [
    {
      id: 'file-1',
      name: 'chapter1.vns',
      order: 0,
      version: 1,
      content: 'scene "bg_classroom.png"\nshow alice.happy\n"Alice" "Chào bạn!"\n',
    },
    {
      id: 'file-2',
      name: 'chapter2.vns',
      order: 1,
      version: 1,
      content: 'scene "bg_school.png"\nshow alice.smile\n"Alice" "Trời mưa rồi."\n',
    },
    {
      id: 'file-3',
      name: 'ending.vns',
      order: 2,
      version: 1,
      content: 'end\n',
    },
  ];

  const sampleProject: Project = {
    id: 'proj-editor-tab-test',
    title: 'Visual Novel Script Studio',
    version: 1,
    ownerId: 'author-1',
    defaultLanguage: 'vi',
    files: sampleFiles,
    characters: [
      {
        id: 'alice',
        name: 'Alice Carroll',
        colorHex: '#e91e63',
        defaultExpression: 'happy',
        sprites: { happy: 'asset-1', smile: 'asset-2' },
      },
    ],
    variables: [
      { name: 'affection', type: 'number', defaultValue: 10 },
      { name: 'hasKey', type: 'boolean', defaultValue: false },
    ],
    assets: [
      {
        id: 'ast-1',
        name: 'bg_classroom.png',
        type: 'image',
        storageUrl: 'blob:class',
        sizeBytes: 1024,
      },
    ],
    uiScreens: [],
    customScripts: [],
  };

  // ========================================================================
  // 1. EditorTabBar Component Unit Tests
  // ========================================================================
  describe('EditorTabBar Component', () => {
    it('renders tabs cleanly without .vns extension and highlights active tab', () => {
      const handleSelect = vi.fn();
      const handleClose = vi.fn();

      render(
        <EditorTabBar
          files={sampleFiles}
          openFileIds={['file-1', 'file-2']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={handleSelect}
          onCloseTab={handleClose}
        />
      );

      // Verify clean display without .vns
      expect(screen.getByText('chapter1')).toBeInTheDocument();
      expect(screen.getByText('chapter2')).toBeInTheDocument();
      expect(screen.queryByText('chapter1.vns')).not.toBeInTheDocument();

      // Active tab marker
      const tab1 = screen.getByTestId('editor-tab-file-1');
      expect(tab1).toHaveAttribute('data-active', 'true');

      const tab2 = screen.getByTestId('editor-tab-file-2');
      expect(tab2).toHaveAttribute('data-active', 'false');

      // Click tab2 to switch
      fireEvent.click(tab2);
      expect(handleSelect).toHaveBeenCalledWith('file-2');
    });

    it('renders dirty dot indicator ● only when file is in dirtyFileIds', () => {
      const dirtySet = new Set(['file-1']);

      render(
        <EditorTabBar
          files={sampleFiles}
          openFileIds={['file-1', 'file-2']}
          activeFileId="file-1"
          dirtyFileIds={dirtySet}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
        />
      );

      // file-1 has dirty dot
      const dirtyDot = screen.getByTestId('dirty-dot-file-1');
      expect(dirtyDot).toBeInTheDocument();
      expect(dirtyDot).toHaveTextContent('●');

      // file-2 does not have dirty dot
      expect(screen.queryByTestId('dirty-dot-file-2')).not.toBeInTheDocument();
    });

    it('triggers onCloseTab when close button on a tab is clicked', () => {
      const handleClose = vi.fn();

      render(
        <EditorTabBar
          files={sampleFiles}
          openFileIds={['file-1', 'file-2']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={handleClose}
        />
      );

      const closeBtn = screen.getByTestId('btn-close-tab-file-2');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledWith('file-2');
    });

    it('triggers onNewFile when plus button is clicked', () => {
      const handleNew = vi.fn();

      render(
        <EditorTabBar
          files={sampleFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onNewFile={handleNew}
        />
      );

      const newTabBtn = screen.getByTestId('btn-new-tab');
      fireEvent.click(newTabBtn);
      expect(handleNew).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // 2. MonacoEditorContainer Component Unit Tests
  // ========================================================================
  describe('MonacoEditorContainer Component', () => {
    it('renders script content in container and notifies on content changes', () => {
      const handleChange = vi.fn();

      render(
        <MonacoEditorContainer
          file={sampleFiles[0]!}
          project={sampleProject}
          onChange={handleChange}
        />
      );

      expect(screen.getByTestId('monaco-editor-container')).toBeInTheDocument();

      // In JSDOM test mode, fallback editor textarea is accessible
      const textarea = screen.getByTestId('monaco-fallback-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe(sampleFiles[0]!.content);

      // Simulate typing new script code
      fireEvent.change(textarea, {
        target: { value: 'scene "bg_classroom.png"\nshow alice.smile\n' },
      });

      expect(handleChange).toHaveBeenCalledWith('scene "bg_classroom.png"\nshow alice.smile\n');
    });

    it('displays empty placeholder when no file is active', () => {
      render(
        <MonacoEditorContainer
          file={null}
          project={sampleProject}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/No file open/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // 3. StudioWorkspacePage Integration: Tabs & Monaco Editing
  // ========================================================================
  describe('StudioWorkspacePage Monaco Workspace Integration', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(async () => {
      repo = new IndexedDBProjectRepository(`studio_m6_${Date.now()}_${Math.random()}`);
      await repo.createProject(sampleProject);
    });

    it('edits script content, displays dirty dot ● on tab, and persists on save', async () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      // Verify active tab in EditorTabBar
      expect(screen.getByTestId('editor-tab-file-1')).toBeInTheDocument();

      // Find textarea and type modification
      const textarea = screen.getByTestId('monaco-fallback-textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: { value: 'scene "bg_classroom.png"\nshow alice.smile\n"Alice" "Chào buổi tối!"\n' },
      });

      // Dirty dot appears on tab
      await waitFor(() => {
        expect(screen.getByTestId('dirty-dot-file-1')).toBeInTheDocument();
      });

      // Header indicates unsaved changes
      expect(screen.getByTestId('header-save-status')).toHaveTextContent(/Unsaved Changes/i);

      // Click header Save button
      const saveBtn = screen.getByTestId('btn-manual-save');
      fireEvent.click(saveBtn);

      // Verify dirty dot clears and status changes to Saved
      await waitFor(() => {
        expect(screen.queryByTestId('dirty-dot-file-1')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('header-save-status')).toHaveTextContent(/Saved/i);

      // Verify persisted in IndexedDB
      const persisted = await repo.getProject(sampleProject.id);
      expect(persisted?.files[0]?.content).toContain('Chào buổi tối!');
    });

    it('switches active file when tab is clicked and updates editor content', () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      // Initially file-1 content is shown
      const textarea = screen.getByTestId('monaco-fallback-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('Chào bạn!');

      // Click on file-2 tab
      const tab2 = screen.getByTestId('editor-tab-file-2');
      fireEvent.click(tab2);

      // Editor now shows file-2 content
      expect(textarea.value).toContain('Trời mưa rồi.');
    });

    it('closing tab removes it from EditorTabBar and switches active file', () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      // Close file-1 tab
      const closeBtn = screen.getByTestId('btn-close-tab-file-1');
      fireEvent.click(closeBtn);

      // file-1 tab is gone from open tabs
      expect(screen.queryByTestId('editor-tab-file-1')).not.toBeInTheDocument();

      // Editor switched to file-2
      const tab2 = screen.getByTestId('editor-tab-file-2');
      expect(tab2).toHaveAttribute('data-active', 'true');
    });
  });
});
