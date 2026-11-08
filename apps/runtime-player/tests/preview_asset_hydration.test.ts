import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AssetRef } from '@vn-engine/shared-types';
import {
  PreviewBridgeAdapter,
} from '../src/adapters/PreviewBridgeAdapter';
import * as PreviewBridgeModule from '../src/adapters/PreviewBridgeAdapter';

/**
 * Extended interface for PreviewBridgeAdapter with Phase 2 capabilities
 */
export interface ExtendedPreviewBridgeAdapter extends PreviewBridgeAdapter {
  requestAssetBlob(assetId: string, timeoutMs?: number): Promise<Blob | null>;
  hydrateAssets?(assets: AssetRef[]): Promise<AssetRef[]>;
}

type HydrateForeignAssetBlobsFn = (
  assets: AssetRef[],
  bridge: { requestAssetBlob(assetId: string): Promise<Blob | null> },
  currentOrigin?: string,
) => Promise<AssetRef[]>;

function getHydrateForeignAssetBlobs(): HydrateForeignAssetBlobsFn {
  const fn = (PreviewBridgeModule as Record<string, unknown>).hydrateForeignAssetBlobs;
  if (typeof fn !== 'function') {
    throw new TypeError(
      'hydrateForeignAssetBlobs is not implemented or not exported from PreviewBridgeAdapter',
    );
  }
  return fn as HydrateForeignAssetBlobsFn;
}

describe('Cross-Origin Asset Blob Hydration & Preview Bridge', () => {
  let mockTargetWindow: { postMessage: ReturnType<typeof vi.fn> };
  let postedMessages: Array<{ message: any; targetOrigin: string }>;

  beforeEach(() => {
    postedMessages = [];
    mockTargetWindow = {
      postMessage: vi.fn((message: unknown, targetOrigin: string) => {
        postedMessages.push({ message, targetOrigin });
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('PreviewBridgeAdapter.requestAssetBlob (Contract & Dispatch)', () => {
    it('dispatches ASSET_BLOB_REQUEST to Editor with assetId and requestId', async () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      // When calling requestAssetBlob, it should return a pending Promise
      const requestPromise = adapter.requestAssetBlob('asset-classroom-bg');

      expect(requestPromise).toBeInstanceOf(Promise);
      expect(mockTargetWindow.postMessage).toHaveBeenCalledTimes(1);

      const dispatched = postedMessages[0];
      expect(dispatched).toBeDefined();
      expect(dispatched.targetOrigin).toBe('http://localhost:3001');
      expect(dispatched.message).toMatchObject({
        type: 'ASSET_BLOB_REQUEST',
        assetId: 'asset-classroom-bg',
      });
      expect(typeof dispatched.message.requestId).toBe('string');
      expect(dispatched.message.requestId.length).toBeGreaterThan(0);
    });

    it('resolves Promise with Blob when ASSET_BLOB_RESPONSE arrives from Editor', async () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      const requestPromise = adapter.requestAssetBlob('asset-alice-sprite');
      const sentRequestId = postedMessages[0].message.requestId;

      // Simulate Editor replying with binary ArrayBuffer
      const payloadBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG Magic Bytes
      const inboundEvent = new MessageEvent('message', {
        origin: 'http://localhost:3001',
        data: {
          type: 'ASSET_BLOB_RESPONSE',
          assetId: 'asset-alice-sprite',
          requestId: sentRequestId,
          mimeType: 'image/png',
          buffer: payloadBytes.buffer,
        },
      });

      adapter.handleMessage(inboundEvent);

      const resultBlob = await requestPromise;
      expect(resultBlob).toBeInstanceOf(Blob);
      expect(resultBlob?.type).toBe('image/png');
      expect(resultBlob?.size).toBe(payloadBytes.byteLength);
    });

    it('defaults mimeType to application/octet-stream if omitted in response', async () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      const requestPromise = adapter.requestAssetBlob('asset-sound-sfx');
      const sentRequestId = postedMessages[0].message.requestId;

      const rawBytes = new Uint8Array([1, 2, 3, 4]);
      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3001',
          data: {
            type: 'ASSET_BLOB_RESPONSE',
            assetId: 'asset-sound-sfx',
            requestId: sentRequestId,
            buffer: rawBytes.buffer,
          },
        }),
      );

      const resultBlob = await requestPromise;
      expect(resultBlob).toBeInstanceOf(Blob);
      expect(resultBlob?.type).toBe('application/octet-stream');
    });

    it('resolves with null when Editor responds with error NOT_FOUND or READ_ERROR', async () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      const requestPromise = adapter.requestAssetBlob('asset-missing');
      const sentRequestId = postedMessages[0].message.requestId;

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3001',
          data: {
            type: 'ASSET_BLOB_RESPONSE',
            assetId: 'asset-missing',
            requestId: sentRequestId,
            error: 'NOT_FOUND',
          },
        }),
      );

      const result = await requestPromise;
      expect(result).toBeNull();
    });

    it('resolves with null when request times out without unhandled rejection', async () => {
      vi.useFakeTimers();

      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      const requestPromise = adapter.requestAssetBlob('asset-timeout', 3000);

      // Fast-forward past timeout duration
      vi.advanceTimersByTime(3100);

      const result = await requestPromise;
      expect(result).toBeNull();
    });

    it('ignores responses from unauthorized origins', async () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      const requestPromise = adapter.requestAssetBlob('asset-security-check');
      const sentRequestId = postedMessages[0].message.requestId;

      // Event from spoofed origin
      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://malicious-site.com',
          data: {
            type: 'ASSET_BLOB_RESPONSE',
            assetId: 'asset-security-check',
            requestId: sentRequestId,
            buffer: new Uint8Array([99]).buffer,
          },
        }),
      );

      // Verify request is NOT resolved with untrusted data
      let resolved = false;
      requestPromise.then(() => {
        resolved = true;
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(false);
    });

    it('cleans up pending timeouts when dispose is invoked', () => {
      vi.useFakeTimers();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow as unknown as Window,
        editorOrigin: 'http://localhost:3001',
      }) as ExtendedPreviewBridgeAdapter;

      adapter.requestAssetBlob('asset-dispose', 5000);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      adapter.dispose();
      expect(() => vi.runAllTimers()).not.toThrow();
    });
  });

  describe('hydrateForeignAssetBlobs (Origin Detection & URL Replacement)', () => {
    it('detects foreign blob URLs, fetches Blobs via bridge, and replaces with local object URLs', async () => {
      const hydrateForeignAssetBlobs = getHydrateForeignAssetBlobs();

      const foreignBlobUrl = 'blob:http://localhost:3001/a1b2c3d4-e5f6-7890';
      const localBlobUrl = 'blob:http://localhost:3000/already-local-blob';
      const cdnUrl = 'https://r2.cdn.vnengine.io/assets/bg_hallway.webp';

      const assets: AssetRef[] = [
        {
          id: 'asset-foreign-bg',
          name: 'bg_classroom.png',
          type: 'image',
          category: 'background',
          storageUrl: foreignBlobUrl,
          sizeBytes: 1024,
        },
        {
          id: 'asset-local-bg',
          name: 'bg_park.png',
          type: 'image',
          category: 'background',
          storageUrl: localBlobUrl,
          sizeBytes: 2048,
        },
        {
          id: 'asset-cdn-bg',
          name: 'bg_hallway.webp',
          type: 'image',
          category: 'background',
          storageUrl: cdnUrl,
          sizeBytes: 4096,
        },
      ];

      const sampleBinaryBlob = new Blob(['image-content-bytes'], { type: 'image/png' });
      const mockBridge = {
        requestAssetBlob: vi.fn().mockImplementation(async (assetId: string) => {
          if (assetId === 'asset-foreign-bg') {
            return sampleBinaryBlob;
          }
          return null;
        }),
      };

      const newLocalBlobUrl = 'blob:http://localhost:3000/newly-rehydrated-uuid';
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue(newLocalBlobUrl);

      const result = await hydrateForeignAssetBlobs(assets, mockBridge, 'http://localhost:3000');

      // 1. Only foreign blob should trigger requestAssetBlob
      expect(mockBridge.requestAssetBlob).toHaveBeenCalledTimes(1);
      expect(mockBridge.requestAssetBlob).toHaveBeenCalledWith('asset-foreign-bg');

      // 2. createObjectURL should be called with the received Blob
      expect(createObjectURLSpy).toHaveBeenCalledWith(sampleBinaryBlob);

      // 3. foreign blob storageUrl must be updated to local origin blob URL
      expect(result[0].storageUrl).toBe(newLocalBlobUrl);

      // 4. local blob and CDN URLs must remain untouched
      expect(result[1].storageUrl).toBe(localBlobUrl);
      expect(result[2].storageUrl).toBe(cdnUrl);
    });

    it('safely preserves original storageUrl if bridge returns null (asset not found in Editor)', async () => {
      const hydrateForeignAssetBlobs = getHydrateForeignAssetBlobs();

      const deadBlobUrl = 'blob:http://localhost:3001/missing-in-editor';
      const assets: AssetRef[] = [
        {
          id: 'asset-missing-in-editor',
          name: 'lost.png',
          type: 'image',
          storageUrl: deadBlobUrl,
          sizeBytes: 500,
        },
      ];

      const mockBridge = {
        requestAssetBlob: vi.fn().mockResolvedValue(null),
      };

      const result = await hydrateForeignAssetBlobs(assets, mockBridge, 'http://localhost:3000');

      expect(mockBridge.requestAssetBlob).toHaveBeenCalledWith('asset-missing-in-editor');
      // Fallback: storageUrl is not overwritten with empty or broken value
      expect(result[0].storageUrl).toBe(deadBlobUrl);
    });

    it('handles empty asset lists and assets with undefined/empty storageUrl without throwing', async () => {
      const hydrateForeignAssetBlobs = getHydrateForeignAssetBlobs();

      const mockBridge = {
        requestAssetBlob: vi.fn().mockResolvedValue(null),
      };

      const emptyResult = await hydrateForeignAssetBlobs([], mockBridge, 'http://localhost:3000');
      expect(emptyResult).toEqual([]);

      const assetsWithEmptyUrl: AssetRef[] = [
        {
          id: 'asset-no-url',
          name: 'nourl.png',
          type: 'image',
          storageUrl: '',
          sizeBytes: 0,
        },
      ];

      const res = await hydrateForeignAssetBlobs(assetsWithEmptyUrl, mockBridge, 'http://localhost:3000');
      expect(res[0].storageUrl).toBe('');
      expect(mockBridge.requestAssetBlob).not.toHaveBeenCalled();
    });
  });
});
