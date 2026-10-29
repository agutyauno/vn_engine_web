import type { HotReloadPayload } from '../stores/livePreviewStore';
import type { ProjectRepository } from '../contracts/repository';

export interface PreviewBridgeOptions {
  targetWindow: () => Window | null;
  previewOrigin: string;
  localOrigin?: string;
  repository?: ProjectRepository;
}

export interface AssetBlobResponsePayload {
  type: 'ASSET_BLOB_RESPONSE';
  assetId: string;
  requestId?: string;
  mimeType?: string;
  buffer?: ArrayBuffer;
  error?: 'NOT_FOUND' | 'READ_ERROR';
}

export function isAllowedPreviewOrigin(
  origin: string,
  previewOrigin: string,
  localOrigin: string = typeof window !== 'undefined' ? window.location.origin : ''
): boolean {
  if (previewOrigin === '*') {
    return true;
  }
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    previewOrigin,
    localOrigin,
  ];

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const userContentRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;
  return userContentRegex.test(origin);
}

export function buildPreviewUrl(
  baseUrl: string,
  projectId?: string | null,
  options?: { isPopout?: boolean; editorOrigin?: string }
): string {
  const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
  const params = new URLSearchParams();
  if (options?.isPopout) {
    params.set('popout', 'true');
  } else {
    params.set('embedded', 'true');
  }
  params.set('mode', 'preview');
  if (projectId) {
    params.set('projectId', projectId);
  }
  const edOrigin =
    options?.editorOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (edOrigin) {
    params.set('editorOrigin', edOrigin);
  }
  return `${cleanBase}/?${params.toString()}`;
}

export class PreviewBridge {
  private options: PreviewBridgeOptions;
  private messageListener: ((event: MessageEvent) => void) | null = null;

  constructor(options: PreviewBridgeOptions) {
    this.options = options;

    if (typeof window !== 'undefined') {
      this.messageListener = (event: MessageEvent) => {
        this.handleMessage(event);
      };
      window.addEventListener('message', this.messageListener);
    }
  }

  public hotReload(payload: HotReloadPayload): void {
    const target = this.options.targetWindow();
    if (!target) return;

    target.postMessage(
      {
        type: 'HOT_RELOAD',
        payload,
      },
      this.options.previewOrigin
    );
  }

  public sendVariable(name: string, value: unknown): void {
    const target = this.options.targetWindow();
    if (!target) return;

    target.postMessage(
      {
        type: 'VARIABLE_OVERRIDE',
        payload: { name, value },
      },
      this.options.previewOrigin
    );
  }

  public async handleMessage(event: MessageEvent): Promise<void> {
    if (
      !isAllowedPreviewOrigin(
        event.origin,
        this.options.previewOrigin,
        this.options.localOrigin
      )
    ) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (
      data.type === 'ASSET_BLOB_REQUEST' &&
      typeof data.assetId === 'string' &&
      this.options.repository
    ) {
      try {
        const blob = await this.options.repository.getAssetBlob(data.assetId);
        const target = this.options.targetWindow();
        if (target && blob) {
          target.postMessage(
            {
              type: 'ASSET_BLOB_RESPONSE',
              assetId: data.assetId,
              blob,
            },
            this.options.previewOrigin
          );
        }
      } catch (err) {
        console.warn('PreviewBridge: Failed to fetch asset blob:', err);
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined' && this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }
}

