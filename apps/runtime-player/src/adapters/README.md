# Platform Adapters

## Overview

Provides decoupled integration adapters connecting the engine kernel to browser APIs, PixiJS renderer, Howler audio manager, Web Storage, and Web Studio Editor postMessage messaging.

## Interface

- `ProjectDataAsset`, `ProjectDataCharacter`, `ProjectData`: Contract interfaces for project asset metadata.
- `AssetResolverAdapter`: Resolves character sprites, props, and audio URLs; reports missing assets via `DiagnosticBus`.
- `AudioAdapterOptions`, `AudioAdapter`: Controls audio channels, master volume, mute, voice auto-cut, voice replay, and state catch-up.
  - `playMusic(track: string, options?: { loop?: boolean; fadeInMs?: number }): Promise<void>`: Plays background music on the 'music' channel with optional loop and fade-in in milliseconds.
  - `stopMusic(fadeOutMs?: number): Promise<void>`: Stops the 'music' channel with optional fade-out in milliseconds.
- `isAllowedEditorOrigin(origin, previewOrigin, localOrigin)`: Sanitizes postMessage sender origins.
- `PreviewBridgeOptions`, `PreviewBridgeAdapter`: Establishes two-way postMessage communication between Web Studio Editor and Player sandbox.
- `RendererAdapterOptions`, `RendererAdapter`: Translates instruction side effects to PixiJS `GameRenderer` calls and captures save thumbnails.
- `StorageAdapterOptions`, `StorageAdapter`: Manages 6 save slots, quicksave, seen dialogue sets, and player settings with project-scoped keys and memory fallback.
  - `getSettings(): PlayerSettingsData`, `saveSettings(partial: Partial<PlayerSettingsData>): void`, `flushSettings(): void`: Read, debounce-write, and immediately write player settings under `${prefix}_settings`.
  - `deleteSlot(slotIndex: number): Promise<void>`: Deletes slot 0 (quicksave) or 1..6.
  - `getMostRecentSave(): SaveSlotData | null`: Returns the save with the greatest `timestamp` across the quicksave and slots 1..6, or `null` when there is none.

## Invariants

- `PreviewBridgeAdapter` validates origin security and throttles state update broadcasts to 60ms.
- `RendererAdapter.captureThumbnail` catches canvas security/taint errors and returns a fallback SVG data URL.
- `StorageAdapter` slot 0 is the quick save in both directions: `saveSlot({ slotIndex: 0 })` writes the `_quicksave` key, mirroring `loadSlot(0)`. Indices outside 0..6 (or non-integers) make `saveSlot` throw `RangeError` before anything is written.
- `deleteSlot` uses the same index guard as `saveSlot`: non-integers or indices outside 0..6 throw `RangeError` before storage is touched. Slot 0 removes the `_quicksave` key; slots 1..6 set that entry to `null` and rewrite `_save_slots` only when the entry was non-null, so deleting an empty slot leaves storage byte-identical. Only the adapter's own project partition is touched.
- `getMostRecentSave` scans the quicksave first, then slots 1..6, and replaces the candidate only on a strictly greater `timestamp`. Ties go to the first one found: the quicksave beats regular slots, and the lowest slot index wins among regular slots.
- `StorageAdapter` falls back to sandboxed `MemoryStorage` only when `localStorage` is blocked (`SecurityError` and other non-quota errors). A quota error (`isQuotaExceededError`) never enables the fallback: `saveSlot`/`saveQuickSave` retry once with the saved slot's `thumbnailDataUrl` set to `''`, then throw `StorageQuotaError`. Seen-dialogue writes ignore quota errors.
- `StorageAdapter` settings live under `${prefix}_settings` (same `vn_engine_player`/`vn_engine_preview` + project prefix as the other keys). `getSettings()` always returns a fresh copy built only from known keys (never spreads parsed JSON, so `__proto__` and unknown keys are dropped). Corrupt JSON or a non-object payload yields `DEFAULT_PLAYER_SETTINGS`. Finite numbers are clamped (volumes 0..1, `textSpeed` 1..100, `autoDelayMs` 500..5000, `boxOpacity` 0.6..1.0); non-numbers, invalid `fontSize`/`stageScaleMode` and non-boolean `isMuted` fall back to defaults. The legacy `autoDelay` key is read when `autoDelayMs` is absent.
- `saveSettings` merges the partial into current settings and writes once after 200ms; further calls within the window reset the timer, and `getSettings` returns the pending values meanwhile. `flushSettings` writes pending settings immediately and clears the timer (no-op when nothing is pending). Settings writes ignore quota errors (the pending write is dropped).
- `AssetResolverAdapter` warns on missing assets once per asset key to prevent diagnostic flooding.
- `AudioAdapter.playMusic` and `stopMusic` always operate on the 'music' channel, convert millisecond fade parameters (`fadeInMs`, `fadeOutMs`) to seconds, ignore empty or unresolvable tracks silently without throwing, and never invoke `stop` prior to `play` because `AudioManager` automatically ignores duplicate play requests when the same asset ID is already active.

## Side Effects

- Reads and writes to `localStorage` or memory map.
- Posts messages to `window.parent` or `window.opener` via `postMessage`.
- Mutates PixiJS display tree and Howler audio playback.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
