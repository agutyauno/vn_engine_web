# Studio Workspace Components

## Overview

Core visual novel authoring studio workspace. Integrates the 3-column director workspace comprising activity navigation, script file management, Monaco script editor, diagnostics & AST problems drawer, live preview iframe bridge, asset library, settings, and release export wizard.

## Interface

- `StudioWorkspacePage`: Top-level director workspace page coordinating stores and modals
- `StudioWorkspacePageProps`: Props interface (`projectId`, `repository`, `initialProject`, `onBackToHub`, `onQuickPlay`, `onOpenSettings`, `onExport`)
- `ActivityBar`: Leftmost icon navigation bar (`ActivityBarProps`, `StudioTab`)
- `FileExplorerPane`: VNS file explorer pane (`FileExplorerPaneProps`, `cleanChapterName`, `normalizeScriptName`, `validateFileName`, `generateDefaultScriptName`)
- `StudioHeader`: Top header with title editing, save status indicator, and quick actions (`StudioHeaderProps`, `getAspectRatioBadge`, preview start mode toggle)
- `AssetLibraryPane`: Asset manager pane with category filter, preview, replace, and safe deletion (`AssetLibraryPaneProps`)
- `CreateAssetModal`: Modal for uploading/configuring new assets (`CreateAssetModalProps`)
- `SafeDeleteModal`: Dependency-aware asset deletion guard modal displaying script references and non-blocking title screen role warnings (`SafeDeleteModalProps`)
- `EditorTabBar`: Multi-file tab bar with dirty indicators (`EditorTabBarProps`)
- `MonacoEditorContainer`: Monaco editor wrapper with VNS syntax highlighting and marker synchronization (`MonacoEditorContainerProps`)
- `DockDrawer`: Resizable bottom dock drawer (`DockDrawerProps`, `DrawerTab`)
- `DockProblemsTable`: Interactive diagnostics problems table with quick fixes (`DockProblemsTableProps`, `DiagnosticItem`)
- `PreviewDock`: Live sandbox player dock (`PreviewDockProps`, `formatAspectRatioString`, `isAllowedPreviewOrigin`, `buildPreviewUrl`)
- `ProjectSettingsModal`: Comprehensive project configuration modal managing General, Branding (`titleSettings`), Display, Editor, and Gameplay tabs (`ProjectSettingsModalProps`, `SettingsTab`)
- `ExportWizardModal`: Release packaging modal for Web and backup formats (`ExportWizardModalProps`, `ExportTarget = 'web' | 'backup'`, supporting `errorMessage` alert, `noticeMessage` (`role="status"`, `data-testid="export-notice"`, one notice per line) and `isExporting` pending state)
- `ColumnSplitter`: Resizable drag handle splitter for workspace panels (`ColumnSplitterProps`)
- `UnsavedChangesModal`: Navigation guard modal preventing data loss (`UnsavedChangesModalProps`)
- `ShortcutsHelpModal`: Keyboard shortcuts modal (`ShortcutsHelpModalProps`)
- `AssetSelectorModal`: Reusable modal for browsing and selecting assets (`AssetSelectorModalProps`)
- `AssetPickerField`: Form field for selecting and clearing an asset with thumbnail preview and missing-state fallback (`AssetPickerFieldProps`)

## Invariants

- Scripts must end in `.vns` extension; forbidden filename characters (`\ / : * ? " < > |`) are rejected.
- The entry scene script (default `main.vns`) cannot be deleted.
- Assets referenced in script AST cannot be deleted without confirmation bypass or removing references.
- Assets referenced in `titleSettings` display a non-blocking warning (`safe-delete-title-warning`) indicating removal from title screen roles upon deletion.
- Navigation away from dirty workspace triggers unsaved changes modal guard.
- `AssetSelectorModal` filters assets strictly by type (`accept`) and performs case-insensitive name filtering.
- `AssetPickerField` displays 'Missing asset' when referencing a deleted or nonexistent asset ID.
- `ProjectSettingsModal` Branding tab edits `titleSettings` (logo, background, BGM) and omits the property entirely if all entries are cleared.
- Studio header displays `btn-preview-start-mode` toggle button only when quick play is enabled. In popout preview, `startMode: 'scene'` is sent for cursor runs, `previewStartMode` is sent on Play, and omitted on background recompiles.
- `StudioWorkspacePage` `handlePerformExport` coordinates asynchronous export for Web target: compiles via `compilerService.compile({ forceSync: true })`, loads the bundled runtime with `loadRuntimeFiles` (same origin, `${BASE_URL}runtime/`), generates ZIP via `buildPublishedGameZip`, triggers download of `<slug>_web.zip`, and surfaces compilation or runtime-manifest errors in `ExportWizardModal` without closing the modal. When the runtime is missing (dev server without `pnpm build`) or itch.io limits are exceeded, the ZIP is still downloaded and the wizard stays open with a notice; otherwise it closes.
- `StudioWorkspacePage` exports raw project JSON snapshot for Backup target as `<slug>_backup.json`.
- The Desktop Electron card in `ExportWizardModal` is shown as "Coming soon": `aria-disabled="true"`, disabled radio, no click handler, so it can never be selected and nothing downloads `_desktop.json`. Real packaging waits for `apps/desktop-shell` (ADR-003).

## Side Effects

- Spawns compiler Web Worker and terminates it on unmount.
- Posts messages (`postMessage`) to iframe or popout window via `PreviewBridge`.
- Reads and writes to `localStorage` for layout panel dimensions and selected asset category.
- Asynchronously loads and persists project state through `ProjectRepository`.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
