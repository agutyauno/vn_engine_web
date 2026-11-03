# Studio Workspace Components

## Overview

Core visual novel authoring studio workspace. Integrates the 3-column director workspace comprising activity navigation, script file management, Monaco script editor, diagnostics & AST problems drawer, live preview iframe bridge, asset library, settings, and release export wizard.

## Interface

- `StudioWorkspacePage`: Top-level director workspace page coordinating stores and modals
- `StudioWorkspacePageProps`: Props interface (`projectId`, `repository`, `initialProject`, `onBackToHub`, `onQuickPlay`, `onOpenSettings`, `onExport`)
- `ActivityBar`: Leftmost icon navigation bar (`ActivityBarProps`, `StudioTab`)
- `FileExplorerPane`: VNS file explorer pane (`FileExplorerPaneProps`, `cleanChapterName`, `normalizeScriptName`, `validateFileName`, `generateDefaultScriptName`)
- `StudioHeader`: Top header with title editing, save status indicator, and quick actions (`StudioHeaderProps`, `getAspectRatioBadge`)
- `AssetLibraryPane`: Asset manager pane with category filter, preview, replace, and safe deletion (`AssetLibraryPaneProps`)
- `CreateAssetModal`: Modal for uploading/configuring new assets (`CreateAssetModalProps`)
- `SafeDeleteModal`: Dependency-aware asset deletion guard modal (`SafeDeleteModalProps`)
- `EditorTabBar`: Multi-file tab bar with dirty indicators (`EditorTabBarProps`)
- `MonacoEditorContainer`: Monaco editor wrapper with VNS syntax highlighting and marker synchronization (`MonacoEditorContainerProps`)
- `DockDrawer`: Resizable bottom dock drawer (`DockDrawerProps`, `DrawerTab`)
- `DockProblemsTable`: Interactive diagnostics problems table with quick fixes (`DockProblemsTableProps`, `DiagnosticItem`)
- `PreviewDock`: Live sandbox player dock (`PreviewDockProps`, `formatAspectRatioString`, `isAllowedPreviewOrigin`, `buildPreviewUrl`)
- `ProjectSettingsModal`: Comprehensive project configuration modal (`ProjectSettingsModalProps`, `SettingsTab`)
- `ExportWizardModal`: Release packaging modal for Web, Desktop, and backup formats (`ExportWizardModalProps`, `ExportTarget`)
- `ColumnSplitter`: Resizable drag handle splitter for workspace panels (`ColumnSplitterProps`)
- `UnsavedChangesModal`: Navigation guard modal preventing data loss (`UnsavedChangesModalProps`)
- `ShortcutsHelpModal`: Keyboard shortcuts modal (`ShortcutsHelpModalProps`)

## Invariants

- Scripts must end in `.vns` extension; forbidden filename characters (`\ / : * ? " < > |`) are rejected.
- The entry scene script (default `main.vns`) cannot be deleted.
- Assets referenced in script AST cannot be deleted without confirmation bypass or removing references.
- Navigation away from dirty workspace triggers unsaved changes modal guard.

## Side Effects

- Spawns compiler Web Worker and terminates it on unmount.
- Posts messages (`postMessage`) to iframe or popout window via `PreviewBridge`.
- Reads and writes to `localStorage` for layout panel dimensions and selected asset category.
- Asynchronously loads and persists project state through `ProjectRepository`.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
