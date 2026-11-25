# Core Services

## Overview

Core application services powering compilation, sandboxed runtime communication, static AST reconciliation, Monaco editor marker synchronization, and VNS language context provision.

## Interface

- `CompilerService`: Web Worker and synchronous fallback DSL compilation coordinator with sequence guards and a 2000ms watchdog timer (`compile`, `terminate`, `getLatestRequestId`)
- `CompilerWorkerRequest`, `CompilerWorkerResponse`: Message contracts for worker compilation
- `CompileExecutionOptions`, `CompileOutput`: Public compilation interfaces
- `PreviewBridge`: Bidirectional `postMessage` bridge between Editor and sandbox player iframe/popout (`probeReady`, `hotReload`, `sendVariable`, `handleMessage`, `dispose`, `buildPreviewUrl`, `isAllowedPreviewOrigin`)
- `scanActiveReconciliation(project: Project): ReconciliationReport`: Scans scripts for uncreated/unused assets and characters. Sprite assets (`category: 'sprite'` or with `tag`) count as used when a `show tag[.variant]` ref matches `tag` (case-insensitive) and `variant || 'default'`
- `computeReconciliationDiagnostics(files, options?: { characters?, assets?: Array<{ id; name?; type?; category?; tag?; variant? }> }, cache): GeneratedEditorDiagnostic[]`: Cached AST reconciliation. A sprite ref is satisfied by id/name/stem or by a sprite asset with matching `tag` + `variant || 'default'`; missing ones report `Missing sprite asset '<tag>[.<variant>]'`
- `checkAssetDeletionSafety(assetIdOrName: string, project: Project): DeletionSafetyResult`: Assesses safety of asset deletion
- `generateDiagnostics(project: Project): GeneratedEditorDiagnostic[]`: Produces editor diagnostics from reconciliation scan
- `syncMonacoMarkers(options: MonacoMarkerSyncOptions): void`: Synchronizes diagnostics into Monaco editor markers
- `extractScenesFromFile(fileName: string, content: string): SceneItem[]`: AST/regex scene and subscene extractor
- `createVnsProjectContext(getProject: () => Project | null, fallback?: Project): VnsProjectContext`: Dynamic project context provider for Monaco language features
- `buildHotReloadPayload(project: Project, program: Instruction[], extra?: HotReloadPayloadExtra): HotReloadPayload`: Constructs preview hot reload payload preserving branding settings without undefined keys
- `resolveEntrySceneName(project: Project, program: Instruction[]): string | undefined`: Resolves entry scene name against compiled program or first declared scene in matching VNS file
- `buildPublishedGameZip(options: BuildPublishedGameZipOptions): Promise<BuildPublishedGameZipResult>`: Generates the published ZIP: `project.json`, hashed asset files in `game-assets/` (`GAME_ASSETS_DIR`) and, when `runtimeFiles` is given, the runtime player (`index.html` with the published marker, `assets/`) plus `README.txt`. The result reports `includesRuntime` and itch.io `limitWarnings`.
- `runtimePackage.ts`: `loadRuntimeFiles({ fetchFn, baseUrl })` reads `public/runtime/manifest.json` and every listed file (`ok` / `missing` / `error`), `parseRuntimeManifest`, `injectPublishedMarker`, `checkPublishedPackageLimits` with `ITCH_HTML5_LIMITS` (1000 files, 500 MB extracted, 200 MB per file, 240-character paths), `PUBLISHED_PACKAGE_README`.

## Invariants

- `CompilerService` sequence guard discards responses with `requestId < latestRequestId` to prevent race conditions.
- `CompilerService` enforces a 2000ms watchdog timer terminating the worker if unresponsive.
- `PreviewBridge` enforces zero-trust origin verification via `isAllowedPreviewOrigin` rejecting untrusted message origins.
- `checkAssetDeletionSafety` flags any asset referenced by background/audio/inspect AST statements as unsafe to delete.
- `buildHotReloadPayload` omits `titleSettings` when undefined and omits `startMode` during automatic compilation to avoid resetting runtime player state to Title screen.
- `buildHotReloadPayload` adds `entryScene` (resolved with `resolveEntrySceneName`: an entry file becomes the first scene declared in it) on every hot reload, and omits it when the project has no entry or it cannot be resolved.
- `buildPublishedGameZip` preserves remote HTTP/HTTPS assets without fetching blobs; packages local blobs into `game-assets/<sha256-16>.<ext>` with content-hash deduplication; omits missing blobs with warnings; preserves `data:` URLs.
- `buildPublishedGameZip` omits `entryScene` if unresolvable and omits `titleSettings` if absent from project.
- Runtime manifest is untrusted: every path must be relative POSIX made of `[A-Za-z0-9._-]` segments (no `.`/`..`, `\`, `:`, empty segments), unique, must include `index.html`, and must not touch the reserved paths `project.json`, `README.txt`, `manifest.json`, `game-assets/`. Any bad entry rejects the whole manifest (`error`), so nothing is exported. A missing manifest (404, network error, or the dev server's `text/html` fallback) is `missing`, and the caller exports a game-only ZIP.
- `buildPublishedGameZip` throws if `runtimeFiles` lacks `index.html` or uses a reserved path. Limit warnings never block the export.

## Side Effects

- Spawns and terminates dedicated browser Web Workers (`compiler.worker.ts`).
- Sends and receives `window.postMessage` events across origins.
- Interacts with `useDiagnosticsStore` and `usePreviewStore`.
- Mutates Monaco editor model markers via `monaco.editor.setModelMarkers`.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
