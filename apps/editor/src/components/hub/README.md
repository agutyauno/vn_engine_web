# Project Hub Components

## Overview

Project Hub subsystem for TaleForge Studio. Serves as the landing view for managing multiple visual novel projects, browsing projects with search filtering, tracking IndexedDB storage quota usage, creating new projects with canvas aspect ratio presets, duplicating projects, and safe project deletion with typed title verification.

## Interface

- `ProjectHubView`: Root dashboard view component for listing and managing projects
- `ProjectHubViewProps`: Props interface (`repository: ProjectRepository`, `onOpenProject: (projectId: string) => void`)
- `ProjectCard`: Card component for individual project metadata and action shortcuts
- `ProjectCardProps`: Props interface (`project`, `onOpen`, `onDuplicate`, `onDelete`, `onSettings`, `onExportZip`)
- `NewProjectModal`: Modal dialog for creating projects with preset or custom resolutions
- `NewProjectModalProps`: Props interface (`isOpen`, `isSubmitting`, `onClose`, `onCreate`, `onSubmit`)
- `DeleteConfirmModal`: Safe deletion confirmation modal requiring exact title matching
- `DeleteConfirmModalProps`: Props interface (`isOpen`, `projectName`, `project`, `isDeleting`, `onClose`, `onConfirm`)
- `getQuotaBadgeInfo(usedBytes: number, quotaBytes?: number): QuotaBadgeInfo`: Helper calculating storage status badge class and percentage
- `PRESET_RESOLUTIONS`: Preset dictionary for 16:9, 9:16, and 4:3 canvas aspect ratios
- `AspectPreset`: Type union `'16:9' | '9:16' | '4:3' | 'custom'`
- `QuotaBadgeInfo`: Interface for quota metadata

## Invariants

- Project deletion requires typing the exact project title before confirmation is enabled.
- Project name must be between 1 and 60 characters and non-empty.
- Custom canvas resolutions must enforce minimum dimensions (320x240) and maximum limits (3840x2160).

## Side Effects

- Asynchronously queries and mutates projects and storage usage via `ProjectRepository` (IndexedDB).
- Interacts with browser storage quota API via `repository.getStorageUsage()`.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
