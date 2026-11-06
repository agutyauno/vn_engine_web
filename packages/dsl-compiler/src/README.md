# DSL Compiler Core

## Overview

Multi-stage DSL compilation pipeline converting high-level Visual Novel Script (`.vns`) into AST and linear Bytecode IR instructions.

## Interface

- `Compiler`: Main pipeline coordinator (`compile(files, options)`, `compileString(content, fileName, options)`)
- `defaultCompiler`: Default singleton instance of `Compiler`
- `compile(files, options)`: Functional compilation entrypoint
- `compileString(content, fileName, options)`: Convenience single-string compilation helper
- `VNSLexer`: Chevrotain-based lexical analyzer tokenizing `.vns` source text
- `parserInstance`, `VNSParser`: Chevrotain CST parser defining language grammar
- `VNSAstBuilder`: CST visitor converting concrete syntax tree into structured `ProgramAST`
- `parseExpression(exprString, loc)`: jsep-based sandboxed expression parser
- `runMergePass(ast)`: Stage 0 pass resolving local sub-scenes (`.sub`) into flat canonical scenes and inheriting UI screens
- `resolveLocalSceneName(parentScene, localName)`: Helper resolving local dot-prefixed scene names
- `validateSceneStructure(ast)`: Semantic check enforcing 1-level sub-scene nesting (ADR-015)
- `validateSemantics(ast, options)`: Semantic validator checking variables, transitions, easings, audio assets, and dangling goto/call targets
- `CodeGenerator`, `generateBytecode(ast, characters)`: Stage 5 emitter producing linear `Instruction[]` IR
- `formatLexerError`, `formatParserError`, `cleanMessage`, `VNS_ERROR_CODES`: User-friendly diagnostic formatter producing structured errors
- `formatVnsScript(source, options)`: Automated code formatter for `.vns` scripts preserving indentation and trailing comments

## Invariants

- Pure computation: No DOM or browser API dependencies. Runs identically in Node.js, Web Worker, or main thread.
- Zero-Trust expressions: Expressions are parsed strictly into safe AST (`Literal`, `Identifier`, `BinaryExpression`, `UnaryExpression`, `CallExpression`); no `eval` or dynamic code execution.
- Sub-scene nesting limit: Local sub-scenes (`.name`) are strictly limited to at most 1 level of nesting inside top-level global scenes (ADR-015).
- Strict dependency: Only depends on `@vn-engine/shared-types`, `chevrotain`, and `jsep`.

## Side Effects

- None (pure transformation from text to AST and Bytecode arrays).

## Verification

- Run: `pnpm --filter @vn-engine/dsl-compiler test`
