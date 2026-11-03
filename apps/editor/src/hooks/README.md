# Hooks

## Overview

Custom React hooks encapsulating the reactive compilation pipeline and global keyboard shortcut handling for the studio workspace.

## Interface

- `useCompilerPipeline(options: UseCompilerPipelineOptions): void`: Hook coordinating debounced DSL compilation, reconciliation diagnostics generation, and hot-reload dispatch
- `UseCompilerPipelineOptions`: Hook options interface (`compilerService`, `previewBridge`, `debounceMs`)
- `useKeyboardShortcuts(options?: KeyboardShortcutOptions): void`: Hook binding global keyboard shortcuts (`Ctrl+S`, `Ctrl+Enter`, `F5`, `Ctrl+\``, `Ctrl+B`, `Ctrl+,`, `Ctrl+F4`, `?`, `Ctrl+/`)
- `KeyboardShortcutOptions`: Hook callback handlers interface

## Invariants

- `useCompilerPipeline` debounces compilation runs by default (200ms) on file changes to prevent thrashing.
- Changes to characters or assets re-run reconciliation diagnostics and re-dispatch cached bytecode without re-compiling all scripts.
- Text input elements (`INPUT`, `TEXTAREA`, Monaco editor) suppress single-key shortcuts like `?` to prevent capturing character typing.

## Side Effects

- Attaches and cleans up global `keydown` event listeners on `window`.
- Dispatches hot-reload messages to preview bridge and updates Zustand diagnostics store.
- Schedules and cancels debounced timer handles.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
