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
- `StorageAdapterOptions`, `StorageAdapter`: Manages 6 save slots, quicksave, and seen dialogue sets with project-scoped keys and memory fallback.

## Invariants

- `PreviewBridgeAdapter` validates origin security and throttles state update broadcasts to 60ms.
- `RendererAdapter.captureThumbnail` catches canvas security/taint errors and returns a fallback SVG data URL.
- `StorageAdapter` automatically falls back to sandboxed `MemoryStorage` if `localStorage` throws quota or security exceptions.
- `AssetResolverAdapter` warns on missing assets once per asset key to prevent diagnostic flooding.

## Side Effects

- Reads and writes to `localStorage` or memory map.
- Posts messages to `window.parent` or `window.opener` via `postMessage`.
- Mutates PixiJS display tree and Howler audio playback.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
