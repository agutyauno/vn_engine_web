# Player Core Kernel & Contracts

## Overview

Houses the runtime player orchestration kernel (`VNRuntimeKernel`), typewriter parsing utilities, and data contract definitions. It manages the execution lifecycle of `VisualNovelVM`, state synchronization, rollback, save/load, and audio auto-cut.

## Interface

- Types & Contracts:
  - `PlayerMode`: Player lifecycle mode (`TITLE`, `GAMEPLAY`, `INSPECT`, `STANDBY`, `HALTED`).
  - `TextPlaybackMode`: Playback rate mode (`NORMAL`, `AUTO`, `SKIP`).
  - `StepResult`: Discriminated union of VM step suspension types.
  - `DialogueFontSize` (`small` | `medium` | `large`), `PlayerSettingsData`, `DEFAULT_PLAYER_SETTINGS`: Persisted player settings (volumes, `isMuted`, `textSpeed`, `autoDelayMs`, `fontSize`, `boxOpacity`, `stageScaleMode`) and their defaults. `KernelAdapters.storage` optionally exposes `getSettings`/`saveSettings`.
  - `AudioChannelState`, `SaveSlotData`, `BacklogEntry`, `TypewriterSegment`, `DesyncModalData`.
  - `PlayerViewState`, `KernelAdapters`, `PlayerUIActions`, `PlayerUIContract`, `VNRuntimeKernelOptions`.
  - `TitleScreenConfig` (`title`, `version?`, `backgroundUrl?`, `logoUrl?`, `bgmTrack?`): Title data already resolved to URLs/keys (the kernel never sees `AssetRef`). `VNRuntimeKernelOptions.titleConfig?: Partial<TitleScreenConfig>`.
  - `LoadProgramOptions`: Supports `scene?`, `line?`, `preserveState?`, `projectId?`, `assets?`, and `startAtTitle?: boolean`.
  - `ToastTone` (`success` | `info` | `error`).
  - `KernelAdapters.storage` optionally exposes `deleteSlot(slotIndex)` and `getMostRecentSave()`. `KernelAdapters.audio` and `AudioAdapterContract` optionally expose `playMusic(track, { loop?, fadeInMs? })` and `stopMusic(fadeOutMs?)` (milliseconds).
  - `PlayerViewState.settings`: `{ textSpeed, autoDelayMs, fontSize: DialogueFontSize, boxOpacity }`.
  - `PlayerViewState`: State snapshot exposing `mode`, `playbackMode`, `dialogue`, `settings`, `audio`, `backlog`, `saveSlots`, `quickSaveSlot`, `titleConfig: TitleScreenConfig`, `hasSaveData: boolean`, `pendingConfirm: 'quick_load_overwrite' | null`, and `activeToast: { message: string; id: number; tone: ToastTone } | null`.
  - `PlayerUIActions` settings actions: `setAudioVolume`, `toggleMute`, `setTextSpeed`, `setAutoDelay`, `setFontSize(size)`, `setBoxOpacity(opacity)`, `restoreDefaultSettings()`.
  - `PlayerUIActions` lifecycle & quick actions: `continueGame(): Promise<void>`, `deleteSlot(slotIndex: number): Promise<void>`, `confirmPending(): Promise<void>`, `cancelPending(): void`, `unlockAudio(): void`, `showToast(message: string, tone?: ToastTone): void`.
- Functions:
  - `stripControlTags(rawText: string): string`: Removes formatting tags for clean backlog display.
  - `parseTypewriterSegments(rawText: string): TypewriterSegment[]`: Splits dialogue text into segments with pause, speed, and color metadata.
- Classes:
  - `StorageQuotaError` (in `contracts.ts`): Thrown by the storage adapter when `localStorage` is full. The kernel catches it in `saveSlot`/`quickSave`, shows a toast with 'error' tone, and leaves save state unchanged. `adapters/StorageAdapter` re-exports it.
  - `VNRuntimeKernel`: Engine kernel coordinating VM execution, timer management, adapters, and UI subscription.
    Settings methods: `setAudioVolume(channel, volume)` (`master` plus aliases `sfx` -> `sound`, `bgm` -> `music`), `toggleMute()`, `setTextSpeed()`, `setAutoDelay()`, `setFontSize()`, `setBoxOpacity()`, `restoreDefaultSettings()`. Each one persists through `storage.saveSettings` and emits once.
    Lifecycle & quick methods: `startNewGame()`, `continueGame()`, `returnToTitle()`, `unlockAudio()`, `saveSlot()`, `loadSlot()`, `deleteSlot()`, `quickSave()`, `quickLoad()`, `confirmPending()`, `cancelPending()`, `setTitleConfig(config: Partial<TitleScreenConfig>): void`.

## Invariants

- Deterministic voice cut: Active voice channel stops immediately on advance, rollback, or choice selection.
- Skip mode cancels immediately upon hitting unread (unseen) dialogue.
- Choice selection verifies that condition requirements are satisfied before dispatching to VM.
- State emissions through `subscribe()` deliver immutable state snapshots.
- Save/load performs script hash verification and invokes desync handling if hashes mismatch.
- Settings hydrate at construction from `storage.getSettings()`, falling back to `DEFAULT_PLAYER_SETTINGS`. The kernel then pushes master/music/sound/voice volumes and mute to the audio adapter.
- Master volume lives in `audio.masterVolume`, never in `audio.channelVolumes`. Channel aliases are canonicalized before they reach state or the adapter.
- The `ambience` channel stays at 1.0 on boot, is not persisted, and `restoreDefaultSettings()` leaves it unchanged.
- Settings changes replace the `settings`, `audio` and `channelVolumes` objects rather than mutating them, so earlier `getState()` and subscriber snapshots keep their values.
- Autoplay policy: Browser blocks unprompted audio; the kernel never calls `playMusic` in constructor. Title BGM only plays after `unlockAudio()` (idempotent, triggered by first user gesture on title screen) or upon `returnToTitle()`.
- Title branding reactivity: `setTitleConfig` replaces the entire title configuration without merging previous fields, trims the title with fallback to 'Visual Novel', and emits state. In `TITLE` mode with audio unlocked, changing `bgmTrack` immediately plays the new track or stops music if removed.
- Start mode handling: Calling `loadProgram` with `startAtTitle: true` immediately transitions the kernel to `TITLE` mode via `returnToTitle()`, bypassing automatic script progression and new-game startup from `STANDBY`.
- Toast tone & duration: Toasts auto-dismiss after exactly 2500ms (`TOAST_DURATION_MS`), with semantic tone (`success`, `info`, `error`). Storage quota failure displays an `error` toast.
- Confirmation guard: When in `GAMEPLAY` mode and dialogue backlog > 0, `quickLoad()` sets `pendingConfirm = 'quick_load_overwrite'` without loading immediately until `confirmPending()` is called. `cancelPending()` resets confirmation.
- `hasSaveData` state flag reactively reflects whether at least one save exists (slot 0..6), updated on boot, save, and slot deletion.

## Side Effects

- Controls timers for auto-advance delay, wait instructions, and UI toasts.
- Dispatches side effects to external adapters (`renderer`, `audio`, `storage`).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
