import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions, SaveSlotData } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { SaveLoadModal } from '../src/ui/components/modals/SaveLoadModal';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';

function createMockSlot(overrides: Partial<SaveSlotData> = {}): SaveSlotData {
  return {
    slotIndex: 1,
    timestamp: 1700000000000,
    thumbnailDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    currentScene: 'chapter_prologue',
    previewText: 'A journey begins under the starry sky.',
    speakerName: 'Narrator',
    dialogueCounter: 15,
    serializedState: '{"vm":{"step":15}}',
    ...overrides,
  };
}

function createMockState(overrides: Partial<PlayerViewState> = {}): PlayerViewState {
  return {
    mode: 'GAMEPLAY',
    playbackMode: 'NORMAL',
    isControlsHidden: false,
    isCleanArtMode: false,
    isAwaitingPauseAdvance: false,
    dialogue: {
      isVisible: true,
      speakerName: 'Alice',
      speakerColorHex: '#38bdf8',
      rawText: 'Welcome to TaleForge!',
      isComplete: false,
      canAdvance: true,
      isSeen: false,
    },
    activeChoices: null,
    activeInspectModal: null,
    activeModal: 'none',
    settings: {
      textSpeed: 40,
      autoDelayMs: 1500,
      fontSize: 'medium',
      boxOpacity: 0.85,
    },
    activeToast: null,
    titleConfig: { title: 'Visual Novel' },
    hasSaveData: false,
    pendingConfirm: null,
    audio: {
      masterVolume: 1.0,
      channelVolumes: {
        music: 0.8,
        sound: 0.8,
        voice: 1.0,
        ambience: 1.0,
      },
      isMuted: false,
      currentTracks: {},
    },
    backlog: [],
    saveSlots: [null, null, null, null, null, null],
    quickSaveSlot: null,
    ...overrides,
  };
}

function createMockActions(overrides: Partial<PlayerUIActions> = {}): PlayerUIActions {
  return {
    startNewGame: vi.fn(),
    returnToTitle: vi.fn(),
    advance: vi.fn(),
    completeDialogue: vi.fn(),
    selectChoice: vi.fn(),
    rollback: vi.fn(),
    toggleAuto: vi.fn(),
    toggleSkip: vi.fn(),
    toggleHideControls: vi.fn(),
    toggleCleanArt: vi.fn(),
    toggleMute: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    closeInspect: vi.fn(),
    setAudioVolume: vi.fn(),
    setTextSpeed: vi.fn(),
    setAutoDelay: vi.fn(),
    setFontSize: vi.fn(),
    setBoxOpacity: vi.fn(),
    restoreDefaultSettings: vi.fn(),
    showToast: vi.fn(),
    saveSlot: vi.fn().mockResolvedValue(undefined),
    loadSlot: vi.fn().mockResolvedValue(undefined),
    quickSave: vi.fn().mockResolvedValue(undefined),
    quickLoad: vi.fn().mockResolvedValue(undefined),
    replayVoice: vi.fn(),
    resolveDesync: vi.fn(),
    continueGame: vi.fn().mockResolvedValue(undefined),
    deleteSlot: vi.fn().mockResolvedValue(undefined),
    confirmPending: vi.fn().mockResolvedValue(undefined),
    cancelPending: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

function renderSaveLoadModal(
  mode: 'save' | 'load' = 'save',
  stateOverrides: Partial<PlayerViewState> = {},
  actions: PlayerUIActions = createMockActions(),
) {
  const state = createMockState(stateOverrides);
  const utils = render(
    <PlayerUIProvider state={state} actions={actions}>
      <SaveLoadModal mode={mode} />
    </PlayerUIProvider>,
  );
  return { ...utils, actions, state };
}

function q<T extends Element = HTMLElement>(container: Element, selector: string): T {
  const el = container.querySelector<T>(selector);
  expect(el, `expected "${selector}" to be rendered`).not.toBeNull();
  return el!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Phase T6: SaveLoadModal grid & guards (RED phase)', () => {
  describe('Requirement 1 & Contract UI: Grid structure and header', () => {
    it('renders #modal-saveload backdrop, #btn-close-modal, and exactly 6 .save-slot-card elements', () => {
      const { container } = renderSaveLoadModal('save');

      expect(container.querySelector('#modal-saveload')).not.toBeNull();
      expect(container.querySelector('#btn-close-modal')).not.toBeNull();
      const cards = container.querySelectorAll('.save-slot-card');
      expect(cards.length).toBe(6);
    });

    it('renders <h2>Save Game</h2> when mode is "save"', () => {
      const { container } = renderSaveLoadModal('save');
      const heading = q(container, 'h2');
      expect(heading.textContent).toContain('Save Game');
    });

    it('renders <h2>Load Game</h2> when mode is "load"', () => {
      const { container } = renderSaveLoadModal('load');
      const heading = q(container, 'h2');
      expect(heading.textContent).toContain('Load Game');
    });

    it('renders a badge with .slot-badge and text "SLOT <n>" on every card', () => {
      const { container } = renderSaveLoadModal('save');
      const cards = container.querySelectorAll('.save-slot-card');
      expect(cards.length).toBe(6);

      cards.forEach((card, idx) => {
        const badge = card.querySelector('.slot-badge');
        expect(badge, `expected .slot-badge on card ${idx + 1}`).not.toBeNull();
        expect(badge!.textContent?.trim()).toBe(`SLOT ${idx + 1}`);
      });
    });
  });

  describe('Requirement 2: Card contents for populated vs empty slots', () => {
    it('renders populated card with .slot-scene, .slot-date, and img.slot-thumbnail when thumbnailDataUrl is non-empty', () => {
      const thumb =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const slot1 = createMockSlot({
        slotIndex: 1,
        currentScene: 'chapter_ruins',
        timestamp: 1710000000000,
        thumbnailDataUrl: thumb,
      });

      const { container } = renderSaveLoadModal('save', {
        saveSlots: [slot1, null, null, null, null, null],
      });

      const card = container.querySelectorAll('.save-slot-card')[0]!;
      const scene = card.querySelector('.slot-scene');
      expect(scene).not.toBeNull();
      expect(scene!.textContent).toContain('chapter_ruins');

      const date = card.querySelector('.slot-date');
      expect(date).not.toBeNull();
      expect((date!.textContent ?? '').trim().length).toBeGreaterThan(0);

      const img = card.querySelector<HTMLImageElement>('img.slot-thumbnail');
      expect(img).not.toBeNull();
      expect(img!.src).toBe(thumb);
      expect(card.querySelector('.slot-thumbnail-placeholder')).toBeNull();
    });

    it('renders .slot-thumbnail-placeholder instead of img.slot-thumbnail when thumbnailDataUrl is empty', () => {
      const slot1 = createMockSlot({ slotIndex: 1, thumbnailDataUrl: '' });
      const { container } = renderSaveLoadModal('save', {
        saveSlots: [slot1, null, null, null, null, null],
      });

      const card = container.querySelectorAll('.save-slot-card')[0]!;
      expect(card.querySelector('img.slot-thumbnail')).toBeNull();
      expect(card.querySelector('.slot-thumbnail-placeholder')).not.toBeNull();
    });

    it('renders empty card with .slot-empty-label text "Empty Slot" and no scene/date/thumbnail', () => {
      const { container } = renderSaveLoadModal('save', {
        saveSlots: [null, null, null, null, null, null],
      });

      const card = container.querySelectorAll('.save-slot-card')[0]!;
      const emptyLabel = card.querySelector('.slot-empty-label');
      expect(emptyLabel).not.toBeNull();
      expect(emptyLabel!.textContent?.trim()).toBe('Empty Slot');

      expect(card.querySelector('.slot-scene')).toBeNull();
      expect(card.querySelector('.slot-date')).toBeNull();
      expect(card.querySelector('img.slot-thumbnail')).toBeNull();
      expect(card.querySelector('.slot-thumbnail-placeholder')).toBeNull();
    });

    it('renders button.btn-delete-slot with aria-label="Delete slot <n>" only on occupied cards', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const slot2 = createMockSlot({ slotIndex: 2 });
      const { container } = renderSaveLoadModal('save', {
        saveSlots: [slot1, slot2, null, null, null, null],
      });

      const cards = container.querySelectorAll('.save-slot-card');

      const delBtn1 = cards[0]!.querySelector('button.btn-delete-slot');
      expect(delBtn1).not.toBeNull();
      expect(delBtn1!.getAttribute('aria-label')).toBe('Delete slot 1');

      const delBtn2 = cards[1]!.querySelector('button.btn-delete-slot');
      expect(delBtn2).not.toBeNull();
      expect(delBtn2!.getAttribute('aria-label')).toBe('Delete slot 2');

      const delBtn3 = cards[2]!.querySelector('button.btn-delete-slot');
      expect(delBtn3).toBeNull();
    });
  });

  describe('Requirement 3: Empty slot actions', () => {
    it('in "save" mode: clicking an empty slot calls saveSlot(n) immediately without confirmation', () => {
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [null, null, null, null, null, null] },
        actions,
      );

      const card3 = container.querySelectorAll('.save-slot-card')[2]!;
      fireEvent.click(card3);

      expect(vi.mocked(actions.saveSlot)).toHaveBeenCalledWith(3);
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });

    it('in "load" mode: clicking an empty slot does nothing and calls no actions', () => {
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'load',
        { saveSlots: [null, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(vi.mocked(actions.loadSlot)).not.toHaveBeenCalled();
      expect(vi.mocked(actions.saveSlot)).not.toHaveBeenCalled();
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });
  });

  describe('Requirement 4: Overwrite Guard (save mode on occupied slot)', () => {
    it('Confirm flow: opens #saveload-confirm with "Overwrite" message; clicking confirm calls saveSlot(n)', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(vi.mocked(actions.saveSlot)).not.toHaveBeenCalled();

      const dialog = q(container, '#saveload-confirm');
      expect(dialog.getAttribute('role')).toBe('alertdialog');

      const msg = q(container, '#saveload-confirm-message');
      expect(msg.textContent).toContain('Overwrite');

      fireEvent.click(q(container, '#btn-confirm-action'));

      expect(vi.mocked(actions.saveSlot)).toHaveBeenCalledWith(1);
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });

    it('Cancel flow: clicking cancel closes #saveload-confirm without calling saveSlot', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(container.querySelector('#saveload-confirm')).not.toBeNull();

      fireEvent.click(q(container, '#btn-cancel-action'));

      expect(container.querySelector('#saveload-confirm')).toBeNull();
      expect(vi.mocked(actions.saveSlot)).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 5: Progress Loss Guard (load mode on occupied slot)', () => {
    it('Confirm flow: in GAMEPLAY mode, opens confirm dialog with "unsaved progress"; confirm calls loadSlot(n)', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'load',
        { mode: 'GAMEPLAY', saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(vi.mocked(actions.loadSlot)).not.toHaveBeenCalled();

      const dialog = q(container, '#saveload-confirm');
      expect(dialog.getAttribute('role')).toBe('alertdialog');

      const msg = q(container, '#saveload-confirm-message');
      expect(msg.textContent).toContain('unsaved progress');

      fireEvent.click(q(container, '#btn-confirm-action'));

      expect(vi.mocked(actions.loadSlot)).toHaveBeenCalledWith(1);
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });

    it('Cancel flow: in GAMEPLAY mode, clicking cancel dismisses confirm dialog without calling loadSlot', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'load',
        { mode: 'GAMEPLAY', saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(container.querySelector('#saveload-confirm')).not.toBeNull();

      fireEvent.click(q(container, '#btn-cancel-action'));

      expect(container.querySelector('#saveload-confirm')).toBeNull();
      expect(vi.mocked(actions.loadSlot)).not.toHaveBeenCalled();
    });

    it('Bypass in TITLE mode: loads occupied slot immediately without showing confirmation dialog', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'load',
        { mode: 'TITLE', saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.click(card1);

      expect(vi.mocked(actions.loadSlot)).toHaveBeenCalledWith(1);
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });
  });

  describe('Requirement 6: Delete Guard', () => {
    it('Confirm flow: clicking delete button stops propagation, opens dialog with "Delete"; confirm calls deleteSlot(n) and does not close modal', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      const delBtn = q(card1, 'button.btn-delete-slot');
      fireEvent.click(delBtn);

      expect(vi.mocked(actions.saveSlot)).not.toHaveBeenCalled();
      expect(vi.mocked(actions.loadSlot)).not.toHaveBeenCalled();

      const dialog = q(container, '#saveload-confirm');
      expect(dialog.getAttribute('role')).toBe('alertdialog');

      const msg = q(container, '#saveload-confirm-message');
      expect(msg.textContent).toContain('Delete');

      fireEvent.click(q(container, '#btn-confirm-action'));

      expect(vi.mocked(actions.deleteSlot)).toHaveBeenCalledWith(1);
      expect(vi.mocked(actions.closeModal)).not.toHaveBeenCalled();
      expect(container.querySelector('#saveload-confirm')).toBeNull();
    });

    it('Cancel flow: clicking cancel dismisses delete dialog without calling deleteSlot', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      const delBtn = q(card1, 'button.btn-delete-slot');
      fireEvent.click(delBtn);

      expect(container.querySelector('#saveload-confirm')).not.toBeNull();

      fireEvent.click(q(container, '#btn-cancel-action'));

      expect(container.querySelector('#saveload-confirm')).toBeNull();
      expect(vi.mocked(actions.deleteSlot)).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 7: Keyboard navigation on .save-slot-card', () => {
    it('pressing Enter on focused empty card in "save" mode triggers saveSlot', () => {
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [null, null, null, null, null, null] },
        actions,
      );

      const card2 = container.querySelectorAll('.save-slot-card')[1]!;
      fireEvent.keyDown(card2, { key: 'Enter' });

      expect(vi.mocked(actions.saveSlot)).toHaveBeenCalledWith(2);
    });

    it('pressing Enter on focused occupied card in "save" mode opens overwrite confirm dialog', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.keyDown(card1, { key: 'Enter' });

      expect(container.querySelector('#saveload-confirm')).not.toBeNull();
      expect(vi.mocked(actions.saveSlot)).not.toHaveBeenCalled();
    });

    it('pressing Space on focused occupied card in "load" mode (GAMEPLAY) opens progress loss confirm dialog', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'load',
        { mode: 'GAMEPLAY', saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      const card1 = container.querySelectorAll('.save-slot-card')[0]!;
      fireEvent.keyDown(card1, { key: ' ' });

      expect(container.querySelector('#saveload-confirm')).not.toBeNull();
      expect(vi.mocked(actions.loadSlot)).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 8: Modal dismissal & Escape behavior', () => {
    it('clicking #btn-close-modal calls closeModal', () => {
      const actions = createMockActions();
      const { container } = renderSaveLoadModal('save', {}, actions);

      fireEvent.click(q(container, '#btn-close-modal'));
      expect(vi.mocked(actions.closeModal)).toHaveBeenCalledTimes(1);
    });

    it('clicking backdrop (#modal-saveload) calls closeModal, but clicking inside window does not', () => {
      const actions = createMockActions();
      const { container } = renderSaveLoadModal('save', {}, actions);

      fireEvent.click(q(container, '.modal-saveload-window'));
      expect(vi.mocked(actions.closeModal)).not.toHaveBeenCalled();

      fireEvent.click(q(container, '#modal-saveload'));
      expect(vi.mocked(actions.closeModal)).toHaveBeenCalledTimes(1);
    });

    it('Escape keydown on document.body calls closeModal when no confirmation dialog is open', () => {
      const actions = createMockActions();
      renderSaveLoadModal('save', {}, actions);

      fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true });
      expect(vi.mocked(actions.closeModal)).toHaveBeenCalledTimes(1);
    });

    it('Escape keydown when confirmation dialog is open only dismisses the dialog; second Escape closes modal', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const actions = createMockActions();
      const { container } = renderSaveLoadModal(
        'save',
        { saveSlots: [slot1, null, null, null, null, null] },
        actions,
      );

      fireEvent.click(container.querySelectorAll('.save-slot-card')[0]!);
      expect(container.querySelector('#saveload-confirm')).not.toBeNull();

      fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true });
      expect(container.querySelector('#saveload-confirm')).toBeNull();
      expect(vi.mocked(actions.closeModal)).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true });
      expect(vi.mocked(actions.closeModal)).toHaveBeenCalledTimes(1);
    });

    it('anti-double-handling: mounting GameplayOverlay and SaveLoadModal together, single Escape closes modal exactly once', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'save' });

      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
          <SaveLoadModal mode="save" />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true });
      expect(vi.mocked(actions.closeModal)).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requirement 9: Clean Monochrome Iconography and Source Hygiene', () => {
    it('contains no emoji characters in SaveLoadModal in save mode, load mode, or confirm dialog', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const { container } = renderSaveLoadModal('save', {
        saveSlots: [slot1, null, null, null, null, null],
      });

      expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);

      fireEvent.click(container.querySelectorAll('.save-slot-card')[0]!);
      expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('every button has either non-empty text content or an aria-label / title attribute', () => {
      const slot1 = createMockSlot({ slotIndex: 1 });
      const { container } = renderSaveLoadModal('save', {
        saveSlots: [slot1, null, null, null, null, null],
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.length).toBeGreaterThan(0);

      buttons.forEach(btn => {
        const text = (btn.textContent ?? '').trim();
        const hasLabel = btn.hasAttribute('aria-label') || btn.hasAttribute('title');
        expect(
          text !== '' || hasLabel,
          `button ${btn.outerHTML} lacks text and aria-label/title`,
        ).toBe(true);
      });
    });

    it('SaveLoadModal.tsx source file does not contain inline <svg> elements', () => {
      const source = readFileSync(
        resolve(__dirname, '../src/ui/components/modals/SaveLoadModal.tsx'),
        'utf-8',
      );
      expect(source).not.toContain('<svg');
    });
  });
});
