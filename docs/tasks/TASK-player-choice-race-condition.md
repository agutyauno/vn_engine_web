# TASK-player-choice-race-condition: Player Choice Race Condition & Safe Re-entrancy

## 1. Metadata
- **Status:** COMPLETED & VERIFIED (Phase 4)
- **Scope:** `apps/runtime-player`
- **Component:** `VNRuntimeKernel`, `ChoiceOverlay`, `PlayerUIContext`
- **Issue:**
  ```
  VNRuntimeKernel.ts:164 Uncaught (in promise) Error: Choice index 0 is out of bounds or no active choices
      at VNRuntimeKernel.selectChoice (VNRuntimeKernel.ts:164:13)
      at Object.selectChoice (PlayerUIContext.tsx:47:52)
      at handleKeyDown (ChoiceOverlay.tsx:37:19)
  ```

---

## 2. Root Cause Analysis
1. **Missing Immediate State Emission on Choice Selection**:
   In `VNRuntimeKernel.selectChoice(index)`:
   - `this.state.activeChoices = null;` is set synchronously, but `this.emit()` was NOT called.
   - `await this.runForward();` executes asynchronously (awaiting renderer side-effects, texture loading, audio commands).
   - During this time, `ChoiceOverlay` remains mounted in the UI with its `keydown` listener active and the old `activeChoices` in state.
2. **Missing `e.repeat` Guard & Re-entrancy Protection in `ChoiceOverlay`**:
   - `handleKeyDown` does not check `if (e.repeat) return;`. Holding `Enter` or pressing it rapidly generates repeated keydown events.
   - If a second keydown event arrives while `runForward()` is awaiting, `handleKeyDown` calls `actions.selectChoice(focusedIndex)` again.
3. **Destructive Fatal Error on Inactive Choices**:
   - In `VNRuntimeKernel.selectChoice`:
     `if (!this.state.activeChoices || !this.state.activeChoices[index]) throw new Error(...)`
   - When the second call arrives, `this.state.activeChoices` is already `null`.
   - Throwing an unhandled fatal error crashes the runtime player. Inactive choice selections should safely return early.
4. **Unhandled Promise Rejection in Context Provider**:
   - `PlayerUIContext.tsx` invokes `selectChoice` via `void kernel.selectChoice(index)`. Any unhandled rejection escapes to `window.onerror`.
5. **Missing Concurrency Guard on `advance()` and `selectChoice()`**:
   - Concurrent or re-entrant invocations can execute `this.vm.runUntilInteractive()` simultaneously while asynchronous side effects are still processing.

---

## 3. Architecture & Technical Design

### A. `VNRuntimeKernel.ts`
1. **Safe Handling of Inactive Choices**:
   - If `!this.state.activeChoices`: Return early (`return;`), indicating choices were already submitted or engine is not awaiting choice input.
   - If `index < 0 || !this.state.activeChoices[index]`: Throw `Error(`Choice index ${index} is out of bounds (total choices: ${this.state.activeChoices.length})`)`.
   - If `!choice.isSatisfied`: Throw `Error(`Choice condition is not satisfied for option: ${choice.text}`)`.
2. **Immediate UI Notification (`this.emit()`)**:
   - Call `this.emit()` immediately after `this.state.activeChoices = null;` so subscribers unmount `ChoiceOverlay` without waiting for `runForward()` side effects to complete.
3. **Re-entrancy Lock (`isAdvancing`)**:
   - Prevent concurrent execution of `runForward()` across `advance()` and `selectChoice()`.

### B. `ChoiceOverlay.tsx`
1. Ignore repeating keys: `if (e.repeat) return;`.
2. Prevent default and stop propagation on confirmed keys (`Enter`, number keys 1-9).
3. Reset `focusedIndex` to 0 whenever `activeChoices` changes.
4. Guard `activeChoices[focusedIndex]?.isSatisfied` before calling `actions.selectChoice`.

### C. `PlayerUIContext.tsx`
1. Catch and log errors in `selectChoice`:
   `selectChoice: (index: number) => { void kernel.selectChoice(index).catch(err => console.error('[VNRuntimeKernel] selectChoice error:', err)); }`

---

## 4. Test Scenarios (TDD Plan)

### Phase 1: RED Test Suite (`apps/runtime-player/tests/choice_resilience.test.ts`)
1. **Test 1: Multiple Concurrent `selectChoice` Calls**:
   - Calling `kernel.selectChoice(0)` twice in parallel or sequence does NOT throw `Choice index 0 is out of bounds or no active choices`. The second call is safely ignored.
2. **Test 2: Immediate Emission on Choice Selection**:
   - Subscribing to kernel state verifies that an emission with `activeChoices === null` occurs immediately when `selectChoice` is invoked, before asynchronous side effects complete.
3. **Test 3: Repeating Keydown / `e.repeat` in `ChoiceOverlay`**:
   - Firing `keydown` with `key: 'Enter', repeat: true` does not trigger `actions.selectChoice`.
4. **Test 4: Selection with Out-of-Bounds vs Inactive**:
   - Calling `selectChoice(0)` when `activeChoices` is `null` returns cleanly without throwing.
   - Calling `selectChoice(99)` when active choices exist with length 2 throws out-of-bounds error.

### Phase 2: GREEN Implementation
- Update `VNRuntimeKernel.ts`: early return on `!this.state.activeChoices`, immediate `this.emit()`, and `isAdvancing` lock.
- Update `ChoiceOverlay.tsx`: add `e.repeat` guard and `focusedIndex` synchronization.
- Update `PlayerUIContext.tsx`: catch unhandled rejections in `selectChoice`.

---

## 5. Affected Files
- `docs/tasks/TASK-player-choice-race-condition.md` (Specification)
- `apps/runtime-player/tests/choice_resilience.test.ts` (New test file)
- `apps/runtime-player/src/core/VNRuntimeKernel.ts` (Immediate emit & safe bounds check)
- `apps/runtime-player/src/ui/components/ChoiceOverlay.tsx` (Repeat key guard & index sync)
- `apps/runtime-player/src/ui/context/PlayerUIContext.tsx` (Promise error handling)

