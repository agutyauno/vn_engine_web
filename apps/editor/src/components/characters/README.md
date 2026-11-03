# Character Components

## Overview

Character management UI subsystem for TaleForge Studio. Provides character roster visualization (`CharacterManagerPane`) with uncreated character quick-fix detection from AST scans, filtering, search, and a modal dialog (`CharacterModal`) for managing character identity, nameplate theme colors, and sprite expressions with bulk file drop support.

## Interface

- `CharacterManagerPane`: React functional component rendering character lists and uncreated AST warnings
- `CharacterManagerPaneProps`: Props interface (`characters`, `uncreatedIds`, `onCreateCharacter`, `onEditCharacter`, `onDeleteCharacter`)
- `CharacterModal`: Modal dialog component for creating/editing character metadata and sprite expressions
- `CharacterModalProps`: Props interface (`isOpen`, `initialData`, `existingIds`, `onClose`, `onSave`)
- `CharacterSpriteRow`: Interface for expression rows (`id`, `expressionKey`, `imageUrl`, `fileName`, `sizeBytes`, `isDefault`)
- `COLOR_SWATCHES`: Default hex color palette strings
- `normalizeHex(input: string, fallback?: string): string`: Normalizes 3-digit or 6-digit hex codes to lowercase `#rrggbb`
- `isValidHex(input: string): boolean`: Validates hex color syntax
- `escapeRegex(str: string): string`: Helper to escape regex special characters
- `deriveExpressionKey(fileName: string, charId?: string): string`: Extracts expression key from filename, stripping character prefixes and extensions

## Invariants

- Character IDs must be alphanumeric plus underscores (`/^[a-zA-Z0-9_]+$/`) and unique across the project (case-insensitive).
- Editing an existing character prohibits mutating `id` (handle) to maintain script AST reference integrity.
- Exactly one expression must be marked as default if expressions exist (`isDefault: true`).
- Colors must resolve to valid lowercase `#rrggbb` hex values.

## Side Effects

- Encodes uploaded character sprite image files to base64 data URLs via client-side `FileReader`.
- Dispatches `onSave` / `onDeleteCharacter` callback props to trigger persistence in parent/stores.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
