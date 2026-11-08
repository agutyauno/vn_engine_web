// ============================================================================
// PREVIEW BRIDGE ADAPTER (SAD §3.3, §3.6)
// Cầu nối giao tiếp postMessage giữa Web Studio Editor và Runtime Player Sandbox
// Throttling 60ms cho State Updates, Origin Sanitization & Diagnostic Forwarding
// ============================================================================

import type { Instruction, EngineDiagnostic, Character, AssetRef } from '@vn-engine/shared-types';

export function isAllowedEditorOrigin(
  origin: string,
  previewOrigin?: string,
  localOrigin?: string,
): boolean {
  if (previewOrigin === '*') {
    return true;
  }
  if (previewOrigin && origin === previewOrigin) {
    return true;
  }
  if (localOrigin && origin === localOrigin) {
    return true;
  }
  if (
    origin === 'http://localhost:3000' ||
    origin === 'http://127.0.0.1:3000' ||
    origin === 'http://localhost:3001' ||
    origin === 'http://127.0.0.1:3001'
  ) {
    return true;
  }
  const userContentRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;
  return userContentRegex.test(origin);
}

export interface HotReloadOptions {
  scene?: string;
  line?: number;
  preserveState?: boolean;
  projectId?: string;
  characters?: Character[];
  assets?: AssetRef[];
}

export interface PreviewBridgeOptions {
  targetWindow?: () => Window | null;
  editorOrigin?: string;
  localOrigin?: string;
  onHotReload?: (program: Instruction[], options?: HotReloadOptions) => void;
  onSetVariable?: (name: string, value: unknown) => void;
}

export class PreviewBridgeAdapter {
  private options: PreviewBridgeOptions;
  private editorOrigin: string;
  private connected = false;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVariables: Record<string, unknown> | null = null;
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private pendingBlobRequests = new Map<
    string,
    {
      resolve: (blob: Blob | null) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(options?: PreviewBridgeOptions) {
    this.options = options ?? {};
    this.editorOrigin = this.options.editorOrigin ?? '*';
  }

  public init(): void {
    this.messageListener = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageListener);
    }

    this.postToEditor({
      type: 'PLAYER_READY',
      capabilities: {
        liveReload: true,
        variableWatch: true,
      },
    });
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public handleMessage(event: MessageEvent): void {
    if (!isAllowedEditorOrigin(event.origin, this.editorOrigin, this.options.localOrigin)) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    switch (data.type) {
      case 'QUERY_READY': {
        this.postToEditor({
          type: 'PLAYER_READY',
          capabilities: {
            liveReload: true,
            variableWatch: true,
          },
        });
        break;
      }
      case 'PLAYER_READY_ACK': {
        this.connected = true;
        break;
      }
      case 'HOT_RELOAD_PROGRAM': {
        const payload = data.payload ?? data;
        const program = (payload?.program ?? data.program) as Instruction[] | undefined;
        const scene = (payload?.scene ?? data.scene) as string | undefined;
        const line = (payload?.line ?? data.line) as number | undefined;
        const preserveState = (payload?.preserveState ?? data.preserveState) as boolean | undefined;
        const projectId = (payload?.projectId ?? data.projectId) as string | undefined;
        const characters = (payload?.characters ?? data.characters) as Character[] | undefined;
        const assets = (payload?.assets ?? data.assets) as AssetRef[] | undefined;

        if (program) {
          const opts: HotReloadOptions = {};
          if (scene !== undefined) opts.scene = scene;
          if (line !== undefined) opts.line = line;
          if (preserveState !== undefined) opts.preserveState = preserveState;
          if (projectId !== undefined) opts.projectId = projectId;
          if (characters !== undefined) opts.characters = characters;
          if (assets !== undefined) opts.assets = assets;
          this.options.onHotReload?.(program, Object.keys(opts).length > 0 ? opts : undefined);
        }
        break;
      }
      case 'SET_VM_VARIABLE': {
        if (typeof data.name === 'string') {
          this.options.onSetVariable?.(data.name, data.value);
        }
        break;
      }
      case 'ASSET_BLOB_RESPONSE': {
        const requestId = data.requestId;
        if (typeof requestId === 'string' && this.pendingBlobRequests.has(requestId)) {
          const entry = this.pendingBlobRequests.get(requestId)!;
          clearTimeout(entry.timer);
          this.pendingBlobRequests.delete(requestId);

          if (data.error || !data.buffer) {
            entry.resolve(null);
          } else {
            const blob = new Blob([data.buffer], {
              type: data.mimeType || 'application/octet-stream',
            });
            entry.resolve(blob);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  public sendStateUpdate(variables: Record<string, unknown>): void {
    this.pendingVariables = {
      ...this.pendingVariables,
      ...variables,
    };

    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        const vars = this.pendingVariables;
        this.pendingVariables = null;
        this.throttleTimer = null;
        if (vars) {
          this.postToEditor({
            type: 'PREVIEW_STATE_UPDATE',
            variables: vars,
          });
        }
      }, 60);
    }
  }

  public sendDiagnostic(diagnostic: EngineDiagnostic): void {
    this.postToEditor({
      type: 'ENGINE_DIAGNOSTIC',
      diagnostic,
    });
  }

  public requestAssetBlob(assetId: string, timeoutMs = 5000): Promise<Blob | null> {
    return new Promise((resolve) => {
      const requestId = 'blob_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const timer = setTimeout(() => {
        this.pendingBlobRequests.delete(requestId);
        resolve(null);
      }, timeoutMs);

      this.pendingBlobRequests.set(requestId, { resolve, timer });

      this.postToEditor({
        type: 'ASSET_BLOB_REQUEST',
        assetId,
        requestId,
      });
    });
  }

  private postToEditor(message: unknown): void {
    const targetWin = this.options.targetWindow
      ? this.options.targetWindow()
      : typeof window !== 'undefined'
        ? window.parent !== window
          ? window.parent
          : window.opener
        : null;

    targetWin?.postMessage(message, this.editorOrigin);
  }

  public dispose(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingVariables = null;

    for (const entry of this.pendingBlobRequests.values()) {
      clearTimeout(entry.timer);
    }
    this.pendingBlobRequests.clear();

    if (this.messageListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }
}

export async function hydrateForeignAssetBlobs(
  assets: AssetRef[],
  bridge: { requestAssetBlob(assetId: string): Promise<Blob | null> },
  currentOrigin: string = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<AssetRef[]> {
  if (!assets || assets.length === 0) return [];
  const localBlobPrefix = currentOrigin
    ? currentOrigin.startsWith('blob:')
      ? currentOrigin
      : 'blob:' + currentOrigin
    : '';

  return Promise.all(
    assets.map(async (asset) => {
      const url = asset.storageUrl;
      const isForeignBlob =
        typeof url === 'string' &&
        url.startsWith('blob:') &&
        (!localBlobPrefix || !url.startsWith(localBlobPrefix));

      if (isForeignBlob) {
        try {
          const blob = await bridge.requestAssetBlob(asset.id);
          if (blob) {
            const localUrl = URL.createObjectURL(blob);
            return { ...asset, storageUrl: localUrl };
          }
        } catch (err) {
          console.warn(`[hydrateForeignAssetBlobs] Failed to hydrate asset ${asset.id}:`, err);
        }
      }
      return asset;
    }),
  );
}
