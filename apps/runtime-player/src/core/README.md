# Player Core Kernel & Contracts

## Overview

Houses the runtime player orchestration kernel (`VNRuntimeKernel`), typewriter parsing utilities, and data contract definitions. It manages the execution lifecycle of `VisualNovelVM`, state synchronization, rollback, save/load, and audio auto-cut.

## Interface

- Types & Contracts:
  - `PlayerMode`: Player lifecycle mode (`TITLE`, `GAMEPLAY`, `INSPECT`, `STANDBY`, `HALTED`).
  - `TextPlaybackMode`: Playback rate mode (`NORMAL`, `AUTO`, `SKIP`).
  - `StepResult`: Discriminated union of VM step suspension types.
  - `AudioChannelState`, `SaveSlotData`, `BacklogEntry`, `TypewriterSegment`, `DesyncModalData`.
  - `PlayerViewState`, `KernelAdapters`, `PlayerUIActions`, `PlayerUIContract`, `VNRuntimeKernelOptions`.
- Functions:
  - `stripControlTags(rawText: string): string`: Removes formatting tags for clean backlog display.
  - `parseTypewriterSegments(rawText: string): TypewriterSegment[]`: Splits dialogue text into segments with pause, speed, and color metadata.
- Classes:
  - `VNRuntimeKernel`: Engine kernel coordinating VM execution, timer management, adapters, and UI subscription.

## Invariants

- Deterministic voice cut: Active voice channel stops immediately on advance, rollback, or choice selection.
- Skip mode cancels immediately upon hitting unread (unseen) dialogue.
- Choice selection verifies that condition requirements are satisfied before dispatching to VM.
- State emissions through `subscribe()` deliver immutable state snapshots.
- Save/load performs script hash verification and invokes desync handling if hashes mismatch.

## Side Effects

- Controls timers for auto-advance delay, wait instructions, and UI toasts.
- Dispatches side effects to external adapters (`renderer`, `audio`, `storage`).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
