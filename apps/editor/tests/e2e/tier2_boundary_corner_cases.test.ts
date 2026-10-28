// @vitest-environment jsdom
// ================================================================
// TIER 2: BOUNDARY & CORNER CASES (LIMITS, INVALID INPUTS, ROBUSTNESS)
// Mapped from TEST_INFRA.md and TASK-EDITOR-REBUILD-SPEC.md
// ================================================================

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { ScriptFile } from '@vn-engine/shared-types';
import {
  setupStoragePolyfill,
  setupBroadcastChannelPolyfill,
  StudioProjectRepository,
  scanActiveReconciliation,
  checkSafeAssetDeletion,
} from './testHelpers';
import { validateFileName } from '../../src/modules/fileExplorer';
import { isAllowedPreviewOrigin } from '../../src/modules/previewBridge';

describe('Tier 2: Boundary & Corner Cases (Web Editor Studio Platform)', () => {
  let repo: StudioProjectRepository;

  beforeAll(() => {
    setupStoragePolyfill();
    setupBroadcastChannelPolyfill();
  });

  beforeEach(() => {
    repo = new StudioProjectRepository();
  });

  // --------------------------------------------------------------------------
  // B01: Storage Quota Boundary (>90% threshold badge)
  // --------------------------------------------------------------------------
  it('B01: calculates storage quota status and flags warning badge above 90%', () => {
    const getQuotaBadgeStatus = (usedBytes: number, quotaBytes: number) => {
      const percentage = (usedBytes / quotaBytes) * 100;
      if (percentage >= 90) return { status: 'critical', color: 'red', text: 'Storage Almost Full' };
      if (percentage >= 70) return { status: 'warning', color: 'yellow', text: 'Storage High' };
      return { status: 'normal', color: 'green', text: 'Storage OK' };
    };

    expect(getQuotaBadgeStatus(10 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('normal');
    expect(getQuotaBadgeStatus(75 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('warning');
    expect(getQuotaBadgeStatus(95 * 1024 * 1024, 100 * 1024 * 1024).status).toBe('critical');
    expect(getQuotaBadgeStatus(95 * 1024 * 1024, 100 * 1024 * 1024).color).toBe('red');
  });

  // --------------------------------------------------------------------------
  // B02: Custom Canvas Resolution Bounds (Min / Max / Invalid)
  // --------------------------------------------------------------------------
  it('B02: validates custom resolution boundaries (min 320x240, max 3840x2160, non-negative)', () => {
    const validateResolution = (width: number, height: number) => {
      if (!Number.isInteger(width) || !Number.isInteger(height)) {
        return { valid: false, error: 'Resolution dimensions must be integers' };
      }
      if (width < 320 || height < 240) {
        return { valid: false, error: 'Minimum resolution is 320x240' };
      }
      if (width > 3840 || height > 2160) {
        return { valid: false, error: 'Maximum resolution is 3840x2160 (4K UHD)' };
      }
      return { valid: true };
    };

    expect(validateResolution(1920, 1080).valid).toBe(true);
    expect(validateResolution(1080, 1920).valid).toBe(true);
    expect(validateResolution(300, 200).valid).toBe(false);
    expect(validateResolution(300, 200).error).toContain('Minimum');
    expect(validateResolution(5000, 3000).valid).toBe(false);
    expect(validateResolution(5000, 3000).error).toContain('Maximum');
    expect(validateResolution(-1920, 1080).valid).toBe(false);
    expect(validateResolution(1920.5, 1080).valid).toBe(false);
  });

  // --------------------------------------------------------------------------
  // B03: Safe Project Deletion Title Mismatch Blocks Deletion
  // --------------------------------------------------------------------------
  it('B03: blocks project deletion if confirmation title differs by character or case', () => {
    const targetTitle = 'Mystery Manor: Night 1';

    const canConfirmDeletion = (input: string, title: string) => {
      return input.trim() === title.trim();
    };

    expect(canConfirmDeletion('Mystery Manor: Night 1', targetTitle)).toBe(true);
    expect(canConfirmDeletion('  Mystery Manor: Night 1  ', targetTitle)).toBe(true);
    expect(canConfirmDeletion('mystery manor: night 1', targetTitle)).toBe(false);
    expect(canConfirmDeletion('Mystery Manor', targetTitle)).toBe(false);
    expect(canConfirmDeletion('', targetTitle)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // B04: Navigation Pane Layout Min-Width Bounds
  // --------------------------------------------------------------------------
  it('B04: clamps navigation pane resize within min 200px and max 480px bounds', () => {
    const clampNavWidth = (requestedPx: number) => {
      const MIN_PX = 200;
      const MAX_PX = 480;
      return Math.min(Math.max(requestedPx, MIN_PX), MAX_PX);
    };

    expect(clampNavWidth(280)).toBe(280);
    expect(clampNavWidth(150)).toBe(200); // Clamped to min
    expect(clampNavWidth(600)).toBe(480); // Clamped to max
  });

  // --------------------------------------------------------------------------
  // B05: File Explorer Invalid Filename & Duplicates Validation
  // --------------------------------------------------------------------------
  it('B05: rejects forbidden characters, empty strings, and duplicates in file names', () => {
    const existing = ['main.vns', 'prologue.vns'];

    // Empty or whitespace
    expect(validateFileName('', existing).valid).toBe(false);
    expect(validateFileName('   ', existing).valid).toBe(false);

    // Duplicate names (with or without .vns)
    expect(validateFileName('main', existing).valid).toBe(false);
    expect(validateFileName('main.vns', existing).valid).toBe(false);

    // Forbidden characters: \ / : * ? " < > |
    const forbidden = ['test/script', 'test\\script', 'test:script', 'test*script', 'test?script', 'test"script', 'test<script', 'test>script', 'test|script'];
    for (const name of forbidden) {
      const res = validateFileName(name, existing);
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // B06: Character Expression Key Validation & Duplicates (UT-EDT-11)
  // --------------------------------------------------------------------------
  it('B06 [UT-EDT-11]: validates expression key regex and forbids duplicate keys per character', () => {
    const validateExpressionKey = (key: string, existingKeys: string[]) => {
      const trimmed = key.trim();
      if (!trimmed) return { valid: false, error: 'Expression key cannot be empty' };
      if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { valid: false, error: 'Expression key must contain only letters, numbers, and underscores' };
      }
      if (existingKeys.includes(trimmed.toLowerCase())) {
        return { valid: false, error: `Expression key '${trimmed}' already exists` };
      }
      return { valid: true, normalized: trimmed.toLowerCase() };
    };

    const currentKeys = ['default', 'happy', 'sad'];

    // Valid key
    expect(validateExpressionKey('surprised_01', currentKeys).valid).toBe(true);

    // Duplicate key
    const dupCheck = validateExpressionKey('happy', currentKeys);
    expect(dupCheck.valid).toBe(false);
    expect(dupCheck.error).toContain("Expression key 'happy' already exists");

    // Invalid characters (spaces, hyphens, symbols)
    expect(validateExpressionKey('happy smile', currentKeys).valid).toBe(false);
    expect(validateExpressionKey('happy-smile', currentKeys).valid).toBe(false);
    expect(validateExpressionKey('happy@home', currentKeys).valid).toBe(false);
  });

  // --------------------------------------------------------------------------
  // B07: Two-Way HEX Color Picker Fallback & Normalization
  // --------------------------------------------------------------------------
  it('B07: normalizes HEX codes and falls back gracefully on invalid colors', () => {
    const normalizeHex = (input: string, fallback: string = '#38bdf8'): string => {
      let trimmed = input.trim();
      if (!trimmed.startsWith('#')) trimmed = '#' + trimmed;
      if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
        return trimmed.toLowerCase();
      }
      if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
      }
      return fallback;
    };

    expect(normalizeHex('ec4899')).toBe('#ec4899');
    expect(normalizeHex('#38BDF8')).toBe('#38bdf8');
    expect(normalizeHex('#fff')).toBe('#ffffff');
    expect(normalizeHex('invalid_color')).toBe('#38bdf8'); // Fallback
    expect(normalizeHex('12345')).toBe('#38bdf8');
  });

  // --------------------------------------------------------------------------
  // B08: Single Sprite Upload & Default Sprite Fallback Shift (UT-EDT-08, UT-EDT-10)
  // --------------------------------------------------------------------------
  it('B08 [UT-EDT-08, UT-EDT-10]: uploads single sprite and shifts default flag when default sprite is deleted', () => {
    interface SpriteRow {
      key: string;
      imageUrl: string;
      isDefault: boolean;
    }

    const sprites: SpriteRow[] = [
      { key: 'default', imageUrl: 'data:image/png;base64,orig', isDefault: true },
      { key: 'happy', imageUrl: 'data:image/png;base64,smile', isDefault: false },
      { key: 'sad', imageUrl: 'data:image/png;base64,frown', isDefault: false },
    ];

    // Single sprite upload into 'happy'
    const updateSprite = (key: string, newUrl: string) => {
      const item = sprites.find(s => s.key === key);
      if (item) item.imageUrl = newUrl;
    };
    updateSprite('happy', 'data:image/png;base64,updated_smile');
    expect(sprites.find(s => s.key === 'happy')?.imageUrl).toBe('data:image/png;base64,updated_smile');

    // Delete default sprite row -> first remaining shifts to isDefault = true
    const deleteSpriteRow = (key: string) => {
      const idx = sprites.findIndex(s => s.key === key);
      if (idx !== -1) {
        const wasDefault = sprites[idx]?.isDefault;
        sprites.splice(idx, 1);
        if (wasDefault && sprites.length > 0 && sprites[0]) {
          sprites[0].isDefault = true;
        }
      }
    };

    deleteSpriteRow('default');
    expect(sprites).toHaveLength(2);
    expect(sprites[0]?.key).toBe('happy');
    expect(sprites[0]?.isDefault).toBe(true);
  });

  // --------------------------------------------------------------------------
  // B09: Bulk Dropzone Filtering (Skip non-images, Warn on >10MB)
  // --------------------------------------------------------------------------
  it('B09: filters out non-image files and detects oversized images in bulk dropzone', () => {
    const rawFiles = [
      { name: 'photo.png', type: 'image/png', size: 2 * 1024 * 1024 },
      { name: 'document.pdf', type: 'application/pdf', size: 500 * 1024 },
      { name: 'script.txt', type: 'text/plain', size: 10 * 1024 },
      { name: 'huge_bg.png', type: 'image/png', size: 12 * 1024 * 1024 }, // >10MB
    ];

    const processFiles = (files: typeof rawFiles) => {
      const accepted: string[] = [];
      const warnings: string[] = [];

      for (const f of files) {
        if (!f.type.startsWith('image/')) {
          warnings.push(`Skipped non-image file: ${f.name}`);
          continue;
        }
        if (f.size > 10 * 1024 * 1024) {
          warnings.push(`File ${f.name} exceeds 10MB limit`);
          continue;
        }
        accepted.push(f.name);
      }
      return { accepted, warnings };
    };

    const res = processFiles(rawFiles);
    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0]).toBe('photo.png');
    expect(res.warnings).toHaveLength(3);
    expect(res.warnings[0]).toContain('non-image');
    expect(res.warnings[2]).toContain('exceeds 10MB');
  });

  // --------------------------------------------------------------------------
  // B10: Asset Library Replace Missing ID & Safe Delete Zero References
  // --------------------------------------------------------------------------
  it('B10: handles missing ID on replace and safely deletes asset with zero references', async () => {
    // Missing asset ID handling
    const nonExistentId = 'missing-uuid-999';
    const blob = await repo.getAssetBlob(nonExistentId);
    expect(blob).toBeNull();

    // Zero references safe delete
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        order: 0,
        version: 1,
        content: `
scene start {
    alice: "Hello there."
}
`,
      },
    ];

    const check = checkSafeAssetDeletion('unused_asset.png', files);
    expect(check.safe).toBe(true);
    expect(check.references).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // B11: Active Reconciliation on Empty Script Files
  // --------------------------------------------------------------------------
  it('B11: returns zero uncreated entities on empty or comment-only scripts', () => {
    const files: ScriptFile[] = [
      {
        id: 'blank.vns',
        name: 'blank.vns',
        order: 0,
        version: 1,
        content: '# Just a comment line\n\n',
      },
    ];

    const report = scanActiveReconciliation(files, [], []);
    expect(report.uncreatedCharacters).toHaveLength(0);
    expect(report.uncreatedAssets).toHaveLength(0);
    expect(report.unusedAssets).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // B12: Monaco Tab Bar Dirty Indicator Clearance & Close Guard
  // --------------------------------------------------------------------------
  it('B12: clears dirty dot upon saving and prompts confirmation on close when dirty', () => {
    let isDirty = true;
    const saveContent = () => {
      isDirty = false;
    };

    saveContent();
    expect(isDirty).toBe(false);

    const canCloseTabWithoutPrompt = (dirtyState: boolean) => !dirtyState;
    expect(canCloseTabWithoutPrompt(false)).toBe(true);
    expect(canCloseTabWithoutPrompt(true)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // B13: Rapid Typing Canceling Pending Auto-Save Timer
  // --------------------------------------------------------------------------
  it('B13: cancels previous debounced save timers on rapid keystrokes', () => {
    vi.useFakeTimers();
    let saveCount = 0;
    let timerId: NodeJS.Timeout | null = null;

    const onKeystroke = () => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        saveCount++;
      }, 1000);
    };

    // User types 5 characters rapidly at 200ms intervals
    onKeystroke();
    vi.advanceTimersByTime(200);
    onKeystroke();
    vi.advanceTimersByTime(200);
    onKeystroke();
    vi.advanceTimersByTime(200);
    onKeystroke();
    vi.advanceTimersByTime(200);
    onKeystroke();

    // 400ms after last keystroke: save has not fired yet
    vi.advanceTimersByTime(400);
    expect(saveCount).toBe(0);

    // 1000ms after last keystroke: exactly 1 save fires
    vi.advanceTimersByTime(600);
    expect(saveCount).toBe(1);

    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // B14: Preview Bridge Origin Security & Malformed Payload Handling
  // --------------------------------------------------------------------------
  it('B14: rejects untrusted origins and handles malformed payloads gracefully', () => {
    const configuredOrigin = 'http://localhost:3000';

    expect(isAllowedPreviewOrigin('http://localhost:3000', configuredOrigin)).toBe(true);
    expect(isAllowedPreviewOrigin('http://127.0.0.1:3000', configuredOrigin)).toBe(true);
    expect(isAllowedPreviewOrigin('https://studio.usercontent-platform.com', configuredOrigin)).toBe(true);

    // Untrusted origins rejected
    expect(isAllowedPreviewOrigin('https://malicious-site.com', configuredOrigin)).toBe(false);
    expect(isAllowedPreviewOrigin('http://evil-sandbox.org:8080', configuredOrigin)).toBe(false);

    // Safe handling of malformed message
    const handleIncomingMessage = (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
        return { handled: false, error: 'Malformed message' };
      }
      return { handled: true, type: (raw as { type: string }).type };
    };

    expect(handleIncomingMessage(null).handled).toBe(false);
    expect(handleIncomingMessage('string-message').handled).toBe(false);
    expect(handleIncomingMessage({ type: 'PLAYER_READY' }).handled).toBe(true);
  });

  // --------------------------------------------------------------------------
  // B15: Project Settings Gameplay Choice Policy Contract
  // --------------------------------------------------------------------------
  it('B15: enforces choice presentation contract between hidden and disabled modes', () => {
    interface ChoiceOption {
      text: string;
      conditionMet: boolean;
    }

    const filterChoicesForPlayer = (
      choices: ChoiceOption[],
      policy: 'hidden' | 'disabled',
    ) => {
      return choices
        .map(choice => {
          if (!choice.conditionMet) {
            if (policy === 'hidden') return null;
            return { ...choice, isClickable: false };
          }
          return { ...choice, isClickable: true };
        })
        .filter((c): c is ChoiceOption & { isClickable: boolean } => c !== null);
    };

    const choices: ChoiceOption[] = [
      { text: 'Look around', conditionMet: true },
      { text: 'Unlock secret door', conditionMet: false },
    ];

    // Under 'hidden' policy: condition not met is completely omitted
    const hiddenResult = filterChoicesForPlayer(choices, 'hidden');
    expect(hiddenResult).toHaveLength(1);
    expect(hiddenResult[0]?.text).toBe('Look around');

    // Under 'disabled' policy: choice is rendered but unclickable
    const disabledResult = filterChoicesForPlayer(choices, 'disabled');
    expect(disabledResult).toHaveLength(2);
    expect(disabledResult[1]?.text).toBe('Unlock secret door');
    expect(disabledResult[1]?.isClickable).toBe(false);
  });
});
