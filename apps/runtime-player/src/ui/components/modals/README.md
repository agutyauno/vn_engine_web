# UI Modals

## Overview

Houses modal dialogs and slide-out drawers for user interaction during gameplay: dialogue backlog history, script desynchronization resolution, audio/text configuration, and save/load management.

## Interface

- `BacklogDrawer(): JSX.Element`: Slide-out panel listing dialogue history with optional voice replay.
- `DesyncModalProps`: Configuration properties containing `DesyncModalData`.
- `DesyncModal(props: DesyncModalProps): JSX.Element`: Prompt warning player when a loaded save differs from current script hashes.
- `GameSettingsModal(): JSX.Element`: Split-view settings window (`#modal-game-settings`). Left sidebar has 4 tabs (`#tab-btn-audio|text|display|shortcuts`, Audio active by default); only the active pane (`#pane-<tab>`) is rendered.
  - Audio: master/music/sound/voice sliders (`setAudioVolume` with canonical channel, percentage labels) and `#btn-toggle-mute` (`toggleMute`, Muted/Unmuted label).
  - Text & Playback: `#slider-text-speed` (`setTextSpeed`, `N chars/s`), live typewriter preview `#preview-typewriter-box`, `#slider-auto-delay` (`setAutoDelay`, `N.Ns`).
  - Display: `#btn-toggle-fullscreen`, `#btn-font-small|medium|large` (`setFontSize`), `#slider-box-opacity` (`setBoxOpacity`).
  - Shortcuts: reference-only `<kbd>` legend of controls handled by `GameplayOverlay` and `ChoiceOverlay`.
  - Footer: `#btn-restore-defaults` (`restoreDefaultSettings`), `#btn-return-title` (GAMEPLAY only, opens an inline confirm with `#btn-confirm-return` / `#btn-cancel-return`), `#btn-done-settings`.
- `SaveLoadModalProps`: Modal mode configuration (`mode: 'save' | 'load'`).
- `SaveLoadModal({ mode }: SaveLoadModalProps): JSX.Element`: Grid view of 6 save slots showing scene name, timestamp, and text preview.

## Invariants

- All modal components retrieve state and dispatch actions via `usePlayerState` and `usePlayerActions`.
- `SaveLoadModal` manages exactly 6 slots (1-indexed for player display and storage).
- `DesyncModal` offers three explicit choices (`continue`, `restart`, `cancel`) without blocking UI responsiveness.
- All interactive buttons include `aria-label` and `title` attributes for accessibility.
- `GameSettingsModal` registers its own `window` `keydown` listener in the capture phase. Escape calls `preventDefault` + `stopImmediatePropagation`, so it is handled exactly once even when `GameplayOverlay` is mounted, and it also works on the Title screen. Escape first dismisses the return-to-title confirm if open, otherwise calls `closeModal`.
- "Return to Title" is rendered only when `mode === 'GAMEPLAY'`; confirming calls `closeModal()` then `returnToTitle()`.
- The typewriter preview types the sample at `1000 / textSpeed` ms per char (min 10 ms), dwells 1500 ms, then loops; its timers are cleared when leaving the Text tab, when `textSpeed` changes, and on unmount.
- Fullscreen is toggled only when `document.fullscreenEnabled` is true; request/exit promise rejections are swallowed (iframe without `allow="fullscreen"`).

## Side Effects

- Invokes actions that mutate `PlayerViewState` (`closeModal`, `saveSlot`, `loadSlot`, `setAudioVolume`, `toggleMute`, `setTextSpeed`, `setAutoDelay`, `setFontSize`, `setBoxOpacity`, `restoreDefaultSettings`, `returnToTitle`, `replayVoice`, `resolveDesync`).
- `GameSettingsModal` adds/removes a capture-phase `keydown` listener on `window`, runs preview `setTimeout`s while the Text tab is open, and may call the Fullscreen API on `document`.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
