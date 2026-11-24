# Packages Subtree

## Overview

Monorepo root directory for engine packages, containing foundational contracts, DSL compilation, headless virtual machine runtime, 2D graphics rendering, and multi-channel audio.

## Subdirectories & Boundaries

- shared-types: [./shared-types/README.md](./shared-types/README.md) - Shared TypeScript data contracts, AST schemas, Bytecode instructions, and VM State.
- dsl-compiler: [./dsl-compiler/README.md](./dsl-compiler/README.md) - 5-stage .vns DSL compilation pipeline (Lexer, Parser, AST Builder, Semantic Validator, Codegen, Formatter).
- core-vm: [./core-vm/README.md](./core-vm/README.md) - Pure TypeScript virtual machine, instruction executor, snapshot ring buffer, safe evaluator, and save migration.
- renderer: [./renderer/README.md](./renderer/README.md) - 2D PixiJS graphic rendering layer, character sprite manager, stage transitions, and thumbnail capture.
- audio: [./audio/README.md](./audio/README.md) - Multi-channel Howler.js audio subsystem, volume controller, and state catch-up.

## Verification

- `pnpm typecheck` runs two passes in every package: `tsc --noEmit` on `src/` (the `tsconfig.json` used for the build) and `tsc -p tsconfig.test.json` on `src/` + `tests/`. Test files are held to the same strict rules as source (no `any`, no `@ts-ignore`).
- `tsconfig.test.json` extends `tsconfig.base.json` with `noEmit` and without `composite`, so it never writes to `dist/`. Tests that import another workspace package resolve it through that package's `dist/`, so run `pnpm build` first.
- Instruction literals in tests follow the current `@vn-engine/shared-types` contracts (for example `SHOW`/`HIDE` use `targetId`/`variant`). The legacy `character`/`sprite` fields of `SHOW`/`HIDE` are no longer read anywhere; a test that checks they are ignored declares them with an explicit intersection type such as `ShowInstruction & { character: string }`.
