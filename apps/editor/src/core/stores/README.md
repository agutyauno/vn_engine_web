# Core Stores

## Overview

Centralized state management stores built with Zustand. Manages active project data and auto-save timers (`projectStore`), responsive UI layout dimensions and modal visibility (`uiStore`), multi-source diagnostics and error counts (`diagnosticsStore`), and live preview connection and state overrides (`livePreviewStore`).

## Interface

- `useProjectStore`: Zustand store for project model, files, characters, assets, and dirty state
- `ProjectStoreState`: State and actions interface for projectStore
- `useEditorUIStore`, `useUIStore`: Zustand store for layout panel dimensions, active tabs, and modals
- `EditorUIStoreState`, `PendingNavigationTarget`: State and actions interface for uiStore
- `useDiagnosticsStore`: Zustand store for compiler, reconciliation, and runtime diagnostics
- `DiagnosticsStoreState`: State and actions interface for diagnosticsStore
- `usePreviewStore`, `useLivePreviewStore`: Zustand store for live preview playback and variables
- `LivePreviewStoreState`, `HotReloadPayload`: State and actions interface for previewStore

## Invariants

- `isDirty` in `useProjectStore` accurately tracks whether unsaved modifications exist in scripts or metadata.
- `saveProject` uses snapshot subtraction: only file IDs captured at save start are marked clean upon success, preserving edits made during an in-flight save.
- Navigation panel and preview panel widths are clamped to composite window bounds (`getMaxCombinedWidth`).
- Layout dimensions and last selected asset category are persisted to `localStorage`.

## Side Effects

- Sets and clears debounced auto-save timers (`setTimeout`).
- Reads and writes to `localStorage` (`STORAGE_KEY`, `ASSET_CATEGORY_STORAGE_KEY`).
- Invokes `ProjectRepository` for project and asset blob persistence.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
