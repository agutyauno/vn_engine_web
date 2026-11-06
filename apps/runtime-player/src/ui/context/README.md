# Player UI Context

## Overview

Encapsulates reactive Preact state management for the player UI. It connects the `VNRuntimeKernel` event emitter with Preact context providers, supplying synchronized view state and memoized action dispatchers.

## Interface

- `PlayerUIProviderProps`: Props interface containing optional `kernel`, mocked `state`, `actions`, and `children`.
- `PlayerUIProvider(props: PlayerUIProviderProps): JSX.Element`: Root provider supplying state and action contexts.
- `usePlayerState(): PlayerViewState`: Hook returning current reactive player view state.
- `usePlayerActions(): PlayerUIActions`: Hook returning player action dispatchers.

## Invariants

- `usePlayerState` and `usePlayerActions` throw an explicit runtime error when invoked outside `PlayerUIProvider`.
- When initialized with a `kernel`, the provider subscribes to kernel state changes on mount and unregisters on unmount.
- Action callbacks are memoized across re-renders to prevent unnecessary child component updates.

## Side Effects

- Registers a subscription listener with `VNRuntimeKernel.subscribe()`.
- Unsubscribes from kernel state changes upon component unmount.

## Verification

- Run: `pnpm --filter @vn-engine/runtime-player test`
