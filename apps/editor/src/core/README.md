# core

## Overview

Core logic layer of the visual novel editor. Encapsulates persistence contracts, concrete storage repositories, compilation and communication services, reactive stores, and validation utilities.

## Subdirectories & Boundaries

- contracts: [./contracts/README.md](./contracts/README.md) - Repository pattern interfaces and data models decoupling persistence from UI.
- repositories: [./repositories/README.md](./repositories/README.md) - Concrete IndexedDB database implementations for project and asset storage.
- services: [./services/README.md](./services/README.md) - Compiler Web Worker service, postMessage preview bridge, AST reconciliation, and Monaco marker bridges.
- stores: [./stores/README.md](./stores/README.md) - Reactive Zustand state stores managing project data, UI layout, diagnostics, and live preview state.
- utils: [./utils/README.md](./utils/README.md) - Asset validation and identifier slugification utilities.
