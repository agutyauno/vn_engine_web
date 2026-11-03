# Editor Source

## Overview

Root source directory for the TaleForge Web Editor application. Houses root React application entry points (`App.tsx`, `main.tsx`), custom VNS Monaco language syntax definition and theme (`vnsLanguage.ts`), Monaco language features provider (`vnsLanguageFeatures.ts`), and global stylesheet (`index.css`), while routing into component, core, and hook subpackages.

## Interface

- `App`: Top-level React application component with hash-based routing between Project Hub and Studio Workspace
- `AppProps`: Props interface (`repository?: ProjectRepository`, `initialRoute?: AppRoute`)
- `AppRoute`: Route discriminated union (`{ view: 'hub' } | { view: 'studio', projectId: string }`)
- `parseHashRoute(hash: string): AppRoute`: Utility parsing window location hashes (`#/projects`, `#/editor/:id`, `#/studio/:id`)
- `registerVnsLanguage(): void`: Registers `vns` language ID, Monarch syntax tokenizer, brackets, and `vns-wireframe-dark` Monaco theme
- `registerVnsLanguageFeatures(context: VnsProjectContext): void`: Registers Monaco auto-completion, go-to-definition, document formatting, and hover card providers
- Subdirectories:
  - [./components/README.md](./components/README.md): Component library and workspace UI panes
  - [./core/README.md](./core/README.md): Business logic, contracts, repositories, services, stores, and utilities
  - [./hooks/README.md](./hooks/README.md): Custom React hooks for compilation pipeline and keyboard shortcuts

## Invariants

- Default route resolves to `hub` when no hash or unmatched hash is present.
- Hash navigation updates both internal state and `window.location.hash` cleanly.
- Monaco language features register exactly once per session.

## Side Effects

- Mounts React DOM tree to `#root`.
- Adds and removes `hashchange` and `popstate` listeners on `window`.
- Registers global Monaco editor language definitions and Monarch tokens.

## Verification

- Run: `pnpm --filter @vn-engine/editor test`
