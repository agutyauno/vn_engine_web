# Platform Adapters

## Overview

Provides decoupled integration adapters connecting the engine kernel to browser APIs, PixiJS renderer, Howler audio manager, Web Storage, and Web Studio Editor postMessage messaging.

## Interface

- `ProjectDataAsset`, `ProjectDataCharacter`, `ProjectData`: Contract interfaces for project asset metadata.
- `AssetResolverAdapter`: Resolves character sprites, props, and audio URLs; reports missing assets via `DiagnosticBus`.
- `AudioAdapterOptions`, `AudioAdapter`: Controls audio channels, master volume, mute, voice auto-cut, voice replay, and state catch-up.
- `isAllowedEditorOrigin(origin, previewOrigin, localOrigin)`: Sanitizes postMessage sender origins.
- `PreviewBridgeOptions`, `PreviewBridgeAdapter`: Establishes two-way postMessage communication between Web Studio Editor and Player sandbox.
- `RendererAdapterOptions`, `RendererAdapter`: Translates instruction side effects to PixiJS `GameRenderer` calls and captures save thumbnails.
- `StorageAdapterOptions`, `StorageAdapter`: Manages 6 save slots, quicksave, seen dialogue sets, and player settings with project-scoped keys and memory fallback.
  - `getSettings(): PlayerSettingsData`, `saveSettings(partial: Partial<PlayerSettingsData>): void`, `flushSettings(): void`: Read, debounce-write, and immediately write player settings under `${prefix}_settings`.

## Invariants

- `PreviewBridgeAdapter` validates origin security and throttles state update broadcasts to 60ms.
- `RendererAdapter.captureThumbnail` catches canvas security/taint errors and returns a fallback SVG data URL.
- `StorageAdapter` slot 0 is the quick save in both directions: `saveSlot({ slotIndex: 0 })` writes the `_quicksave` key, mirroring `loadSlot(0)`. Indices outside 0..6 (or non-integers) make `saveSlot` throw `RangeError` before anything is written.
- `StorageAdapter` falls back to sandboxed `MemoryStorage` only when `localStorage` is blocked (`SecurityError` and other non-quota errors). A quota error (`isQuotaExceededError`) never enables the fallback: `saveSlot`/`saveQuickSave` retry once with the saved slot's `thumbnailDataUrl` set to `''`, then throw `StorageQuotaError`. Seen-dialogue writes ignore quota errors.
- `StorageAdapter` settings live under `${prefix}_settings` (same `vn_engine_player`/`vn_engine_preview` + project prefix as the other keys). `getSettings()` always returns a fresh copy built only from known keys (never spreads parsed JSON, so `__proto__` and unknown keys are dropped). Corrupt JSON or a non-object payload yields `DEFAULT_PLAYER_SETTINGS`. Finite numbers are clamped (volumes 0..1, `textSpeed` 1..100, `autoDelayMs` 500..5000, `boxOpacity` 0.6..1.0); non-numbers, invalid `fontSize`/`stageScaleMode` and non-boolean `isMuted` fall back to defaults. The legacy `autoDelay` key is read when `autoDelayMs` is absent.
- `saveSettings` merges the partial into current settings and writes once after 200ms; further calls within the window reset the timer, and `getSettings` returns the pending values meanwhile. `flushSettings` writes pending settings immediately and clears the timer (no-op when nothing is pending). Settings writes ignore quota errors (the pending write is dropped).
- `AssetResolverAdapter` warns on missing assets once per asset key to prevent diagnostic flooding.

## Side Effects

- Reads and writes to `localStorage` or memory map.
- Posts messages to `window.parent` or `window.opener` via `postMessage`.
- Mutates PixiJS display tree and Howler audio playback.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
