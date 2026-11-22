# UI Components

## Overview

Implements the core Preact UI component tree for the visual novel player. It coordinates stage mode switching, interactive choices, typewriter dialogue text display, control bar buttons, and modal overlays.

## Interface

- `ChoiceOverlay(): JSX.Element | null`: Interactive choice list overlay with emergency rollback fallback.
- `ControlBar(): JSX.Element`: Bottom action bar for rollback, auto, skip, q.save, q.load, backlog, hide UI, and settings.
- `DialogueBoxProps`: Properties for raw dialogue text and completion status.
- `DialogueBox(props: DialogueBoxProps): JSX.Element`: Clickable dialogue container supporting typewriter advancement. Binds `settings.fontSize` to a `font-${fontSize}` class on `#dialogue-text` (default `medium`) and `settings.boxOpacity` to the inline CSS custom property `--vn-dialogue-opacity` on `#dialogue-box` (default `0.85`), consumed by `.dialogue-box { background: rgba(0, 0, 0, var(--vn-dialogue-opacity, 0.85)) }` in `wireframe.css`.
- `DialogueGroup(): JSX.Element`: Compound layout binding speaker nameplate, dialogue box, and control bar.
- `GameplayOverlay(): JSX.Element`: Keyboard shortcut listener and presentation wrapper for gameplay state.
- `InspectModalProps`: Properties for inspected item image URL and title.
- `InspectModal(props: InspectModalProps): JSX.Element`: Modal overlay for inspecting full-screen items and graphics.
- `PlayerApp(): JSX.Element`: Root Preact component rendering standby, title, or gameplay stages and active modals.
- `PreviewStandbyScreen(): JSX.Element`: Standby screen displayed when awaiting script hot-reload from the editor.
- `SpeakerNameplateProps`: Properties for speaker display name and color hex.
- `SpeakerNameplate(props: SpeakerNameplateProps): JSX.Element | null`: Speaker label displaying character name and color.
- `TitleScreen(): JSX.Element`: Main menu screen with New Game, Load Game, and Settings triggers.
- `ToastNotification(): JSX.Element | null`: Non-blocking pill toast notification rendered at the top-right of the stage for transient system feedback (success, info, error).
- Child Contracts:
  - `./common/README.md`: Monochrome vector SVG icon library.
  - `./modals/README.md`: Modal dialogs and drawers for backlog, desync, settings, and save/load.

## Invariants

- `PlayerApp` renders stage layers conditionally based on `PlayerViewState.mode` (`STANDBY`, `TITLE`, `GAMEPLAY`).
- `GameplayOverlay` global keyboard navigation ignores keystrokes when focus is inside text input or textarea elements.
- `SpeakerNameplate` returns `null` when no speaker name is specified or when the string is empty.
- `#dialogue-text` always carries exactly one `font-*` class (`font-small` 1rem, `font-medium` 1.15rem, `font-large` 1.35rem).
- Unsatisfied choices in `ChoiceOverlay` are disabled (`aria-disabled="true"`) and cannot be clicked.
- `ToastNotification` returns `null` when `activeToast` is `null` or when the active toast id has been dismissed locally.

## Side Effects

- Binds global `keydown` and `pointerdown` listeners on `window`.
- Triggers engine transitions through `PlayerUIActions` (`advance`, `completeDialogue`, `selectChoice`, `rollback`, `toggleAuto`, `toggleSkip`, `openModal`).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
