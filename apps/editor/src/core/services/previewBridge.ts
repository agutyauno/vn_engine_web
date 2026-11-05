import type { EngineDiagnostic } from '@vn-engine/shared-types';
import type { HotReloadPayload } from '../stores/livePreviewStore';
import { usePreviewStore } from '../stores/livePreviewStore';
import { useDiagnosticsStore } from '../stores/diagnosticsStore';
import type { ProjectRepository } from '../contracts/repository';

export interface PreviewBridgeOptions {
  targetWindow: () => Window | null;
  previewOrigin: string;
  localOrigin?: string;
  repository?: ProjectRepository;
  watchdogTimeoutMs?: number;
  getProgramPayload?: () => HotReloadPayload | null;
}

export interface AssetBlobResponsePayload {
  type: 'ASSET_BLOB_RESPONSE';
  assetId: string;
  requestId?: string;
  mimeType?: string;
  buffer?: ArrayBuffer;
  error?: 'NOT_FOUND' | 'READ_ERROR';
}

export type InboundPreviewMessage =
  | { type: 'PLAYER_READY' }
  | {
      type: 'PREVIEW_STATE_UPDATE';
      variables?: Record<string, unknown>;
      vars?: Record<string, unknown>;
    }
  | { type: 'ENGINE_DIAGNOSTIC'; diagnostic: EngineDiagnostic }
  | { type: 'GET_ASSET_BLOB'; assetId: string; requestId?: string }
  | { type: 'ASSET_BLOB_REQUEST'; assetId: string; requestId?: string };

export type OutboundPreviewMessage =
  | { type: 'QUERY_READY' }
  | { type: 'PLAYER_READY_ACK' }
  | { type: 'HOT_RELOAD_PROGRAM'; payload: HotReloadPayload }
  | { type: 'SET_VM_VARIABLE'; name: string; value: unknown }
  | AssetBlobResponsePayload;

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
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PreviewBridgeOptions) {
    this.options = options;

    if (typeof window !== 'undefined') {
      this.messageListener = (event: MessageEvent) => {
        void this.handleMessage(event);
      };
      window.addEventListener('message', this.messageListener);
    }
  }

  public probeReady(): void {
    const target = this.options.targetWindow();
    if (target) {
      target.postMessage({ type: 'QUERY_READY' }, this.options.previewOrigin);
    }

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    const timeoutMs = this.options.watchdogTimeoutMs ?? 3000;
    this.watchdogTimer = setTimeout(() => {
      if (usePreviewStore.getState().connectionStatus !== 'connected') {
        usePreviewStore.getState().setConnectionStatus('disconnected');
      }
      this.watchdogTimer = null;
    }, timeoutMs);
  }

  public hotReload(payload: HotReloadPayload): void {
    const isConnected = usePreviewStore.getState().connectionStatus === 'connected';
    const target = this.options.targetWindow();

    if (isConnected && target) {
      target.postMessage(
        {
          type: 'HOT_RELOAD_PROGRAM',
          payload,
        },
        this.options.previewOrigin
      );
    } else {
      usePreviewStore.getState().setPendingProgram(payload);
    }
  }

  public sendVariable(name: string, value: unknown): void {
    const isConnected = usePreviewStore.getState().connectionStatus === 'connected';
    const target = this.options.targetWindow();

    if (isConnected && target) {
      target.postMessage(
        {
          type: 'SET_VM_VARIABLE',
          name,
          value,
        },
        this.options.previewOrigin
      );
    } else {
      usePreviewStore.getState().setVariableOverride(name, value);
    }
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

    switch (data.type) {
      case 'PLAYER_READY': {
        if (this.watchdogTimer) {
          clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }

        const sender = (event.source as Window) || null;
        const target = sender || this.options.targetWindow();
        if (target) {
          target.postMessage({ type: 'PLAYER_READY_ACK' }, this.options.previewOrigin);
        }

        const previewStore = usePreviewStore.getState();
        previewStore.setConnectionStatus('connected');

        // 1. Flush pendingProgram or fallback to getProgramPayload
        const programToSend = previewStore.pendingProgram || this.options.getProgramPayload?.() || null;
        if (programToSend && target) {
          target.postMessage(
            {
              type: 'HOT_RELOAD_PROGRAM',
              payload: programToSend,
            },
            this.options.previewOrigin
          );
        }
        previewStore.clearPendingProgram();

        // 2. Flush pending variable overrides if any
        const overrides = previewStore.pendingVariableOverrides;
        const entries = Object.entries(overrides);
        if (entries.length > 0) {
          for (const [name, value] of entries) {
            if (target) {
              target.postMessage(
                {
                  type: 'SET_VM_VARIABLE',
                  name,
                  value,
                },
                this.options.previewOrigin
              );
            }
          }
          previewStore.clearVariableOverrides();
        }
        break;
      }

      case 'GET_ASSET_BLOB':
      case 'ASSET_BLOB_REQUEST': {
        const assetId = data.assetId;
        const requestId = data.requestId;

        if (typeof assetId !== 'string') {
          return;
        }

        const target = this.options.targetWindow();
        if (!target) return;

        if (!this.options.repository) {
          const errorResponse: AssetBlobResponsePayload = {
            type: 'ASSET_BLOB_RESPONSE',
            assetId,
            error: 'NOT_FOUND',
          };
          if (requestId !== undefined) {
            errorResponse.requestId = requestId;
          }
          target.postMessage(errorResponse, this.options.previewOrigin);
          return;
        }

        try {
          const blob = await this.options.repository.getAssetBlob(assetId);
          if (!blob) {
            const notFoundResponse: AssetBlobResponsePayload = {
              type: 'ASSET_BLOB_RESPONSE',
              assetId,
              error: 'NOT_FOUND',
            };
            if (requestId !== undefined) {
              notFoundResponse.requestId = requestId;
            }
            target.postMessage(notFoundResponse, this.options.previewOrigin);
            return;
          }

          const buffer = await blob.arrayBuffer();
          const successResponse: AssetBlobResponsePayload = {
            type: 'ASSET_BLOB_RESPONSE',
            assetId,
            mimeType: blob.type,
            buffer,
          };
          if (requestId !== undefined) {
            successResponse.requestId = requestId;
          }
          target.postMessage(successResponse, this.options.previewOrigin, [buffer]);
        } catch {
          const errorResponse: AssetBlobResponsePayload = {
            type: 'ASSET_BLOB_RESPONSE',
            assetId,
            error: 'READ_ERROR',
          };
          if (requestId !== undefined) {
            errorResponse.requestId = requestId;
          }
          target.postMessage(errorResponse, this.options.previewOrigin);
        }
        break;
      }

      case 'PREVIEW_STATE_UPDATE': {
        const vars = (data.variables ?? data.vars) as Record<string, unknown> | undefined;
        if (vars && typeof vars === 'object') {
          usePreviewStore.getState().syncVariables(vars);
        }
        break;
      }

      case 'ENGINE_DIAGNOSTIC': {
        if (data.diagnostic && typeof data.diagnostic === 'object') {
          useDiagnosticsStore.getState().addRuntimeDiagnostic(data.diagnostic as EngineDiagnostic);
        }
        break;
      }
    }
  }

  public dispose(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (typeof window !== 'undefined' && this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }
}
