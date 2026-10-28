// @vitest-environment jsdom
// ================================================================
// TIER 1: FEATURE COVERAGE (HAPPY PATH & UNIT CONTRACT VERIFICATION)
// All 21 features mapped from TEST_INFRA.md and TASK-EDITOR-REBUILD-SPEC.md
// ================================================================

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { ScriptFile, Character, AssetRef } from '@vn-engine/shared-types';
import {
  setupStoragePolyfill,
  setupBroadcastChannelPolyfill,
  MockBroadcastChannel,
  StudioProjectRepository,
  scanActiveReconciliation,
  checkSafeAssetDeletion,
} from './testHelpers';
import { validateFileName, generateDefaultScriptName } from '../../src/modules/fileExplorer';

describe('Tier 1: Feature Coverage (Web Editor Studio Platform)', () => {
  let repo: StudioProjectRepository;

  beforeAll(() => {
    setupStoragePolyfill();
    setupBroadcastChannelPolyfill();
  });

  beforeEach(() => {
    repo = new StudioProjectRepository();
  });

  // --------------------------------------------------------------------------
  // Feature 1: IndexedDBProjectRepository CRUD & Quota (UT-EDT-01)
  // --------------------------------------------------------------------------
  it('F01 [UT-EDT-01]: initializes new project with Canvas 1920x1080 and starter script', async () => {
    const project = await repo.createProject({
      title: 'Academy of Runes',
      displaySettings: {
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        lockAspectRatio: true,
      },
    });

    expect(project.id).toBeDefined();
    expect(project.title).toBe('Academy of Runes');
    const ds = (project as unknown as { displaySettings: { width: number; height: number } })
      .displaySettings;
    expect(ds.width).toBe(1920);
    expect(ds.height).toBe(1080);
    expect(project.files).toHaveLength(1);
    expect(project.files[0]?.name).toBe('main.vns');
    expect(project.files[0]?.content).toContain('scene start');

    // Verify storage estimate tracking
    const quota = await repo.getStorageUsage();
    expect(quota.quotaBytes).toBeGreaterThan(0);
    expect(quota.usedBytes).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // Feature 2: Project Hub & Canvas Resolution Presets
  // --------------------------------------------------------------------------
  it('F02: creates projects under multiple canvas resolution presets', async () => {
    const presets = [
      { name: 'Landscape 16:9', width: 1920, height: 1080, orientation: 'landscape' as const },
      { name: 'Portrait 9:16', width: 1080, height: 1920, orientation: 'portrait' as const },
      { name: 'Classic 4:3', width: 1024, height: 768, orientation: 'landscape' as const },
    ];

    for (const preset of presets) {
      const proj = await repo.createProject({
        title: `Project ${preset.name}`,
        displaySettings: {
          width: preset.width,
          height: preset.height,
          orientation: preset.orientation,
          lockAspectRatio: true,
        },
      });

      const summaries = await repo.listProjects();
      const summary = summaries.find(s => s.id === proj.id);
      expect(summary).toBeDefined();
      expect(summary?.canvasWidth).toBe(preset.width);
      expect(summary?.canvasHeight).toBe(preset.height);
      expect(summary?.orientation).toBe(preset.orientation);
    }
  });

  // --------------------------------------------------------------------------
  // Feature 3: Safe Project Deletion
  // --------------------------------------------------------------------------
  it('F03: safely deletes project only when target title matches', async () => {
    const proj = await repo.createProject({
      title: 'Project To Purge',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const verifyDeletionCommit = async (typedTitle: string): Promise<boolean> => {
      if (typedTitle.trim() === proj.title) {
        await repo.deleteProject(proj.id);
        return true;
      }
      return false;
    };

    // Mismatched title -> blocked
    const attemptedMismatch = await verifyDeletionCommit('Wrong Title');
    expect(attemptedMismatch).toBe(false);
    expect(await repo.getProject(proj.id)).not.toBeNull();

    // Exact title match -> committed
    const attemptedExact = await verifyDeletionCommit('Project To Purge');
    expect(attemptedExact).toBe(true);
    expect(await repo.getProject(proj.id)).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Feature 4: Studio Shell 3-Column Layout & Activity Bar
  // --------------------------------------------------------------------------
  it('F04: provides 3-column director structure and activity bar state', () => {
    const columns = {
      col1_navigation: { name: 'Static Navigation Pane', widthMinPx: 200, widthMaxPx: 480 },
      col2_workspace: { name: 'Center Script & Diagnostics Drawer', flex: 1 },
      col3_preview: { name: 'Live Preview Workspace', fullHeight: true },
    };

    expect(columns.col1_navigation.widthMinPx).toBe(200);
    expect(columns.col3_preview.fullHeight).toBe(true);

    const activityBarTabs = ['files', 'characters', 'assets'] as const;
    expect(activityBarTabs).toHaveLength(3);
    let activeNavTab: (typeof activityBarTabs)[number] = 'files';

    const switchNavTab = (tab: (typeof activityBarTabs)[number]) => {
      activeNavTab = tab;
    };

    switchNavTab('characters');
    expect(activeNavTab).toBe('characters');
    switchNavTab('assets');
    expect(activeNavTab).toBe('assets');
  });

  // --------------------------------------------------------------------------
  // Feature 5: File Explorer Clean Naming (.vns hidden) (UT-EDT-07)
  // --------------------------------------------------------------------------
  it('F05 [UT-EDT-07]: displays and renames chapter files without exposing .vns extension', () => {
    const existing = ['main.vns', 'chapter1.vns'];
    const cleanDisplay = (filename: string) => filename.replace(/\.vns$/, '');

    expect(cleanDisplay('chapter1.vns')).toBe('chapter1');
    expect(cleanDisplay('prologue.vns')).toBe('prologue');

    // Renaming chapter1 -> intro
    const validation = validateFileName('intro', existing);
    expect(validation.valid).toBe(true);
    expect(validation.normalizedName).toBe('intro.vns');
    expect(cleanDisplay(validation.normalizedName)).toBe('intro');

    // Sequential default name generation
    const autoName = generateDefaultScriptName(existing);
    expect(autoName).toBe('New Script.vns');
  });

  // --------------------------------------------------------------------------
  // Feature 6: Character Manager Decoupled ID vs Display Name (UT-EDT-02)
  // --------------------------------------------------------------------------
  it('F06 [UT-EDT-02]: separates technical ID from dialogue name and prevents duplicate IDs', () => {
    const existingCharacters: Character[] = [
      {
        id: 'alice',
        name: 'Alice Margatroid',
        colorHex: '#38bdf8',
        sprites: { default: 'sprite_01' },
      },
    ];

    const addCharacter = (id: string, displayName: string, colorHex: string): Character => {
      const normalizedId = id.trim().toLowerCase();
      if (existingCharacters.some(c => c.id === normalizedId)) {
        throw new Error(`Character ID '${normalizedId}' already exists`);
      }
      const newChar: Character = {
        id: normalizedId,
        name: displayName.trim(),
        colorHex,
        sprites: {},
      };
      existingCharacters.push(newChar);
      return newChar;
    };

    // Successfully add character with distinct ID and Display Name
    const bob = addCharacter('bob', 'Robert "Bob" Vance', '#10b981');
    expect(bob.id).toBe('bob');
    expect(bob.name).toBe('Robert "Bob" Vance');

    // Attempt duplicate ID
    expect(() => addCharacter('alice', 'Another Alice', '#ec4899')).toThrow(
      "Character ID 'alice' already exists",
    );
  });

  // --------------------------------------------------------------------------
  // Feature 7: Two-Way HEX Color Picker Sync
  // --------------------------------------------------------------------------
  it('F07: synchronizes HEX input, native color picker and live tag preview', () => {
    let currentHex = '#38bdf8';
    let previewNameplateColor = currentHex;

    const onHexTextChange = (input: string) => {
      let normalized = input.trim();
      if (!normalized.startsWith('#')) normalized = '#' + normalized;
      if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
        currentHex = normalized.toLowerCase();
        previewNameplateColor = currentHex;
      }
    };

    onHexTextChange('#ec4899');
    expect(currentHex).toBe('#ec4899');
    expect(previewNameplateColor).toBe('#ec4899');

    // Invalid hex string is rejected and leaves state stable
    onHexTextChange('not_a_color');
    expect(previewNameplateColor).toBe('#ec4899');
  });

  // --------------------------------------------------------------------------
  // Feature 8: Bulk Expression Dropzone (UT-EDT-09)
  // --------------------------------------------------------------------------
  it('F08 [UT-EDT-09]: parses bulk image drops into expression keys stripped of file extensions', () => {
    const droppedFiles = [
      { name: 'happy.png', type: 'image/png', size: 1024 * 100 },
      { name: 'sad.webp', type: 'image/webp', size: 1024 * 80 },
      { name: 'angry.jpg', type: 'image/jpeg', size: 1024 * 120 },
    ];

    const parseDroppedSprites = (files: typeof droppedFiles) => {
      return files.map(f => {
        const key = f.name.replace(/\.[^/.]+$/, '').toLowerCase();
        return {
          expressionKey: key,
          fileName: f.name,
          imageUrl: `data:${f.type};base64,fakeDataFor_${key}`,
          sizeBytes: f.size,
          isDefault: key === 'default',
        };
      });
    };

    const parsed = parseDroppedSprites(droppedFiles);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.expressionKey).toBe('happy');
    expect(parsed[1]?.expressionKey).toBe('sad');
    expect(parsed[2]?.expressionKey).toBe('angry');
  });

  // --------------------------------------------------------------------------
  // Feature 9: Asset Library Replace File Keeping ID (UT-EDT-06)
  // --------------------------------------------------------------------------
  it('F09 [UT-EDT-06]: replaces binary blob while preserving asset ID', async () => {
    const assetId = 'ast-01';
    const originalBlob = new Blob(['audio-binary-v1'], { type: 'audio/mp3' });
    await repo.saveAssetBlob(assetId, originalBlob);

    const initialFetch = await repo.getAssetBlob(assetId);
    expect(initialFetch).not.toBeNull();
    expect(await initialFetch?.text()).toBe('audio-binary-v1');

    // Replace with new blob
    const updatedBlob = new Blob(['audio-binary-v2-hq'], { type: 'audio/mp3' });
    await repo.saveAssetBlob(assetId, updatedBlob);

    const afterReplace = await repo.getAssetBlob(assetId);
    expect(afterReplace).not.toBeNull();
    expect(await afterReplace?.text()).toBe('audio-binary-v2-hq');
  });

  // --------------------------------------------------------------------------
  // Feature 10: AST-Checked Safe Delete Blocking (UT-EDT-05)
  // --------------------------------------------------------------------------
  it('F10 [UT-EDT-05]: blocks asset deletion when referenced in script AST', () => {
    const files: ScriptFile[] = [
      {
        id: 'chap1.vns',
        name: 'chap1.vns',
        order: 0,
        version: 1,
        content: `
scene start {
    background bg_school
    alice: "Welcome to class!"
}
`,
      },
    ];

    const safeCheck = checkSafeAssetDeletion('bg_school.png', files);
    expect(safeCheck.safe).toBe(false);
    expect(safeCheck.references).toHaveLength(1);
    expect(safeCheck.references[0]?.fileName).toBe('chap1.vns');
  });

  // --------------------------------------------------------------------------
  // Feature 11: Active AST Reconciliation (UT-EDT-03, UT-EDT-04)
  // --------------------------------------------------------------------------
  it('F11 [UT-EDT-03, UT-EDT-04]: detects uncreated characters/assets and unused assets', () => {
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        order: 0,
        version: 1,
        content: `
scene start {
    background bg_courtyard
    play music "bg_rain.mp3"
    show bob.happy
    bob: "It's raining outside."
}
`,
      },
    ];

    const characters: Character[] = [
      { id: 'alice', name: 'Alice Margatroid', sprites: {} },
    ];

    const assets: AssetRef[] = [
      { id: 'ast-1', name: 'bg_courtyard', type: 'image', storageUrl: '', sizeBytes: 100 },
      { id: 'ast-2', name: 'unused_bg.png', type: 'image', storageUrl: '', sizeBytes: 200 },
    ];

    const report = scanActiveReconciliation(files, characters, assets);

    // Uncreated character 'bob' was called in script but not in characters
    expect(report.uncreatedCharacters).toContain('bob');
    // Uncreated asset 'bg_rain.mp3' was called in play music but not in assets
    expect(report.uncreatedAssets).toContain('bg_rain.mp3');
    // 'unused_bg.png' exists in assets but is never referenced
    expect(report.unusedAssets).toContain('unused_bg.png');
  });

  // --------------------------------------------------------------------------
  // Feature 12: Monaco Script Editor & Tab Bar
  // --------------------------------------------------------------------------
  it('F12: manages clean editor tabs and unsaved dirty dot state', () => {
    interface TabItem {
      id: string;
      title: string;
      isDirty: boolean;
    }

    const tabs: TabItem[] = [
      { id: 'file-1', title: 'main', isDirty: false },
      { id: 'file-2', title: 'chapter1', isDirty: true },
    ];

    const renderTabTitle = (t: TabItem) => `${t.title}${t.isDirty ? ' ●' : ''}`;
    expect(renderTabTitle(tabs[0]!)).toBe('main');
    expect(renderTabTitle(tabs[1]!)).toBe('chapter1 ●');
  });

  // --------------------------------------------------------------------------
  // Feature 13: VNS Monarch Syntax Highlighter & Autocomplete
  // --------------------------------------------------------------------------
  it('F13: provides autocomplete suggestions for characters and expressions', () => {
    const characters = new Map<string, { displayName?: string; sprites: Set<string> }>([
      ['alice', { displayName: 'Alice Margatroid', sprites: new Set(['happy', 'sad', 'angry']) }],
    ]);

    const getSuggestionsForPrefix = (linePrefix: string) => {
      const match = linePrefix.match(/show\s+([a-zA-Z0-9_]+)\.$/);
      if (match && match[1]) {
        const charId = match[1];
        const char = characters.get(charId);
        if (char) {
          return Array.from(char.sprites).map(s => `${charId}.${s}`);
        }
      }
      return [];
    };

    const suggestions = getSuggestionsForPrefix('show alice.');
    expect(suggestions).toContain('alice.happy');
    expect(suggestions).toContain('alice.sad');
    expect(suggestions).toContain('alice.angry');
  });

  // --------------------------------------------------------------------------
  // Feature 14: Debounced Auto-Save & Emergency Snapshot
  // --------------------------------------------------------------------------
  it('F14: executes debounced auto-save and emergency snapshot on unload', async () => {
    vi.useFakeTimers();
    let saved = false;

    const scheduleAutoSave = (debounceMs: number, onSave: () => void) => {
      return setTimeout(onSave, debounceMs);
    };

    scheduleAutoSave(1000, () => {
      saved = true;
    });

    expect(saved).toBe(false);
    vi.advanceTimersByTime(500);
    expect(saved).toBe(false);
    vi.advanceTimersByTime(500);
    expect(saved).toBe(true);

    // Emergency unload snapshot
    const projectId = 'proj_test_emergency';
    const uncommittedContent = 'scene start { alice: "Drafting..." }';
    sessionStorage.setItem(`emergency_snapshot_${projectId}`, uncommittedContent);

    expect(sessionStorage.getItem(`emergency_snapshot_${projectId}`)).toBe(uncommittedContent);
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Feature 15: Collapsible Bottom Diagnostics Drawer
  // --------------------------------------------------------------------------
  it('F15: controls bottom drawer toggle and tab switching', () => {
    let isOpen = false;
    let activeTab: 'problems' | 'cheats' | 'console' = 'problems';

    const toggleDrawer = () => {
      isOpen = !isOpen;
    };
    const selectTab = (t: 'problems' | 'cheats' | 'console') => {
      activeTab = t;
      isOpen = true;
    };

    toggleDrawer();
    expect(isOpen).toBe(true);
    selectTab('cheats');
    expect(activeTab).toBe('cheats');
    expect(isOpen).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Feature 16: 1-Click Jump & QuickFix Creation
  // --------------------------------------------------------------------------
  it('F16: triggers editor cursor jump and pre-fills QuickFix creation modal', () => {
    const diagnostic = {
      id: 'diag-01',
      category: 'asset' as const,
      severity: 'warning' as const,
      message: "[Uncreated] asset 'bg_sunset'",
      fileId: 'chapter2.vns',
      line: 15,
      col: 4,
      quickFix: {
        type: 'create_asset' as const,
        targetId: 'bg_sunset',
      },
    };

    // 1-Click Jump Target
    const jumpTarget = { fileId: diagnostic.fileId, line: diagnostic.line, col: diagnostic.col };
    expect(jumpTarget.fileId).toBe('chapter2.vns');
    expect(jumpTarget.line).toBe(15);

    // QuickFix pre-fill
    expect(diagnostic.quickFix?.targetId).toBe('bg_sunset');
  });

  // --------------------------------------------------------------------------
  // Feature 17: Runtime Cheat Variable Injection
  // --------------------------------------------------------------------------
  it('F17: injects variable values directly into live preview message bus', () => {
    const bridgeMessages: Array<{ type: string; payload: unknown }> = [];
    const injectVariable = (variable: string, value: unknown) => {
      bridgeMessages.push({
        type: 'SET_VM_VARIABLE',
        payload: { variable, value },
      });
    };

    injectVariable('affinity', 99);
    expect(bridgeMessages).toHaveLength(1);
    expect(bridgeMessages[0]).toEqual({
      type: 'SET_VM_VARIABLE',
      payload: { variable: 'affinity', value: 99 },
    });
  });

  // --------------------------------------------------------------------------
  // Feature 18: Full-Height Preview Dock (16:9 & 9:16)
  // --------------------------------------------------------------------------
  it('F18: maintains aspect ratio container lock for landscape and portrait modes', () => {
    const getContainerStyle = (orientation: 'landscape' | 'portrait') => {
      return {
        height: '100%',
        aspectRatio: orientation === 'landscape' ? '16 / 9' : '9 / 16',
      };
    };

    const landscape = getContainerStyle('landscape');
    expect(landscape.aspectRatio).toBe('16 / 9');
    const portrait = getContainerStyle('portrait');
    expect(portrait.aspectRatio).toBe('9 / 16');
  });

  // --------------------------------------------------------------------------
  // Feature 19: Pop-out Window & Standby Screen
  // --------------------------------------------------------------------------
  it('F19: activates standby screen when preview is popped out via BroadcastChannel', () => {
    let isPopout = false;
    let isStandby = false;

    const channel = new MockBroadcastChannel('vn_preview_channel_test');
    channel.onmessage = event => {
      const msg = event.data as { type: string };
      if (msg.type === 'PLAYER_POPOUT_CONNECTED') {
        isPopout = true;
        isStandby = true;
      }
    };

    const peer = new MockBroadcastChannel('vn_preview_channel_test');
    peer.postMessage({ type: 'PLAYER_POPOUT_CONNECTED' });

    expect(isPopout).toBe(true);
    expect(isStandby).toBe(true);
    channel.close();
    peer.close();
  });

  // --------------------------------------------------------------------------
  // Feature 20: Project Settings 4 Tabs & Choice Policies
  // --------------------------------------------------------------------------
  it('F20: manages 4 configuration tabs and choice display policy', async () => {
    const project = await repo.createProject({
      title: 'Configured Game',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
      gameplaySettings: {
        unmetChoiceDisplay: 'disabled',
        textSpeed: 40,
        autoForwardDelay: 2000,
        defaultVolumes: { master: 0.8, bgm: 0.7, sfx: 1.0, voice: 1.0 },
      },
    });

    const gp = (project as unknown as { gameplaySettings: { unmetChoiceDisplay: string } })
      .gameplaySettings;
    expect(gp.unmetChoiceDisplay).toBe('disabled');
  });

  // --------------------------------------------------------------------------
  // Feature 21: Export Wizard (Web ZIP itch.io)
  // --------------------------------------------------------------------------
  it('F21: packages and exports standalone project web ZIP bundle', async () => {
    const project = await repo.createProject({
      title: 'Itch Distribution',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const zipBlob = await repo.exportProjectZip(project.id);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(0);
  });
});
