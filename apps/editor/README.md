# @vn-engine/editor

## Overview

TaleForge Studio web editor application package (`@vn-engine/editor`). Provides a browser-based Visual Novel authoring environment featuring a Monaco-based VNS script editor, real-time live preview sandbox player bridge, character & expression manager, asset library, and release export wizard, configured with Vite, React 19, Tailwind CSS, and Vitest.

## Interface

- Package: `@vn-engine/editor` (version `0.1.0`)
- Scripts:
  - `pnpm dev`: Start Vite development server on port 3001
  - `pnpm build`: Build production web bundle with ESNext target
  - `pnpm preview`: Preview production build
  - `pnpm typecheck`: Run TypeScript type checking (`tsc --noEmit`)
  - `pnpm test`: Run test suite (`vitest run`)
- Subdirectories:
  - [./src/README.md](./src/README.md): Application source code, language definitions, and architectural subsystems

## Invariants

- Strictly follows the Repository Pattern for data access, isolating Editor UI from storage mechanics.
- Zero-Trust content model: VNS evaluation and script execution are strictly delegated to sandboxed preview runtime via `postMessage`.
- Pure TypeScript with strict mode enabled; all icons adhere to Clean Monochrome Iconography.

## Side Effects

- Compiles frontend bundle via Vite to `dist/`.
- Serves static development assets on port 3001.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
