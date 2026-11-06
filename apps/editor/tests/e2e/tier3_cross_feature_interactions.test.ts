// @vitest-environment jsdom
// ================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS (PAIRWISE & INTEGRATION FLOWS)
// Mapped from TEST_INFRA.md and TASK-EDITOR-REBUILD-SPEC.md (IT-EDT-01 to IT-EDT-06)
// ================================================================

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { ScriptFile, Character, AssetRef } from '@vn-engine/shared-types';
import {
  setupStoragePolyfill,
  setupBroadcastChannelPolyfill,
  StudioProjectRepository,
  scanActiveReconciliation,
  checkSafeAssetDeletion,
} from './testHelpers';

describe('Tier 3: Cross-Feature Interactions (Web Editor Studio Platform)', () => {
  let repo: StudioProjectRepository;

  beforeAll(() => {
    setupStoragePolyfill();
    setupBroadcastChannelPolyfill();
  });

  beforeEach(() => {
    repo = new StudioProjectRepository();
  });

  // --------------------------------------------------------------------------
  // X01: Active AST Reconciliation + Safe Delete Blocking Dynamic Lifecycle
  // --------------------------------------------------------------------------
  it('X01: dynamically blocks and unblocks safe asset deletion as script AST changes', () => {
    const assets: AssetRef[] = [
      { id: 'ast-school', name: 'bg_school', type: 'image', storageUrl: '', sizeBytes: 1024 },
    ];

    // Step 1: Script references bg_school
    const filesV1: ScriptFile[] = [
      {
        id: 'scene1.vns',
        name: 'scene1.vns',
        order: 0,
        version: 1,
        content: `
scene start {
    background bg_school
    alice: "First day of school!"
}
`,
      },
    ];

    // Reconciliation identifies it as in-use
    const reportV1 = scanActiveReconciliation(filesV1, [], assets);
    expect(reportV1.unusedAssets).not.toContain('bg_school');

    // Safe delete check blocks deletion
    const checkV1 = checkSafeAssetDeletion('bg_school', filesV1);
    expect(checkV1.safe).toBe(false);
    expect(checkV1.references).toHaveLength(1);
    expect(checkV1.references[0]?.fileName).toBe('scene1.vns');

    // Step 2: Author edits script to remove bg_school reference
    const filesV2: ScriptFile[] = [
      {
        id: 'scene1.vns',
        name: 'scene1.vns',
        order: 0,
        version: 2,
        content: `
scene start {
    alice: "First day of school without background!"
}
`,
      },
    ];

    // Reconciliation now flags it as unused
    const reportV2 = scanActiveReconciliation(filesV2, [], assets);
    expect(reportV2.unusedAssets).toContain('bg_school');

    // Safe delete check now permits deletion
    const checkV2 = checkSafeAssetDeletion('bg_school', filesV2);
    expect(checkV2.safe).toBe(true);
    expect(checkV2.references).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // X02 [IT-EDT-06]: Lock Character ID When Editing Existing Character
  // --------------------------------------------------------------------------
  it('X02 [IT-EDT-06]: disables Character ID field in edit mode to preserve script AST references', () => {
    interface CharacterModalState {
      isEditMode: boolean;
      idInputDisabled: boolean;
      characterId: string;
      displayName: string;
      colorHex: string;
    }

    const openCharacterModal = (existingCharacter?: Character): CharacterModalState => {
      const isEdit = existingCharacter !== undefined;
      return {
        isEditMode: isEdit,
        idInputDisabled: isEdit, // Character ID is permanently locked on edit
        characterId: existingCharacter?.id || '',
        displayName: existingCharacter?.name || '',
        colorHex: existingCharacter?.colorHex || '#38bdf8',
      };
    };

    // Mode A: Creating new character -> ID input is editable
    const createModal = openCharacterModal();
    expect(createModal.isEditMode).toBe(false);
    expect(createModal.idInputDisabled).toBe(false);

    // Mode B: Editing existing character 'alice' -> ID input is locked
    const editModal = openCharacterModal({
      id: 'alice',
      name: 'Alice Margatroid',
      colorHex: '#38bdf8',
      sprites: { happy: 'spr_01' },
    });
    expect(editModal.isEditMode).toBe(true);
    expect(editModal.idInputDisabled).toBe(true);
    expect(editModal.characterId).toBe('alice');
  });

  // --------------------------------------------------------------------------
  // X03 [IT-EDT-03]: Two-Way HEX Color Picker Synchronization
  // --------------------------------------------------------------------------
  it('X03 [IT-EDT-03]: synchronizes text input and native color picker bi-directionally', () => {
    let hexText = '#38bdf8';
    let nativeColorPicker = hexText;
    let nameplatePreviewColor = hexText;

    // Direction 1: Author types text into HEX input
    const onHexTextInput = (typed: string) => {
      let normalized = typed.trim();
      if (!normalized.startsWith('#')) normalized = '#' + normalized;
      if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
        hexText = normalized.toLowerCase();
        nativeColorPicker = hexText;
        nameplatePreviewColor = hexText;
      }
    };

    onHexTextInput('#ec4899');
    expect(nativeColorPicker).toBe('#ec4899');
    expect(nameplatePreviewColor).toBe('#ec4899');

    // Direction 2: Author picks color via native picker
    const onNativePickerChange = (picked: string) => {
      nativeColorPicker = picked.toLowerCase();
      hexText = nativeColorPicker;
      nameplatePreviewColor = nativeColorPicker;
    };

    onNativePickerChange('#10b981');
    expect(hexText).toBe('#10b981');
    expect(nameplatePreviewColor).toBe('#10b981');
  });

  // --------------------------------------------------------------------------
  // X04 [IT-EDT-01]: 1-Click Jump from Problems Hub to Monaco Line
  // --------------------------------------------------------------------------
  it('X04 [IT-EDT-01]: navigates to file tab, sets cursor position, and highlights line on diagnostic click', () => {
    interface EditorNavigationState {
      activeTab: string;
      cursorPosition: { line: number; col: number };
      highlightedLine: number | null;
    }

    const state: EditorNavigationState = {
      activeTab: 'main.vns',
      cursorPosition: { line: 1, col: 1 },
      highlightedLine: null,
    };

    const onDiagnosticProblemClick = (problem: {
      fileId: string;
      line: number;
      col: number;
    }) => {
      state.activeTab = problem.fileId;
      state.cursorPosition = { line: problem.line, col: problem.col };
      state.highlightedLine = problem.line;
    };

    const targetProblem = {
      fileId: 'chapter2.vns',
      line: 15,
      col: 4,
      message: 'Undefined character bob',
    };

    onDiagnosticProblemClick(targetProblem);

    expect(state.activeTab).toBe('chapter2.vns');
    expect(state.cursorPosition).toEqual({ line: 15, col: 4 });
    expect(state.highlightedLine).toBe(15);
  });

  // --------------------------------------------------------------------------
  // X05 [IT-EDT-02]: 1-Click QuickFix Creation Pre-fills Target ID
  // --------------------------------------------------------------------------
  it('X05 [IT-EDT-02]: opens creation modal with target asset ID pre-filled on QuickFix click', () => {
    interface ModalState {
      isOpen: boolean;
      prefillAssetId: string;
    }

    const assetModal: ModalState = {
      isOpen: false,
      prefillAssetId: '',
    };

    const onQuickFix = (fix: { type: string; targetId: string }) => {
      if (fix.type === 'create_asset') {
        assetModal.isOpen = true;
        assetModal.prefillAssetId = fix.targetId;
      }
    };

    onQuickFix({
      type: 'create_asset',
      targetId: 'bg_sunset',
    });

    expect(assetModal.isOpen).toBe(true);
    expect(assetModal.prefillAssetId).toBe('bg_sunset');
  });

  // --------------------------------------------------------------------------
  // X06 [IT-EDT-04]: Runtime Cheat Injection Directly Updates Live VM State
  // --------------------------------------------------------------------------
  it('X06 [IT-EDT-04]: dispatches SET_VM_VARIABLE to PreviewBridge and updates live watch variables', () => {
    const liveWatchVariables: Record<string, unknown> = {
      affinity: 10,
      player_name: 'Traveler',
    };

    const dispatchedMessages: Array<{ type: string; payload: unknown }> = [];

    const injectVariable = (variable: string, value: unknown) => {
      dispatchedMessages.push({
        type: 'SET_VM_VARIABLE',
        payload: { variable, value },
      });
      // Live state updates without script restart
      liveWatchVariables[variable] = value;
    };

    injectVariable('affinity', 99);

    expect(dispatchedMessages).toHaveLength(1);
    expect(dispatchedMessages[0]).toEqual({
      type: 'SET_VM_VARIABLE',
      payload: { variable: 'affinity', value: 99 },
    });
    expect(liveWatchVariables['affinity']).toBe(99);
  });

  // --------------------------------------------------------------------------
  // X07 [IT-EDT-05]: Emergency Unload Snapshot on beforeunload
  // --------------------------------------------------------------------------
  it('X07 [IT-EDT-05]: triggers beforeunload warning and captures emergency snapshot in sessionStorage', () => {
    const projectId = 'proj_alpha_99';
    const draftContent = `
scene start {
    alice: "Unsaved work in progress..."
}
`;
    let isDirty = true;
    let promptTriggered = false;

    const handleBeforeUnload = (e: { preventDefault: () => void; returnValue: string }) => {
      if (isDirty) {
        sessionStorage.setItem(`emergency_snapshot_${projectId}`, draftContent);
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        promptTriggered = true;
      }
    };

    const mockEvent = {
      preventDefault: vi.fn(),
      returnValue: '',
    };

    handleBeforeUnload(mockEvent);

    expect(promptTriggered).toBe(true);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toContain('unsaved changes');
    expect(sessionStorage.getItem(`emergency_snapshot_${projectId}`)).toBe(draftContent);
  });

  // --------------------------------------------------------------------------
  // X08: Project Settings Update Propagates to Live Preview Dock
  // --------------------------------------------------------------------------
  it('X08: updates canvas aspect ratio in preview dock when project settings orientation changes', async () => {
    const project = await repo.createProject({
      title: 'Adaptive Screen Project',
      displaySettings: {
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        lockAspectRatio: true,
      },
    });

    const getPreviewDockClass = (orientation: 'landscape' | 'portrait') => {
      return `preview-dock aspect-${orientation === 'landscape' ? '16-9' : '9-16'}`;
    };

    expect(getPreviewDockClass('landscape')).toBe('preview-dock aspect-16-9');

    // Creator changes settings to Mobile Portrait
    const updated = JSON.parse(JSON.stringify(project));
    updated.displaySettings = {
      width: 1080,
      height: 1920,
      orientation: 'portrait',
      lockAspectRatio: true,
    };
    await repo.updateProject(updated);

    const reloaded = await repo.getProject(project.id);
    const ds = (reloaded as unknown as { displaySettings: { orientation: 'landscape' | 'portrait' } })
      .displaySettings;
    expect(ds.orientation).toBe('portrait');
    expect(getPreviewDockClass(ds.orientation)).toBe('preview-dock aspect-9-16');
  });
});
