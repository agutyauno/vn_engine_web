# TASK-preview-cross-origin-asset-hydration: Cross-Origin Asset Blob Hydration & Renderer Resilience

## 1. Metadata
- **Status:** COMPLETED & VERIFIED (Phase 2 & Review Gate Passed)
- **Scope:** `apps/runtime-player`, `packages/renderer`
- **Component:** `PreviewBridgeAdapter`, `AssetResolverAdapter`, `GameRenderer`
- **Issue:**
  ```
  PixiJS Warning: [Assets] blob:http://localhost:3001/... could not be loaded as we don't know how to parse it, ensure the correct parser has been added
  Uncaught (in promise) TypeError: Cannot read properties of null (reading 'width')
      at GameRenderer.setBackground (renderer.js:191:30)
      at async RendererAdapter.applySideEffect (RendererAdapter.ts:50:11)
      at async VNRuntimeKernel.runForward (VNRuntimeKernel.ts:191:9)
      at async VNRuntimeKernel.startNewGame (VNRuntimeKernel.ts:108:5)
      at async VNRuntimeKernel.loadProgram (VNRuntimeKernel.ts:556:7)
      at async Object.onHotReload (main.ts:112:7)
  ```

---

## 2. Root Cause Analysis
1. **Cross-Origin Blob URLs between Editor (`:3001`) and Player (`:3000`)**:
   - In Editor (`http://localhost:3001`), user-uploaded assets (backgrounds, sprites, audio) are stored in IndexedDB and hydrated as `blob:http://localhost:3001/<uuid>`.
   - When Play (F5) or Live Preview is triggered, Editor sends `HOT_RELOAD_PROGRAM` payload containing `assets: currentProject.assets`.
   - Browser Same-Origin Policy strictly prohibits `http://localhost:3000` from fetching or loading a `blob:` URL created by `http://localhost:3001`.
   - When PixiJS in Player calls `Assets.load("blob:http://localhost:3001/...")`, the browser throws `TypeError: Failed to fetch`.
2. **Missing Client Implementation of `ASSET_BLOB_REQUEST` on Player**:
   - Editor's `PreviewBridge` already contains a handler for `ASSET_BLOB_REQUEST` / `GET_ASSET_BLOB`, converting IndexedDB Blobs into `ArrayBuffer` and transferring them via `postMessage`.
   - However, Player's `PreviewBridgeAdapter` did not implement `requestAssetBlob` or listen for `ASSET_BLOB_RESPONSE`.
3. **Outdated Compilation in `packages/renderer/dist`**:
   - The compiled JavaScript in `packages/renderer/dist/renderer.js` was out of date with `src/renderer.ts`, lacking the null-coalescing guard `(await resolve...) || Texture.EMPTY` and `texture?.width`.

---

## 3. Architecture & Technical Design

### A. Player `PreviewBridgeAdapter.ts`
- Implement `requestAssetBlob(assetId: string): Promise<Blob | null>`:
  - Generates a unique `requestId`.
  - Maps `requestId` to a Promise resolver with a 5000ms timeout.
  - Sends `{ type: 'ASSET_BLOB_REQUEST', assetId, requestId }` to Editor via `postToEditor`.
- Handle `ASSET_BLOB_RESPONSE` in `handleMessage(event)`:
  - Validates `data.requestId`.
  - Reconstructs `new Blob([data.buffer], { type: data.mimeType || 'application/octet-stream' })`.
  - Resolves the matching pending Promise.

### B. Asset Hydration in `apps/runtime-player/src/main.ts`
- In `onHotReload(newProgram, opts)`:
  - Detect foreign blob URLs in `opts.assets`:
    `asset.storageUrl?.startsWith('blob:') && !asset.storageUrl.startsWith(window.location.origin)`
  - Concurrently request binary blobs from Editor via `bridge.requestAssetBlob(asset.id)`.
  - If received, create a local blob URL in Player's origin:
    `asset.storageUrl = URL.createObjectURL(blob)`.
  - Proceed with `kernel.loadProgram` and `kernel.startNewGame`.

### C. Build & Resilience in `@vn-engine/renderer`
- Ensure `packages/renderer/dist` is compiled and strictly adheres to safe null fallbacks:
  `texture = (await this.resolveOrGenerateBackgroundTexture(...)) || Texture.EMPTY;`
  `texWidth = texture?.width || this.baseWidth;`

---

## 4. Test Scenarios (TDD Plan)

### Phase 1: RED Test Suite (`apps/runtime-player/tests/preview_asset_hydration.test.ts`)
1. **Test 1: `requestAssetBlob` dispatches `ASSET_BLOB_REQUEST`**:
   - Verify `adapter.requestAssetBlob('asset-1')` sends `{ type: 'ASSET_BLOB_REQUEST', assetId: 'asset-1', requestId }` to Editor.
2. **Test 2: `ASSET_BLOB_RESPONSE` resolves with Blob**:
   - Verify when `ASSET_BLOB_RESPONSE` with `ArrayBuffer` arrives, `requestAssetBlob` resolves with `Blob`.
3. **Test 3: Foreign Blob URL Hydration in Player**:
   - Verify an asset with foreign `blob:http://localhost:3001/uuid` is replaced with a local `blob:http://localhost:3000/uuid` when hydrated.
4. **Test 4: Timeout & Error Resilience**:
   - Verify `requestAssetBlob` resolves with `null` when Editor returns `error: 'NOT_FOUND'` or times out, without crashing.

### Phase 2: GREEN Implementation
- Update `apps/runtime-player/src/adapters/PreviewBridgeAdapter.ts`.
- Update `apps/runtime-player/src/main.ts`.
- Rebuild `packages/renderer`.
- Verify with `pnpm --filter @vn-engine/runtime-player test`.

---

## 5. Affected Files
- `docs/tasks/TASK-preview-cross-origin-asset-hydration.md` (Specification)
- `apps/runtime-player/tests/preview_asset_hydration.test.ts` (New test file)
- `apps/runtime-player/src/adapters/PreviewBridgeAdapter.ts` (Request/Response bridge)
- `apps/runtime-player/src/main.ts` (Asset hydration on hot reload)
- `packages/renderer/dist/` (Recompiled)

