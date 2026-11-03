# Core Repositories

## Overview

Data access and persistence implementations for TaleForge Studio. Provides the concrete `IndexedDBProjectRepository` providing browser-local client-side persistence for projects and binary asset blobs.

## Interface

- `IndexedDBProjectRepository`: Concrete class implementing `ProjectRepository`
  - `constructor(dbName?: string)`: Initializes repository with database name (default: `vn_engine_studio_db`)
  - `listProjects(): Promise<ProjectSummary[]>`
  - `getProject(id: string): Promise<Project | null>`
  - `createProject(params: CreateProjectParams): Promise<Project>`
  - `updateProject(project: Project): Promise<void>`
  - `deleteProject(id: string): Promise<void>`
  - `duplicateProject(id: string, newTitle: string): Promise<Project>`
  - `getAssetBlob(assetId: string): Promise<Blob | null>`
  - `saveAssetBlob(assetId: string, blob: Blob): Promise<void>`
  - `deleteAssetBlob(assetId: string): Promise<void>`
  - `getStorageUsage(): Promise<StorageEstimate>`
  - `close(): Promise<void>`

## Invariants

- Database schema contains two object stores: `projects` (keyPath: `id`) and `asset_blobs` (keyPath: `id`).
- Project updates automatically refresh `updatedAt` with the current millisecond timestamp.
- Projects are listed sorted by `updatedAt` descending.

## Side Effects

- Creates, reads, updates, and deletes records in browser IndexedDB.
- Calls `navigator.storage.estimate()` to inspect storage usage and quota.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
