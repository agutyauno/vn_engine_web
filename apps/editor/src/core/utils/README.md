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

## Invariants

- Generated asset IDs must begin with a letter or underscore and contain only lowercase alphanumeric characters and underscores (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`).
- Unsupported file types immediately fail validation with user-friendly error messages.

## Side Effects

- Pure calculation functions; no side effects or external I/O.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
