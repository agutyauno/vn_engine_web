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
  onHotReload?: (
    program: Instruction[],
    options?: HotReloadOptions
  ) => void;
  onSetVariable?: (name: string, value: unknown) => void;
}

export class PreviewBridgeAdapter {
  private options: PreviewBridgeOptions;
  private editorOrigin: string;
  private connected = false;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVariables: Record<string, unknown> | null = null;
  private messageListener: ((event: MessageEvent) => void) | null = null;

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

    if (this.messageListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }
}
