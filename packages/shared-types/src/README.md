# Shared Types Core Contracts

## Overview

Core monorepo shared contract library defining TypeScript types, interfaces, constants, and data contracts for the AST, IR Bytecode Instruction Set, VM Runtime State, Save State, Project Metadata, and Diagnostics.

## Interface

- `NamedPosition`, `SUPPORTED_NAMED_POSITIONS`, `SUPPORTED_TRANSITIONS`, `SupportedTransition`, `SUPPORTED_EASINGS`, `SupportedEasing`, `CoordinatePosition`, `SourceLocation`
- `ExpressionAST`, `LiteralExpression`, `IdentifierExpression`, `BinaryExpression`, `UnaryExpression`, `CallExpression`
- `BaseASTNode`, `StatementAST`, `WaitStatement`, `DialogueStatement`, `RevealStatement`, `TransformProperties`, `MotionProperties`, `BackgroundStatement`, `ShowStatement`, `HideStatement`, `HideDialogueStatement`, `PlayStatement`, `StopStatement`, `ChoiceOption`, `ChoiceStatement`, `GotoStatement`, `CallStatement`, `ReturnStatement`, `EndStatement`, `IfStatement`, `WhileStatement`, `VarDefineStatement`, `VarAssignStatement`, `RunScriptStatement`, `SpawnScriptStatement`, `InspectStatement`, `SceneASTNode`, `ProgramAST`
- `BaseInstruction`, `DialogueInstruction`, `RevealInstruction`, `BackgroundInstruction`, `ShowInstruction`, `HideInstruction`, `HideDialogueInstruction`, `InspectBeginInstruction`, `InspectEndInstruction`, `PlayInstruction`, `StopInstruction`, `ChoiceInstruction`, `GotoInstruction`, `ConditionalGotoInstruction`, `LoopStartInstruction`, `LoopEndInstruction`, `CallInstruction`, `ReturnInstruction`, `HaltInstruction`, `SceneEndInstruction`, `AssignInstruction`, `LabelInstruction`, `RunScriptInstruction`, `SpawnScriptInstruction`, `SceneInstruction`, `WaitInstruction`, `Instruction`
- `CallFrame`, `VMState`, `StepResult`, `VMSnapshot`, `CURRENT_SAVE_VERSION`, `SaveFileData`, `LogChannel`, `LogLevel`, `LogEntry`, `PlayerLogMessage`, `DiagnosticCategory`, `DiagnosticSeverity`, `EngineDiagnostic`, `EngineDiagnosticMessage`, `DiagnosticsClearMessage`
- `ProjectDisplaySettings`, `DisplaySettings`, `ProjectGameplaySettings`, `GameplaySettings`, `ProjectEditorSettings`, `EditorSettings`, `ProjectMetadata`, `Project`, `ScriptFile`, `Character`, `VariableDeclaration`, `AssetCategory`, `AssetRef`, `UICustomScreen`, `CustomScriptScreen`

## Invariants

- Zero internal package dependencies: Must never import from any other workspace package (`core-vm`, `dsl-compiler`, `renderer`, `audio`, etc.).
- Pure TypeScript type declarations and constants only: Contains no runtime execution logic, side effects, or heavy dependencies.
- Serialization compatibility: All runtime state interfaces (`VMState`, `VMSnapshot`, `SaveFileData`) must remain JSON-pure and serializable.

## Side Effects

- None (pure type declarations and constant definitions).

## Verification

- Run: `pnpm --filter @vn-engine/shared-types test`
