// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ScriptFile } from '@vn-engine/shared-types';
import { FileExplorerPane } from '../src/components/studio/FileExplorerPane';

const mockFiles: ScriptFile[] = [
  {
    id: 'file-main',
    name: 'main.vns',
    content: 'scene start {}\n',
    order: 0,
    version: 1,
  },
  {
    id: 'file-prologue',
    name: 'prologue.vns',
    content: 'scene prologue {}\n',
    order: 1,
    version: 1,
  },
  {
    id: 'file-chap1',
    name: 'chapter1.vns',
    content: 'scene ch1 {}\n',
    order: 2,
    version: 1,
  },
];

describe('FileExplorerPane: Configurable Entry Scene', () => {
  it('TC-ENTRY-01: clicking "Set as Entry Scene" button invokes onSetEntryScene with file name', () => {
    const onSetEntryScene = vi.fn();
    render(
      <FileExplorerPane
        files={mockFiles}
        activeFileId="file-main"
        entrySceneName="main.vns"
        onSelectFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onSetEntryScene={onSetEntryScene}
      />,
    );

    // main.vns should have Entry badge
    expect(screen.getByTestId('badge-entry-file-main')).toBeInTheDocument();

    // prologue.vns should NOT have Entry badge and should have "Set as Entry Scene" button
    expect(screen.queryByTestId('badge-entry-file-prologue')).not.toBeInTheDocument();
    const setEntryBtn = screen.getByTestId('btn-set-entry-file-prologue');
    expect(setEntryBtn).toBeInTheDocument();

    fireEvent.click(setEntryBtn);
    expect(onSetEntryScene).toHaveBeenCalledTimes(1);
    expect(onSetEntryScene).toHaveBeenCalledWith('prologue.vns');
  });

  it('TC-ENTRY-02: honors custom entrySceneName and does not hardcode main.vns as entry', () => {
    render(
      <FileExplorerPane
        files={mockFiles}
        activeFileId="file-prologue"
        entrySceneName="prologue.vns"
        onSelectFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onSetEntryScene={vi.fn()}
      />,
    );

    // prologue.vns is the designated entry
    expect(screen.getByTestId('badge-entry-file-prologue')).toBeInTheDocument();
    const deletePrologueBtn = screen.getByTestId('btn-delete-file-file-prologue');
    expect(deletePrologueBtn).toBeDisabled();

    // main.vns should NOT be entry and should have delete enabled
    expect(screen.queryByTestId('badge-entry-file-main')).not.toBeInTheDocument();
    const deleteMainBtn = screen.getByTestId('btn-delete-file-file-main');
    expect(deleteMainBtn).not.toBeDisabled();
  });

  it('TC-NO-DUP: does not render duplicate button and duplicateFile is eliminated', () => {
    render(
      <FileExplorerPane
        files={mockFiles}
        activeFileId="file-main"
        entrySceneName="main.vns"
        onSelectFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onSetEntryScene={vi.fn()}
      />,
    );

    // Verify duplicate file buttons are completely absent
    expect(screen.queryByTestId('btn-duplicate-file-file-main')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-duplicate-file-file-prologue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-duplicate-file-file-chap1')).not.toBeInTheDocument();
  });
});
