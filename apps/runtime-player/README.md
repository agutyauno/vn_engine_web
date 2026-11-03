# @vn-engine/runtime-player

## Overview

Standalone web runtime player and sandbox preview container for the Visual Novel Web Engine. It executes compiled visual novel scenarios, manages PixiJS 2D scene rendering, multi-channel Howler audio, save states, and communicates with the Web Studio Editor via a secure postMessage bridge.

## Interface

- Package Scripts:
  - `pnpm --filter @vn-engine/runtime-player dev`: Launches local Vite development server on port 3000.
  - `pnpm --filter @vn-engine/runtime-player build`: Compiles production bundle using ESNext target.
  - `pnpm --filter @vn-engine/runtime-player preview`: Previews built production bundle.
  - `pnpm --filter @vn-engine/runtime-player typecheck`: Runs TypeScript compiler check (`tsc --noEmit`).
  - `pnpm --filter @vn-engine/runtime-player test`: Runs Vitest test suite in jsdom environment.
- Subdirectories:
  - [./src/README.md](./src/README.md): Application source code, runtime kernel, adapters, and UI hierarchy.

## Invariants

- Operates identically as an embedded iframe preview, popout window, or standalone web game player.
- All untrusted scripts execute strictly via bytecode in `@vn-engine/core-vm`.
- Zero-trust preview bridge sanitizes all incoming postMessage messages.

## Side Effects

- Runs local HTTP dev server on port 3000.
- Reads/writes browser `localStorage` for save data.
- Emits WebGL/WebGPU render passes and Web Audio sound output.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
