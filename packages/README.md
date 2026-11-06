# Packages Subtree

## Overview

Monorepo root directory for engine packages, containing foundational contracts, DSL compilation, headless virtual machine runtime, 2D graphics rendering, and multi-channel audio.

## Subdirectories & Boundaries

- shared-types: [./shared-types/README.md](./shared-types/README.md) - Shared TypeScript data contracts, AST schemas, Bytecode instructions, and VM State.
- dsl-compiler: [./dsl-compiler/README.md](./dsl-compiler/README.md) - 5-stage .vns DSL compilation pipeline (Lexer, Parser, AST Builder, Semantic Validator, Codegen, Formatter).
- core-vm: [./core-vm/README.md](./core-vm/README.md) - Pure TypeScript virtual machine, instruction executor, snapshot ring buffer, safe evaluator, and save migration.
- renderer: [./renderer/README.md](./renderer/README.md) - 2D PixiJS graphic rendering layer, character sprite manager, stage transitions, and thumbnail capture.
- audio: [./audio/README.md](./audio/README.md) - Multi-channel Howler.js audio subsystem, volume controller, and state catch-up.
