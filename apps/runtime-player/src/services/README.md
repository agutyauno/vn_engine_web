# Services & Diagnostics

## Overview

Defines shared diagnostic service interfaces for reporting asset resolution warnings, compilation errors, and runtime diagnostics across subsystem boundaries.

## Interface

- `DiagnosticReportInput`: Discriminated union accepting structured diagnostic inputs or engine diagnostics.
- `DiagnosticBus`: Service contract for reporting and clearing diagnostics, and setting editor origin.

## Invariants

- Diagnostic reporting remains decoupled from specific transports (console, postMessage, or external logging service).

## Side Effects

- Forwards diagnostic events across subsystem boundaries.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
