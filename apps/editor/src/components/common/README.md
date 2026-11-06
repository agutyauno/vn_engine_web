# Common Components

## Overview

Shared visual foundation and icon repository for TaleForge Studio. Adheres to the monorepo's Clean Monochrome Iconography standard, providing standardized SVG icons with `stroke="currentColor"` or `fill="currentColor"`.

## Interface

- `IconProps`: SVG element props extending `React.SVGProps<SVGSVGElement>` with optional `size?: number | string`
- SVG Icon Components: `PlusIcon`, `TrashIcon`, `CopyIcon`, `SaveIcon`, `FolderIcon`, `FileTextIcon`, `ImageIcon`, `SearchIcon`, `CloseIcon`, `XIcon`, `UserIcon`, `SettingsIcon`, `PlayIcon`, `ExternalLinkIcon`, `ChevronLeftIcon`, `EditIcon`, `AlertTriangleIcon`, `AlertCircleIcon`, `MusicIcon`, `TerminalIcon`, `SlidersIcon`, `InfoIcon`, `ChevronUpIcon`, `ChevronDownIcon`, `ZapIcon`, `CheckIcon`, `PauseIcon`, `RotateCcwIcon`, `DownloadIcon`, `HelpCircleIcon`, `FlagIcon`

## Invariants

- 100% of UI icons must be monochrome vector SVGs using `currentColor` without hardcoded fill/stroke colors or OS emojis.
- All icons default to `size = 16` and forward standard SVG HTML attributes.

## Side Effects

- Pure SVG rendering; no side effects, state mutations, or external API calls.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
