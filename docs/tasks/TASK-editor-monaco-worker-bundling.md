# TASK-editor-monaco-worker-bundling: Monaco Editor Web Worker Bundling & Environment Setup

## 1. Metadata
- **Status:** COMPLETED & VERIFIED (Phase 4)
- **Scope:** `apps/editor`
- **Component:** `MonacoEnvironment`, `MonacoEditorContainer`, Vite Bundler
- **Issue:**
  ```
  Failed to load worker script for label: editorWorkerService.
  Ensure your bundler properly bundles modules referenced by "new URL('...?esm', import.meta.url)". TypeError: Failed to fetch dynamically imported module: http://localhost:3001/node_modules/common/services/editorWebWorkerMain.js#editorWorkerService
  5c237de3-b650-462c-b5e2-ae9a9613218d:1 

  Uncaught TypeError: Failed to fetch dynamically imported module: http://localhost:3001/node_modules/common/services/editorWebWorkerMain.js#editorWorkerService
  ```

---

## 2. Root Cause Analysis
1. **Unconfigured `MonacoEnvironment`**:
   - In Monaco Editor v0.56.0, the editor relies on background web workers for editor services (such as syntax validation, tokenization, diffing, and command execution under the label `editorWorkerService`).
   - If `window.MonacoEnvironment` (or `self.MonacoEnvironment`) is not defined with a custom `getWorker` or `getWorkerUrl` implementation, Monaco attempts to dynamically import `editorWebWorkerMain.js` via:
     `new Worker(new URL('...?esm', import.meta.url), { type: 'module' })`
2. **Vite Dynamic Import Mismatch**:
   - In Vite (especially in development mode at `http://localhost:3001`), this dynamic URL resolves to an unbundled module path:
     `http://localhost:3001/node_modules/common/services/editorWebWorkerMain.js#editorWorkerService`
   - Vite cannot serve or resolve this internal module URL, causing an HTTP 404 / `TypeError: Failed to fetch dynamically imported module` and an uncaught runtime error in the console whenever Monaco Editor is initialized.

---

## 3. Architecture & Technical Design

### A. Worker Factory via Vite's Native `?worker` Query (`apps/editor/src/monacoEnvironment.ts`)
- Vite natively supports bundling worker files with the `?worker` import query, producing self-contained Web Worker constructors without requiring external plugins.
- We define a centralized module `apps/editor/src/monacoEnvironment.ts`:
  ```typescript
  import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
  import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
  import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
  import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
  ```
- Expose `setupMonacoEnvironment()`:
  - If `window.MonacoEnvironment` is already configured, do not overwrite unless re-requested.
  - Set `window.MonacoEnvironment = { getWorker(_: unknown, label: string): Worker { ... } }`.
  - Route labels:
    - `'json'`: `new jsonWorker()`
    - `'css'`, `'scss'`, `'less'`: `new cssWorker()`
    - `'html'`, `'handlebars'`, `'razor'`: `new htmlWorker()`
    - `'typescript'`, `'javascript'`: `new tsWorker()`
    - Default (including `'editorWorkerService'`, `'vns'`, etc.): `new editorWorker()`

### B. Bootstrap Integration
1. **`apps/editor/src/main.tsx`**:
   - Call `setupMonacoEnvironment()` before React renders `<App />` to guarantee that the environment is set up at page load.
2. **`apps/editor/src/components/studio/MonacoEditorContainer.tsx`**:
   - Call `setupMonacoEnvironment()` inside `initMonaco()` before `monacoModule.editor.create(...)` to guarantee worker availability even in lazy/isolated component mounts.

---

## 4. Test Scenarios (TDD Plan)

### Phase 1: RED Test Suite (`apps/editor/tests/services/monaco_environment.test.ts`)
1. **Test 1: Environment Initialization**:
   - Calling `setupMonacoEnvironment()` registers `window.MonacoEnvironment` with a defined `getWorker` function.
2. **Test 2: `editorWorkerService` Resolution**:
   - Calling `window.MonacoEnvironment.getWorker('any-id', 'editorWorkerService')` returns an instantiated worker from `editorWorker`.
3. **Test 3: Language-Specific Workers**:
   - Calling with `'json'`, `'css'`, `'html'`, `'typescript'` returns respective worker instances.
4. **Test 4: Fallback for Unknown / Custom Language (`vns`)**:
   - Calling with `'vns'` or unknown label returns the default `editorWorker`.
5. **Test 5: Idempotency & Re-execution**:
   - Calling `setupMonacoEnvironment()` multiple times does not throw and preserves valid worker resolution.

### Phase 2: GREEN Implementation
- Create `apps/editor/src/monacoEnvironment.ts`.
- Integrate in `apps/editor/src/main.tsx` and `apps/editor/src/components/studio/MonacoEditorContainer.tsx`.
- Verify with `pnpm --filter @vn-engine/editor test` and `pnpm --filter @vn-engine/editor build`.

---

## 5. Affected Files
- `docs/tasks/TASK-editor-monaco-worker-bundling.md` (Specification)
- `apps/editor/tests/services/monaco_environment.test.ts` (New test file)
- `apps/editor/src/monacoEnvironment.ts` (New module)
- `apps/editor/src/main.tsx` (Bootstrap entry point)
- `apps/editor/src/components/studio/MonacoEditorContainer.tsx` (Editor container)

