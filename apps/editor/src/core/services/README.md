# Core Services

## Overview

Core application services powering compilation, sandboxed runtime communication, static AST reconciliation, Monaco editor marker synchronization, and VNS language context provision.

## Interface

- `CompilerService`: Web Worker and synchronous fallback DSL compilation coordinator with sequence guards and a 2000ms watchdog timer (`compile`, `terminate`, `getLatestRequestId`)
- `CompilerWorkerRequest`, `CompilerWorkerResponse`: Message contracts for worker compilation
- `CompileExecutionOptions`, `CompileOutput`: Public compilation interfaces
- `PreviewBridge`: Bidirectional `postMessage` bridge between Editor and sandbox player iframe/popout (`probeReady`, `hotReload`, `sendVariable`, `handleMessage`, `dispose`, `buildPreviewUrl`, `isAllowedPreviewOrigin`)
- `scanActiveReconciliation(project: Project): ReconciliationReport`: Scans scripts for uncreated/unused assets and characters
- `checkAssetDeletionSafety(assetIdOrName: string, project: Project): DeletionSafetyResult`: Assesses safety of asset deletion
- `generateDiagnostics(project: Project): GeneratedEditorDiagnostic[]`: Produces editor diagnostics from reconciliation scan
- `syncMonacoMarkers(options: MonacoMarkerSyncOptions): void`: Synchronizes diagnostics into Monaco editor markers
- `extractScenesFromFile(fileName: string, content: string): SceneItem[]`: AST/regex scene and subscene extractor
- `createVnsProjectContext(getProject: () => Project | null, fallback?: Project): VnsProjectContext`: Dynamic project context provider for Monaco language features

## Invariants

- `CompilerService` sequence guard discards responses with `requestId < latestRequestId` to prevent race conditions.
- `CompilerService` enforces a 2000ms watchdog timer terminating the worker if unresponsive.
- `PreviewBridge` enforces zero-trust origin verification via `isAllowedPreviewOrigin` rejecting untrusted message origins.
- `checkAssetDeletionSafety` flags any asset referenced by background/audio/inspect AST statements as unsafe to delete.

## Side Effects

- Spawns and terminates dedicated browser Web Workers (`compiler.worker.ts`).
- Sends and receives `window.postMessage` events across origins.
- Interacts with `useDiagnosticsStore` and `usePreviewStore`.
- Mutates Monaco editor model markers via `monaco.editor.setModelMarkers`.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
