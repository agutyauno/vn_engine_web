# Core Utilities

## Overview

Core utility functions for asset validation, slugification, and file extension checks.

## Interface

- `validateAssetFile(file: File, activeTab?: string): AssetFileValidationResult`: Validates MIME type and file extension, determining asset category and suggested identifier
- `slugifyAssetId(fileName: string): string`: Converts filename into a clean, DSL-compliant identifier handle (lowercase alphanumeric and underscores, prepending underscore if starting with a digit)
- `IMAGE_EXTENSIONS`: Allowed image file extension list (`png`, `jpg`, `jpeg`, `webp`, `avif`, `svg`)
- `AUDIO_EXTENSIONS`: Allowed audio file extension list (`mp3`, `wav`, `ogg`, `m4a`, `aac`, `flac`)
- `ALLOWED_IMAGE_MIME`, `ALLOWED_AUDIO_MIME`: Allowed MIME type lists
- `AssetFileValidationResult`: Return type interface for validation
- `TitleAssetRole`: Discriminated union of title screen asset roles (`'logo' | 'background' | 'bgm'`)
- `TITLE_ROLE_LABELS`: Mapping of title asset roles to human-readable UI labels
- `getTitleRoleLabel(role: TitleAssetRole): string`: Returns display string for title role
- `getTitleAssetRoles(project: Project, assetId: string): TitleAssetRole[]`: Returns array of roles an asset holds in `titleSettings` in strict order (`logo`, `background`, `bgm`)
- `formatTitleAssetRoles(roles: TitleAssetRole[]): string`: Formats array of roles into comma-delimited UI text
- `normalizeProjectTitleSettings(project: Project, titleSettings?: ProjectTitleSettings): Project`: Normalizes project title settings, omitting undefined keys and dropping empty `titleSettings` property via destructuring
- `removeAssetFromTitleSettings(project: Project, assetId: string): Project`: Pure immutability helper removing an asset ID from all title settings roles and dropping the property if empty

## Invariants

- Generated asset IDs must begin with a letter or underscore and contain only lowercase alphanumeric characters and underscores (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`).
- Unsupported file types immediately fail validation with user-friendly error messages.
- `removeAssetFromTitleSettings` and `normalizeProjectTitleSettings` return new immutable project instances and never assign `undefined` to `titleSettings` (property is completely dropped if empty).

## Side Effects

- Pure calculation functions; no side effects or external I/O.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
