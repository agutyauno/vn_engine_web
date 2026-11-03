# 2D Graphics Renderer

## Overview

2D hardware-accelerated graphics renderer based on PixiJS, managing stage scene graphs, backgrounds, multi-character sprites, transform animations, and layout positioning.

## Interface

- `GameRenderer`: PixiJS rendering coordinator (`init(containerElement, options)`, `resizeToContainer(container)`, `setBackground(assetIdOrInstr, transition, assetResolver)`, `showCharacter(instr, assetResolver, isProp)`, `hideCharacter(characterId, durationSec)`, `syncStateCatchUp(catchUp, assetResolver, isPropChecker)`, `captureThumbnail(targetWidth, targetHeight)`, `getCurrentBackgroundId()`, `hasCharacter(characterId)`, `destroy()`)
- `resolveCharacterPlacement(instr, baseWidth, baseHeight, isProp)`: Calculates absolute pixel placement combining named positions, coordinates, and offsets
- `resolveCharacterCoordinates(pos, baseWidth, baseHeight)`: Maps named presets (`left`, `center`, `right`) and fractional coordinates to pixel offsets
- `computeTargetScale(scale, scaleX, scaleY, flipX, flipY)`: Resolves compound scale factors and flip inversions
- `computeTargetRotation(rotateDeg)`: Converts degrees to radians
- `EASING_FUNCTIONS`: Standard easing function lookup table (`linear`, `ease_in`, `ease_out`, `ease_in_out`, `bounce`, `elastic`)
- Types: `RendererOptions`, `AssetGraphicResolver`, `CatchUpVisualState`, `CharacterPlacement`, `EasingFunction`

## Invariants

- Unidirectional data flow: Consumes instructions and catch-up states (`CatchUpVisualState`) emitted by the VM; never mutates internal VMState directly.
- Missing asset resiliency: If graphic assets fail to resolve, automatically generates Swiss-style wireframe placeholder textures with asset label text, preventing engine crashes.
- Aspect ratio preservation: Maintains 16:9 base aspect ratio (default 1920x1080) through letterbox/pillarbox responsive scaling.

## Side Effects

- DOM manipulation: Appends and resizes WebGL canvas in DOM container elements.
- Animation frame scheduling: Invokes `requestAnimationFrame` for sprite and camera transition tweens.
- WebGL context & texture allocations: Allocates and destroys PixiJS textures, sprites, and stage containers.

## Verification

- Run: `pnpm --filter @vn-engine/renderer test`
