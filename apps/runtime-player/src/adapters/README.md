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
- `PreviewBridgeOptions`, `PreviewBridgeAdapter`, `HotReloadOptions`: Establishes two-way postMessage communication between Web Studio Editor and Player sandbox. `HotReloadOptions` supports `title?`, `titleSettings?`, `startMode?: 'title' | 'scene'`, and `entryScene?` (forwarded only when it is a non-empty string). `main.ts` calls `kernel.setEntryScene(opts?.entryScene)` before every `loadProgram`, so a reload without it clears the previous entry; explicit `line`/`scene` targets still win.
- `resolveTitleConfig(title?: string, titleSettings?: ProjectTitleSettings, assets?: AssetRef[]): Partial<TitleScreenConfig>`: Resolves title branding assets (logo, background, BGM) against hydrated assets.
- `RendererAdapterOptions`, `RendererAdapter`: Translates instruction side effects to PixiJS `GameRenderer` calls and captures save thumbnails.
- `StorageAdapterOptions`, `StorageAdapter`: Manages 6 save slots, quicksave, seen dialogue sets, and player settings with project-scoped keys and memory fallback.
  - `getSettings(): PlayerSettingsData`, `saveSettings(partial: Partial<PlayerSettingsData>): void`, `flushSettings(): void`: Read, debounce-write, and immediately write player settings under `${prefix}_settings`.
  - `deleteSlot(slotIndex: number): Promise<void>`: Deletes slot 0 (quicksave) or 1..6.
  - `getMostRecentSave(): SaveSlotData | null`: Returns the save with the greatest `timestamp` across the quicksave and slots 1..6, or `null` when there is none.
- `GameBundleError`, `GameBundleParseResult`, `parseGameBundle(raw: unknown, baseUrl?: string): GameBundleParseResult`: Zero-Trust parser and validator for published game bundles.
- `GameBundleLoadResult`, `LoadGameBundleOptions`, `loadGameBundle({ document, fetchFn, baseUrl }): Promise<GameBundleLoadResult>`: Asynchronously loads a published game bundle by checking embedded HTML script first, then falling back to fetching `./project.json`.

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
- `resolveTitleConfig` ignores non-existent asset IDs, mismatched asset types (image vs audio), and assets with empty storage URLs. Whitespace-only titles are omitted.
- `AudioAdapter.playMusic` and `stopMusic` always operate on the 'music' channel, convert millisecond fade parameters (`fadeInMs`, `fadeOutMs`) to seconds, ignore empty or unresolvable tracks silently without throwing, and never invoke `stop` prior to `play` because `AudioManager` automatically ignores duplicate play requests when the same asset ID is already active.
- `parseGameBundle` enforces Zero-Trust validation: raw input must be an object (`not_object` otherwise) and `formatVersion` must equal 1 (`PUBLISHED_BUNDLE_FORMAT_VERSION`, returning `unsupported_version` otherwise). Required fields (`projectId`, `title`, `program` instructions with string type, `assets` array with valid id/name/type, finite `publishedAt` number) are strictly validated; missing or invalid fields yield `invalid_field`.
- `parseGameBundle` sanitizes `storageUrl` against control characters (< 0x20 or 0x7F), dangerous schemes (`javascript:`, `file:`, `blob:`, `data:text/...`), and escaping prefixes (`//`, `\`, `/\`). Allowed schemes include `http:`, `https:`, `data:image/`, `data:audio/`, and safe relative paths. When `baseUrl` is provided, relative paths are resolved against `baseUrl` and strictly validated to preserve the same origin (`resolved.origin === baseUrl.origin`) and use `http:`/`https:` protocol. When `baseUrl` is omitted, relative paths are preserved as-is provided they do not start with `//`, `\`, or `/\`. Disallowed, escaping, cross-origin, or malformed URLs cause the asset to be excluded from `bundle.assets`, pushing a warning string containing the asset id into `warnings`.
- `parseGameBundle` constructs new objects exclusively from known whitelisted fields (no object spreading), preventing prototype pollution (`__proto__`) and stripping unknown metadata.
- `loadGameBundle` evaluates bundle sources strictly by priority:
  1. Embedded script: `<script id="vn-game-bundle" type="application/json">` parsed with `JSON.parse` (malformed JSON yields `{ kind: 'error', error: 'invalid_json' }`) and validated via `parseGameBundle`. When present, `fetchFn` is never invoked. Non-matching `type` attributes cause the element to be ignored.
  2. File fallback: Resolves `project.json` against `baseUrl` and invokes `fetchFn`. Rejections or non-OK HTTP status codes other than 404 yield `{ kind: 'error', error: 'fetch_failed' }`. HTTP 404 yields `{ kind: 'none' }`. When HTTP status is 200 and the `content-type` header contains `text/html` (case-insensitive SPA fallback from hosts like Vite preview, Cloudflare Pages, Netlify), it returns `{ kind: 'none' }` without parsing. For other content-types, HTTP 200 with an invalid JSON body yields `{ kind: 'error', error: 'invalid_json' }`.
  3. Validation errors from `parseGameBundle` (such as `unsupported_version`, `invalid_field`, `not_object`) yield `{ kind: 'error', error }`.

## Side Effects

- Reads and writes to `localStorage` or memory map.
- Posts messages to `window.parent` or `window.opener` via `postMessage`.
- Mutates PixiJS display tree and Howler audio playback.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
