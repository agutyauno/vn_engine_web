# Database Schema (db)

## Overview

The `db` package encapsulates the relational database schema, data integrity policies, and migration scripts powering the TaleForge (VN Engine Web) Studio persistence layer on Supabase PostgreSQL. It manages core domain entities including visual novel projects, chapter script files (`.vns`), multimedia asset metadata, customizable UI screens, sandbox script screens, and immutable historical resource snapshots. The schema is built to satisfy ADR-011 (Optimistic Concurrency Control), ADR-019, TAD 2.3, TAD 6.1, and PRD FR-6.8.

## Interface

- `public.projects`: Core project metadata entity mirroring `ProjectMetadata`: `title`, `description`, `default_language`, `entry_scene`, `version`, published runtime game link (`published_game_id`), global game variables (`variables` JSONB), and settings JSONB columns `display_settings`, `gameplay_settings`, `editor_settings`, `title_settings` (asset ids for the title logo/background/music).
- `public.script_files`: Granular script chapter storage storing script source (`content`), execution sequence (`order_index`), last modifying author (`updated_by`), and per-file OCC revision (`version`).
- `public.assets`: Media asset registry mirroring `AssetRef`: files (`storage_url`, `storage_path`, `size_bytes`), MIME domain (`type` IN `'image'`, `'audio'`, `'video'`, `'font'`), optional `category` (one of the 7 `AssetCategory` values or NULL), and sprite identity `tag`/`variant`.
- `public.ui_custom_screens`: UI layout templates binding custom interface layouts to predefined runtime slots (`target_slot` IN `'dialogueBox'`, `'choiceMenu'`, `'backlog'`, `'mainMenu'`, `'settingsMenu'`, `'saveLoadScreen'`).
- `public.custom_script_screens`: Advanced minigame and custom scripted screen container (`script_content`).
- `public.resource_snapshots`: Immutable historical snapshot log capturing versioned content deltas for undo/recovery of scripts and UI layouts (`resource_type` IN `'script_file'`, `'ui_screen'`).
- `public.project_members` (P1 blueprint): Role-based collaboration schema (`role` IN `'owner'`, `'editor'`, `'viewer'`).

## Invariants

- **Primary Keys**: Every entity table utilizes UUID primary keys defaulted with `gen_random_uuid()`.
- **Foreign Key Referential Integrity**: All sub-resources (`script_files`, `assets`, `ui_custom_screens`, `custom_script_screens`, `resource_snapshots`) maintain hard foreign key constraints to `public.projects(id)` with `ON DELETE CASCADE`.
- **User Ownership Constraints**: `projects.owner_id` and snapshot author `resource_snapshots.created_by` reference `auth.users(id)`.
- **Row Level Security (RLS)**: RLS is strictly enabled across all tables (`projects`, `script_files`, `assets`, `ui_custom_screens`, `custom_script_screens`, `resource_snapshots`), restricting mutations and reads strictly to authenticated project owners (`auth.uid() = owner_id` or owner lookup subqueries).
- **Unique Constraints**: Unique composite index on `(project_id, name)` in `public.script_files` preventing filename collisions within a project.
- **Optimistic Concurrency Control (OCC)**: `version` integer counters on `projects`, `script_files`, `assets`, and UI screens enforce ADR-011 conflict detection to prevent concurrent overwrite data loss.
- **Type Constraints**: Check constraints enforce explicit domain whitelists for media types, asset categories (NULL allowed), target UI slots, and snapshot resource types.
- **Contract Sync**: Every `AssetRef` field and every `ProjectMetadata` field (plus `Project.variables`) has a matching column. `packages/shared-types/tests/db_schema_sync.test.ts` enforces this: its field-to-column maps are typed `Record<keyof ...>`, so a new contract field without a column mapping fails typecheck, and the test fails when the column is missing from `schema.sql`.
- **Idempotent Migration**: Section 8 of `schema.sql` adds every column introduced after the first schema with `ADD COLUMN IF NOT EXISTS`, so it can be re-run on older databases. The schema never drops columns automatically; the removed `projects.characters` column must be dropped manually after a backup.

## Side Effects

- **Cascading Deletions**: Deleting a project automatically and permanently cascades deletion across all associated script files, assets metadata, custom UI screens, minigame scripts, and revision snapshots.
- **Snapshot Ledgering**: Resource mutations generate append-only snapshots in `public.resource_snapshots` for history tracking and rollback.
- **Audit Timestamps**: Default `now()` timestamps populate `created_at` and `updated_at` records on row insertions.

## Verification

- Run: `pnpm --filter @vn-engine/shared-types test` (schema drift guard) or `pnpm test`.
