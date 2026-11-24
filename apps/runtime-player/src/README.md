# Runtime Player Source

## Overview

Root application source code for the Visual Novel Runtime Player. Integrates the runtime kernel, platform adapters, Preact UI presentation tree, and application entry point.

## Interface

- `main.ts`: Application bootstrap script listening for `DOMContentLoaded`. In standalone mode, coordinates game bundle resolution (`loadGameBundle`) prior to initializing platform adapters and runtime kernel.
- `vite-env.d.ts`: TypeScript environment declarations for Vite client and scenario imports.
- Subdirectories:
  - [./adapters/README.md](./adapters/README.md): Platform adapters for PixiJS rendering, audio, storage, and preview bridge.
  - [./core/README.md](./core/README.md): Runtime kernel state machine, typewriter parsing, and contracts.
  - [./services/README.md](./services/README.md): Diagnostic reporting bus services.
  - [./ui/README.md](./ui/README.md): Preact UI presentation layer and context state.

## Invariants

- Inspects query parameters (`popout`, `mode=preview`, `embedded`, `editorOrigin`, `projectId`) to configure player mode.
- Standalone mode resolves game data via `loadGameBundle` (embedded `<script id="vn-game-bundle">` or `./project.json` fallback). Renders `GameDataErrorScreen` into `#ui-root` and halts on error or missing data (non-dev); dev mode without bundle falls back to compiling sample `scenario.vns`.
- Preview and embedded modes bypass `loadGameBundle` and await hot-reload from Web Studio Editor via `PreviewBridgeAdapter`.
- PixiJS canvas is attached to `#pixi-canvas-container` only upon entering `GAMEPLAY` mode.
- Mounts Preact root `<PlayerUIProvider>` and `<PlayerApp>` into `#ui-root`.

## Side Effects

- Direct DOM manipulation: Appends canvas and renders Preact UI into `#ui-root`.
- Initializes WebGL/WebGPU context via PixiJS and Web Audio context via Howler.
- Binds global window event listeners.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
