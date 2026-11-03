# Core Contracts

## Overview

Data contracts, repository abstractions, and interfaces for the editor core. Implements the Repository Pattern decoupling persistence storage (IndexedDB, mock, or cloud backends) from the UI layer.

## Interface

- `ProjectRepository`: Interface defining repository operations (`listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `duplicateProject`, `exportProjectZip`, `importProjectZip`, `getStorageUsage`, `getAssetBlob`, `saveAssetBlob`, `deleteAssetBlob`)
- `ProjectSummary`: Lightweight metadata summary for listing projects
- `CreateProjectParams`: Input parameters for project creation
- `StorageEstimate`: Interface for used and quota bytes in storage
- `AssetBlobRecord`: Binary asset storage record structure
- Re-exported shared types: `Project`, `ProjectDisplaySettings`, `ProjectGameplaySettings`, `ProjectEditorSettings`, `DisplaySettings`, `GameplaySettings`, `EditorSettings`

## Invariants

- `ProjectRepository` implementations must guarantee that `getProject` returns full project data or `null` when not found.
- `listProjects` summaries must accurately reflect script, character, and asset counts.
- Asset blobs must be indexed and retrieved by their exact string `assetId`.

## Side Effects

- Interface contracts only; implementations perform asynchronous database operations and disk/storage queries.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
