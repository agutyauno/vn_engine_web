# UI Components

## Overview

Implements the core Preact UI component tree for the visual novel player. It coordinates stage mode switching, interactive choices, typewriter dialogue text display, control bar buttons, and modal overlays.

## Interface

- `ChoiceOverlay(): JSX.Element | null`: Interactive choice list overlay with emergency rollback fallback.
- `ControlBar(): JSX.Element`: Bottom action bar for rollback, auto, skip, save menu (`#btn-save`), quick save (`#btn-qsave`), quick load (`#btn-qload`), backlog, hide UI, and settings.
- `DialogueBoxProps`: Properties for raw dialogue text and completion status.
- `DialogueBox(props: DialogueBoxProps): JSX.Element`: Clickable dialogue container supporting typewriter advancement. Binds `settings.fontSize` to a `font-${fontSize}` class on `#dialogue-text` (default `medium`) and `settings.boxOpacity` to the inline CSS custom property `--vn-dialogue-opacity` on `#dialogue-box` (default `0.85`), consumed by `.dialogue-box { background: rgba(0, 0, 0, var(--vn-dialogue-opacity, 0.85)) }` in `wireframe.css`.
- `DialogueGroup(): JSX.Element`: Compound layout binding speaker nameplate, dialogue box, and control bar.
- `GameplayOverlay(): JSX.Element`: Keyboard shortcut listener and presentation wrapper for gameplay state. Coordinates hotkeys: F5 (quick save), F9 (quick load), dialogue advance (Space, Enter, ArrowRight), rollback (ArrowLeft, PageUp), auto forward (A), skip (S, Tab), backlog (L), hide UI (H), and settings (Escape). Renders `#quickload-confirm` alertdialog when `pendingConfirm === 'quick_load_overwrite'`. Note on iframe preview: keyboard shortcuts reach the player only when the preview iframe has focus.
- `InspectModalProps`: Properties for inspected item image URL and title.
- `InspectModal(props: InspectModalProps): JSX.Element`: Modal overlay for inspecting full-screen items and graphics.
- `GameDataErrorCode`, `GameDataErrorScreenProps`, `GameDataErrorScreen(props: GameDataErrorScreenProps): JSX.Element`: Fullscreen alert screen (`#game-data-error`, `role="alert"`) displayed when game data fails to load or is not found. Renders monochrome `AlertCircleIcon`, context-specific title ('No game data found' for `not_found`, 'Could not load game data' for errors), English explanation, and `.game-data-error-code`.
- `PlayerApp(): JSX.Element`: Root Preact component rendering standby, title, or gameplay stages and active modals.
- `PreviewStandbyScreen(): JSX.Element`: Standby screen displayed when awaiting script hot-reload from the editor.
- `SpeakerNameplateProps`: Properties for speaker display name and color hex.
- `SpeakerNameplate(props: SpeakerNameplateProps): JSX.Element | null`: Speaker label displaying character name and color.
- `TitleScreen(): JSX.Element`: Main menu screen coordinating title or logo rendering with error fallback, background cover styling, Continue Game button (disabled without save data), New Game, Load Game, Settings triggers, version indicator, and audio unlock triggers.
- `ToastNotification(): JSX.Element | null`: Non-blocking pill toast notification rendered at the top-right of the stage for transient system feedback (success, info, error).
- Child Contracts:
  - `./common/README.md`: Monochrome vector SVG icon library.
  - `./modals/README.md`: Modal dialogs and drawers for backlog, desync, settings, and save/load.

## Invariants

- `PlayerApp` renders stage layers conditionally based on `PlayerViewState.mode` (`STANDBY`, `TITLE`, `GAMEPLAY`).
- `GameplayOverlay` global keyboard navigation ignores keystrokes when focus is inside text input or textarea elements.
- In `GameplayOverlay`, F5/F9 keydowns always invoke `preventDefault()`. When `activeModal === 'none'` and `pendingConfirm === null`, F5 dispatches `quickSave()` and F9 dispatches `quickLoad()`. If a modal is open or `pendingConfirm !== null`, F5/F9 only prevent default browser action without executing quickSave/quickLoad.
- When `pendingConfirm !== null`, Escape cancels the pending confirmation dialog (`cancelPending()`), while all other keys and clicks in `#bottom-click-zone` are suppressed.
- `ControlBar` places `#btn-save` directly before `#btn-qsave`, dispatching `openModal('save')`.
- `SpeakerNameplate` returns `null` when no speaker name is specified or when the string is empty.
- `SpeakerNameplate` applies `speakerColorHex` inline as `color` and `borderColor`. The kernel's default speaker color is `#ffffff`, so the `.speaker-nameplate` rule in `wireframe.css` must use a dark background (never white) and light default text so the name stays readable with the default color.
- `#dialogue-text` always carries exactly one `font-*` class (`font-small` 1rem, `font-medium` 1.15rem, `font-large` 1.35rem).
- Unsatisfied choices in `ChoiceOverlay` are disabled (`aria-disabled="true"`) and cannot be clicked.
- `TitleScreen` disables `#btn-continue` when `hasSaveData` is false and falls back from broken logo to text heading.
- `ToastNotification` returns `null` when `activeToast` is `null` or when the active toast id has been dismissed locally.
- `GameDataErrorScreen` strictly adheres to Clean Monochrome Iconography: contains no inline `<svg>` elements (imports `AlertCircleIcon` with `stroke="currentColor"`), contains zero emoji characters across all error states, and displays error codes inside `.game-data-error-code`.

## Side Effects

- Binds global `keydown` and `pointerdown` listeners on `window` (`GameplayOverlay`, `TitleScreen`).
- Triggers engine transitions through `PlayerUIActions` (`advance`, `completeDialogue`, `selectChoice`, `rollback`, `toggleAuto`, `toggleSkip`, `openModal`, `continueGame`, `startNewGame`, `unlockAudio`).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
