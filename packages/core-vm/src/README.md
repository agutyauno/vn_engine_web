# Core VM Runtime Engine

## Overview

Headless runtime virtual machine executing compiled Bytecode IR (`Instruction[]`), managing state transitions, rollback buffers, sandboxed expression evaluation, string interpolation, and save/load persistence.

## Interface

- `VisualNovelVM`: Core runtime state machine (`constructor(program, initialState, options)`, `step()`, `runUntilInteractive(maxSteps)`, `choose(choiceIndex)`, `getAvailableChoices()`, `rollback()`, `rollforward()`, `canRollback()`, `canRollforward()`, `getStateCatchUp()`, `serialize(options)`, `restore(json)`, `getState()`, `startAt(target)`, `jumpToScene(targetScene, options)`, `jumpToLine(line, fileId, options)`, `getScriptHash()`, `getCurrentDialogueKey()`, `getDialogueKey(instructionIndex)`, `setVariable(name, value, scope)`, `getEvaluator()`, `getActiveExecutingPc()`)
- `computeScriptHash(program)`: Deterministic FNV-1a 32-bit hash generator for program instructions
- `SandboxEvaluator`: Zero-trust AST expression evaluator (`evaluate(node, variables)`, `registerFunction(name, fn)`)
- `SnapshotRingBuffer`: Fixed-capacity circular rollback history with forward-stack navigation (`push`, `rollback`, `rollforward`, `canRollback`, `canRollforward`, `clearForward`, `peek`, `size`, `clear`, `getHistory`)
- `interpolate(text, context, evaluator)`: Single-pass string interpolation engine supporting variables, fallback (`??`), filters (`:comma`, `:upper`, etc.), and typewriter control tags
- `migrateSaveData(data, targetVersion)`, `registerSaveMigration(from, to, migrator)`, `validateVMState(state)`: Save file schema validator and migration pipeline
- `isValidInstruction(item)`, `isValidProgram(program)`, `validateProgram(program)`: ADR-021 instruction and program boundary type guards
- Error classes: `VMRuntimeError`, `InstructionBudgetExceededError`, `InvalidChoiceError`, `SceneNotFoundError`, `VariableNotFoundError`, `FunctionNotAllowedError`, `PrototypePollutionError`, `EmptyCallStackError`, `InvalidSaveDataError`

## Invariants

- Headless & Pure TypeScript: Absolute ban on DOM/browser global APIs (`window`, `document`, `HTMLCanvasElement`, `AudioContext`). Operates purely in memory.
- Zero-Trust evaluation: Expression evaluation blocks prototype pollution (`__proto__`, `constructor`, `prototype`) and requires identifier whitelisting for custom functions.
- Deterministic state: All state stored in `VMState` is pure JSON-serializable data. State catch-up and snapshot rollback produce idempotent snapshots.
- Instruction budget safety: `runUntilInteractive` enforces a step budget (default 100,000) to guarantee termination against infinite script loops.

## Side Effects

- In-memory state mutation (`state`, `dialogueCounter`, `callStack`, `variables`, `ringBuffer`).
- Emits side-effect instructions (`Instruction[]`) for consumption by external presentation layers (Renderer, Audio).
- Emits console warnings for unhandled edge conditions (unmatched return on empty call stack, script hash mismatch).

## Verification

- Run: `pnpm --filter @vn-engine/core-vm test`
