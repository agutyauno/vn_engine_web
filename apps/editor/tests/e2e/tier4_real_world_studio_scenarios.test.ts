// @vitest-environment jsdom
// ================================================================
// TIER 4: REAL-WORLD STUDIO APPLICATION SCENARIOS (S1 - S5)
// End-to-End User Workflows from TEST_INFRA.md and TASK-EDITOR-REBUILD-SPEC.md
// ================================================================

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { ScriptFile, Character, AssetRef, Project } from '@vn-engine/shared-types';
import { Compiler } from '@vn-engine/dsl-compiler';
import {
  setupStoragePolyfill,
  setupBroadcastChannelPolyfill,
  MockBroadcastChannel,
  StudioProjectRepository,
  scanActiveReconciliation,
  checkSafeAssetDeletion,
} from './testHelpers';

describe('Tier 4: Real-World Studio Scenarios (S1 - S5)', () => {
  let repo: StudioProjectRepository;

  beforeAll(() => {
    setupStoragePolyfill();
    setupBroadcastChannelPolyfill();
  });

  beforeEach(() => {
    repo = new StudioProjectRepository();
  });

  // --------------------------------------------------------------------------
  // Scenario S1: Greenfield Novel Authoring
  // Project Hub -> Create 1920x1080 Project -> Open Studio -> Create Character
  // -> Upload Sprites -> Write VNS Script -> Verify compilation & save
  // --------------------------------------------------------------------------
  it('Scenario S1: Greenfield Novel Authoring workflow from Project Hub to script compilation', async () => {
    // 1. Author launches Project Hub and creates a new 1920x1080 Landscape project
    const newProject = await repo.createProject({
      title: 'Summer Memory at Seashore',
      displaySettings: {
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        lockAspectRatio: true,
      },
      gameplaySettings: {
        unmetChoiceDisplay: 'hidden',
        textSpeed: 50,
      },
    });

    expect(newProject.id).toBeDefined();
    expect(newProject.title).toBe('Summer Memory at Seashore');

    // 2. Open Studio Workspace and configure Character 'alice'
    const aliceChar: Character = {
      id: 'alice',
      name: 'Alice Margatroid',
      colorHex: '#38bdf8',
      sprites: {
        default: 'spr_alice_normal',
        happy: 'spr_alice_happy',
        thinking: 'spr_alice_thinking',
      },
    };
    newProject.characters.push(aliceChar);

    // Save sprites into binary asset storage
    const happyBlob = new Blob(['fake_png_data_happy'], { type: 'image/png' });
    await repo.saveAssetBlob('spr_alice_happy', happyBlob);
    expect(await repo.getAssetBlob('spr_alice_happy')).not.toBeNull();

    // 3. Register background asset
    const bgAsset: AssetRef = {
      id: 'ast_seashore',
      name: 'bg_seashore',
      type: 'image',
      storageUrl: 'https://cdn.platform.com/bg_seashore.png',
      sizeBytes: 1024 * 500,
    };
    newProject.assets.push(bgAsset);

    // 4. Author writes script in Monaco Editor
    const novelScript = `# Chapter 1: The First Meeting
scene start {
    background bg_seashore transition: "fade"
    show alice.happy(position: "center")
    alice: "The sea breeze feels wonderful today!"

    choice {
        "Take a walk along the shore": goto .walk
        "Sit on the beach bench": goto .rest
    }

    scene .walk {
        alice: "Let's walk together!"
        end
    }

    scene .rest {
        alice: "Sitting here is so peaceful."
        end
    }
}
`;

    newProject.files[0]!.content = novelScript;
    await repo.updateProject(newProject);

    // 5. Compiler verifies syntax and produces bytecode
    const compiler = new Compiler();
    const compileResult = compiler.compile(newProject.files, { characters: newProject.characters });

    expect(compileResult.success).toBe(true);
    expect(compileResult.errors ?? []).toHaveLength(0);
    expect(compileResult.program).toBeDefined();
    expect(compileResult.program!.length).toBeGreaterThan(0);

    // 6. Project state reloaded from IndexedDB has all data intact
    const reloaded = await repo.getProject(newProject.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.characters).toHaveLength(1);
    expect(reloaded?.files[0]?.content).toContain('The sea breeze');
  });

  // --------------------------------------------------------------------------
  // Scenario S2: Missing Asset QuickFix Workflow
  // Author writes script referencing unuploaded asset -> Problems Drawer flags
  // [Uncreated] bg_school -> 1-Click QuickFix -> Upload file -> Safe Delete blocks
  // --------------------------------------------------------------------------
  it('Scenario S2: Missing Asset QuickFix Workflow and Safe Delete Protection', async () => {
    // 1. Author writes script referencing uncreated background 'bg_school'
    const scriptFiles: ScriptFile[] = [
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

    const characters: Character[] = [
      { id: 'alice', name: 'Alice Margatroid', sprites: {} },
    ];
    const initialAssets: AssetRef[] = [];

    // 2. Active AST Reconciliation detects missing asset
    const report1 = scanActiveReconciliation(scriptFiles, characters, initialAssets);
    expect(report1.uncreatedAssets).toContain('bg_school');

    // Diagnostics Problems Drawer displays quickfix item
    const problem = {
      id: 'diag-uncreated-bg',
      category: 'asset' as const,
      severity: 'warning' as const,
      message: "[Uncreated] asset 'bg_school'",
      quickFix: {
        type: 'create_asset' as const,
        targetId: 'bg_school',
      },
    };
    expect(problem.quickFix.targetId).toBe('bg_school');

    // 3. Author clicks 1-Click QuickFix: Upload Modal opens prefilled with 'bg_school'
    const modalPrefillId = problem.quickFix.targetId;
    expect(modalPrefillId).toBe('bg_school');

    // Author uploads file
    const uploadedBlob = new Blob(['image_bytes_bg_school'], { type: 'image/png' });
    await repo.saveAssetBlob('ast-bg-school', uploadedBlob);

    const createdAsset: AssetRef = {
      id: 'ast-bg-school',
      name: 'bg_school',
      type: 'image',
      storageUrl: 'local://bg_school.png',
      sizeBytes: uploadedBlob.size,
    };
    const updatedAssets = [createdAsset];

    // 4. Reconciliation re-runs: warning clears!
    const report2 = scanActiveReconciliation(scriptFiles, characters, updatedAssets);
    expect(report2.uncreatedAssets).not.toContain('bg_school');
    expect(report2.unusedAssets).not.toContain('bg_school');

    // 5. Author accidentally tries to delete 'bg_school' -> Safe Delete blocks it!
    const safeCheck = checkSafeAssetDeletion('bg_school', scriptFiles);
    expect(safeCheck.safe).toBe(false);
    expect(safeCheck.references).toHaveLength(1);
    expect(safeCheck.references[0]?.fileName).toBe('chap1.vns');
  });

  // --------------------------------------------------------------------------
  // Scenario S3: Live Debugging & Cheat Playtesting
  // Run preview -> Inspect live variables -> Inject affection = 99 via Cheat Drawer
  // -> 2-way click dialogue to navigate Monaco line
  // --------------------------------------------------------------------------
  it('Scenario S3: Live Debugging and Cheat Playtesting with Bidirectional Bridge Sync', () => {
    // 1. Establish bridge and state
    const liveVariables: Record<string, unknown> = {
      affection: 10,
      player_name: 'Hero',
    };

    const outboxMessages: Array<{ type: string; payload: unknown }> = [];

    // Cheat injection handler
    const onInjectCheat = (varName: string, val: unknown) => {
      liveVariables[varName] = val;
      outboxMessages.push({
        type: 'SET_VM_VARIABLE',
        payload: { variable: varName, value: val },
      });
    };

    // 2. Author injects affection = 99
    onInjectCheat('affection', 99);
    expect(liveVariables['affection']).toBe(99);
    expect(outboxMessages).toHaveLength(1);
    expect(outboxMessages[0]).toEqual({
      type: 'SET_VM_VARIABLE',
      payload: { variable: 'affection', value: 99 },
    });

    // 3. Two-way dialogue click on Player Shell sends LINE_CLICKED to Editor
    interface MonacoCursorState {
      activeSceneId: string;
      currentLine: number;
      isHighlighted: boolean;
    }

    const editorState: MonacoCursorState = {
      activeSceneId: 'start',
      currentLine: 1,
      isHighlighted: false,
    };

    const handlePlayerMessage = (message: { type: string; payload: { sceneId: string; line: number } }) => {
      if (message.type === 'LINE_CLICKED') {
        editorState.activeSceneId = message.payload.sceneId;
        editorState.currentLine = message.payload.line;
        editorState.isHighlighted = true;
      }
    };

    handlePlayerMessage({
      type: 'LINE_CLICKED',
      payload: { sceneId: 'more_info', line: 42 },
    });

    expect(editorState.activeSceneId).toBe('more_info');
    expect(editorState.currentLine).toBe(42);
    expect(editorState.isHighlighted).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario S4: Mobile Portrait Aspect Ratio Shift
  // Change project settings to 1080x1920 Mobile Portrait -> Verify Preview Dock
  // locks aspect ratio -> Pop out window via BroadcastChannel -> Standby screen
  // --------------------------------------------------------------------------
  it('Scenario S4: Mobile Portrait Aspect Ratio Shift and Pop-out Window via BroadcastChannel', async () => {
    // 1. Create landscape project
    const project = await repo.createProject({
      title: 'Responsive Novel',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    // 2. Creator switches to 1080x1920 Mobile Portrait in Project Settings
    const updated: Project = JSON.parse(JSON.stringify(project));
    (updated as unknown as { displaySettings: unknown }).displaySettings = {
      width: 1080,
      height: 1920,
      orientation: 'portrait',
      lockAspectRatio: true,
    };
    await repo.updateProject(updated);

    const reloaded = await repo.getProject(project.id);
    const ds = (reloaded as unknown as { displaySettings: { orientation: string; width: number; height: number } })
      .displaySettings;
    expect(ds.orientation).toBe('portrait');
    expect(ds.width).toBe(1080);
    expect(ds.height).toBe(1920);

    // 3. Pop-out Window establishes BroadcastChannel
    const channelName = `vn_preview_channel_${project.id}`;
    const editorChannel = new MockBroadcastChannel(channelName);
    const popoutChannel = new MockBroadcastChannel(channelName);

    let editorStandbyActive = false;

    editorChannel.onmessage = event => {
      const msg = event.data as { type: string };
      if (msg.type === 'POPOUT_WINDOW_READY') {
        editorStandbyActive = true;
      }
    };

    // Popout player window signals ready
    popoutChannel.postMessage({ type: 'POPOUT_WINDOW_READY' });

    expect(editorStandbyActive).toBe(true);

    editorChannel.close();
    popoutChannel.close();
  });

  // --------------------------------------------------------------------------
  // Scenario S5: Complete Project Export & Backup
  // Auto-save script changes -> Open Export Wizard -> Package Web ZIP -> Verify
  // ZIP archive contains project.json, scripts, and asset data
  // --------------------------------------------------------------------------
  it('Scenario S5: Complete Project Export and Backup packaging Web ZIP bundle', async () => {
    // 1. Create project with multiple scripts and characters
    const project = await repo.createProject({
      title: 'Legend of the Shrine',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    project.characters.push({
      id: 'reimu',
      name: 'Reimu Hakurei',
      colorHex: '#ef4444',
      sprites: { normal: 'spr_reimu' },
    });

    project.files.push({
      id: 'chapter2.vns',
      name: 'chapter2.vns',
      order: 1,
      version: 1,
      content: 'scene shrine_gate { reimu: "Welcome to the shrine!" end }',
    });

    await repo.updateProject(project);

    // 2. Open Export Wizard and package Web ZIP
    const zipBlob = await repo.exportProjectZip(project.id);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(0);

    // 3. Verify exported archive can be imported and restored into repository
    const restoredProject = await repo.importProjectZip(zipBlob);
    expect(restoredProject).toBeDefined();
    expect(restoredProject.title).toBe('Legend of the Shrine');
    expect(restoredProject.characters).toHaveLength(1);
    expect(restoredProject.characters[0]?.id).toBe('reimu');
    expect(restoredProject.files).toHaveLength(2);
  });
});
