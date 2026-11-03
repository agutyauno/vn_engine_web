# UI Common Icons

## Overview

Provides a library of clean, monochrome vector SVG icons tailored for the Visual Novel Runtime Player UI. Built with Preact, these components implement a uniform design language without OS emojis or inline SVG duplicates.

## Interface

- `IconProps`: Sizing and CSS class configuration interface (`size?: number`, `className?: string`).
- `BackIcon({ size, className }: IconProps): JSX.Element`: Left chevron icon for dialogue rollback.
- `AutoIcon({ size, className }: IconProps): JSX.Element`: Play triangle icon for auto-advance mode.
- `SkipIcon({ size, className }: IconProps): JSX.Element`: Fast-forward icon for skip mode.
- `SaveIcon({ size, className }: IconProps): JSX.Element`: Floppy disk icon for saving and loading states.
- `SettingsIcon({ size, className }: IconProps): JSX.Element`: Cogwheel icon for opening the settings menu.
- `CloseIcon({ size, className }: IconProps): JSX.Element`: Cross icon for closing modal windows and drawers.
- `VolumeIcon({ size, className }: IconProps): JSX.Element`: Speaker icon for audio controls and voice replay.
- `EyeIcon({ size, className }: IconProps): JSX.Element`: Eye icon indicating visible UI elements.
- `EyeOffIcon({ size, className }: IconProps): JSX.Element`: Eye slash icon for hiding UI overlays.
- `HistoryIcon({ size, className }: IconProps): JSX.Element`: Clockwise arrow icon for opening the dialogue backlog.

## Invariants

- Icons are strictly monochrome SVG vectors utilizing `stroke="currentColor"` and `fill="none"` (except `AutoIcon` polygon fill).
- The default icon dimensions are 24x24 px when `size` is unspecified.
- Must remain pure, stateless functional Preact components.

## Side Effects

- None (pure visual rendering).

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
