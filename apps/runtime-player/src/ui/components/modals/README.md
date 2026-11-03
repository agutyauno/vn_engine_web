# UI Modals

## Overview

Houses modal dialogs and slide-out drawers for user interaction during gameplay: dialogue backlog history, script desynchronization resolution, audio/text configuration, and save/load management.

## Interface

- `BacklogDrawer(): JSX.Element`: Slide-out panel listing dialogue history with optional voice replay.
- `DesyncModalProps`: Configuration properties containing `DesyncModalData`.
- `DesyncModal(props: DesyncModalProps): JSX.Element`: Prompt warning player when a loaded save differs from current script hashes.
- `GameSettingsModal(): JSX.Element`: Configuration dialog for text speed, auto delay, and audio volume sliders.
- `SaveLoadModalProps`: Modal mode configuration (`mode: 'save' | 'load'`).
- `SaveLoadModal({ mode }: SaveLoadModalProps): JSX.Element`: Grid view of 6 save slots showing scene name, timestamp, and text preview.

## Invariants

- All modal components retrieve state and dispatch actions via `usePlayerState` and `usePlayerActions`.
- `SaveLoadModal` manages exactly 6 slots (1-indexed for player display and storage).
- `DesyncModal` offers three explicit choices (`continue`, `restart`, `cancel`) without blocking UI responsiveness.
- All interactive buttons include `aria-label` and `title` attributes for accessibility.

## Side Effects

- Invokes actions that mutate `PlayerViewState` (`closeModal`, `saveSlot`, `loadSlot`, `setAudioVolume`, `setTextSpeed`, `setAutoDelay`, `replayVoice`, `resolveDesync`).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
