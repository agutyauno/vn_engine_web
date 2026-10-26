// ================================================================
// VN ENGINE STUDIO - PREVIEW BRIDGE MODULE
// Giao tiếp hai chiều với Sandbox Live Preview Iframe & Pop-out Window
// ================================================================

import type {
  Instruction,
  LogEntry,
  EngineDiagnostic,
} from '@vn-engine/shared-types';
import type { StudioContext } from './editorTypes';

/**
 * Kiểm tra nguồn origin của Live Preview để đảm bảo an toàn Zero-Trust (SAD 3.6)
 */
export function isAllowedPreviewOrigin(
  origin: string,
  previewOrigin: string,
  localOrigin: string = typeof window !== 'undefined' ? window.location.origin : '',
): boolean {
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

/**
 * Xây dựng URL nhúng Live Preview với query params đầy đủ (mode=preview, projectId)
 */
export function buildPreviewUrl(
  baseUrl: string,
  projectId?: string | null,
  options?: { isPopout?: boolean; editorOrigin?: string },
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

export interface PreviewStateUpdateMessage {
  type: 'PREVIEW_STATE_UPDATE' | 'VM_STATE_UPDATE';
  variables: Record<string, string | number | boolean>;
  localVariables: Record<string, string | number | boolean>;
  currentScene: string;
  instructionPointer: number;
  activeExecutingPc?: number;
}

export class PreviewBridge {
  private context: StudioContext;
  private previewIframe: HTMLIFrameElement;
  private previewStatusBadge: HTMLElement | null;
  private popoutWindow: Window | null = null;
  private onStateUpdateCallbacks: Array<(state: PreviewStateUpdateMessage) => void> = [];
  private onLogEntryCallbacks: Array<(log: LogEntry) => void> = [];
  private onDiagnosticCallbacks: Array<(diag: EngineDiagnostic) => void> = [];
  private onDiagnosticsClearCallbacks: Array<() => void> = [];

  constructor(context: StudioContext) {
    this.context = context;
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    const project = this.context.getProject();
    if (this.previewIframe) {
      this.previewIframe.src = buildPreviewUrl(this.context.getPreviewBaseUrl(), project?.id);
    }
    this.previewStatusBadge = document.getElementById('preview-hot-reload-status');

    this.setupPreviewMessaging();
  }

  private setupPreviewMessaging(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const isAllowed = isAllowedPreviewOrigin(
        event.origin,
        this.context.getPreviewOrigin(),
        window.location.origin,
      );

      if (!isAllowed) {
        return;
      }

      if (event.data?.type === 'PLAYER_READY') {
        if (this.previewStatusBadge) {
          this.previewStatusBadge.textContent = 'HOT RELOAD: CONNECTED';
        }
        const latestProgram = this.context.getLatestProgram();
        if (latestProgram) {
          this.sendProgramToPreview(latestProgram);
        }
      }

      if (
        event.data?.type === 'PREVIEW_STATE_UPDATE' ||
        event.data?.type === 'VM_STATE_UPDATE'
      ) {
        const update = event.data as PreviewStateUpdateMessage;
        for (const cb of this.onStateUpdateCallbacks) {
          try {
            cb(update);
          } catch (err) {
            console.error('[PreviewBridge] Error in onStateUpdate callback:', err);
          }
        }
      }

      if (event.data?.type === 'ENGINE_DIAGNOSTIC' && event.data.diagnostic) {
        const diag = event.data.diagnostic as EngineDiagnostic;
        for (const cb of this.onDiagnosticCallbacks) {
          try {
            cb(diag);
          } catch (err) {
            console.error('[PreviewBridge] Error in onDiagnostic callback:', err);
          }
        }
      }

      if (event.data?.type === 'DIAGNOSTICS_CLEAR') {
        for (const cb of this.onDiagnosticsClearCallbacks) {
          try {
            cb();
          } catch (err) {
            console.error('[PreviewBridge] Error in onDiagnosticsClear callback:', err);
          }
        }
      }

      if (event.data?.type === 'PLAYER_LOG' && event.data.log) {
        const log = event.data.log as LogEntry;
        for (const cb of this.onLogEntryCallbacks) {
          try {
            cb(log);
          } catch (err) {
            console.error('[PreviewBridge] Error in onLogEntry callback:', err);
          }
        }
      }
    });
  }

  /**
   * Đăng ký callback lắng nghe trạng thái VM thời gian thực từ Live Preview (Live Watch)
   */
  public onStateUpdate(cb: (state: PreviewStateUpdateMessage) => void): () => void {
    this.onStateUpdateCallbacks.push(cb);
    return () => {
      this.onStateUpdateCallbacks = this.onStateUpdateCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Đăng ký callback lắng nghe chẩn đoán chuyên trách có cấu trúc từ Engine (ADR-025)
   */
  public onDiagnostic(cb: (diag: EngineDiagnostic) => void): () => void {
    this.onDiagnosticCallbacks.push(cb);
    return () => {
      this.onDiagnosticCallbacks = this.onDiagnosticCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Đăng ký callback lắng nghe sự kiện xóa sạch chẩn đoán phiên cũ khi reload
   */
  public onDiagnosticsClear(cb: () => void): () => void {
    this.onDiagnosticsClearCallbacks.push(cb);
    return () => {
      this.onDiagnosticsClearCallbacks = this.onDiagnosticsClearCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Đăng ký callback lắng nghe log runtime từ Live Preview (Legacy fallback)
   */
  public onLogEntry(cb: (log: LogEntry) => void): () => void {
    this.onLogEntryCallbacks.push(cb);
    return () => {
      this.onLogEntryCallbacks = this.onLogEntryCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Gửi lệnh can thiệp giá trị biến (Variable Injection) sang Live Preview
   */
  public setVariable(
    name: string,
    value: string | number | boolean,
    scope?: 'global' | 'local',
  ): void {
    const targetOrigin = this.context.getPreviewOrigin();
    const payload = {
      type: 'SET_VM_VARIABLE',
      name,
      value,
      scope,
    };

    if (this.previewIframe && this.previewIframe.contentWindow) {
      this.previewIframe.contentWindow.postMessage(payload, targetOrigin);
    }

    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.postMessage(payload, targetOrigin);
    }
  }

  public loadProject(projectId: string): void {
    if (this.previewIframe) {
      this.previewIframe.src = buildPreviewUrl(this.context.getPreviewBaseUrl(), projectId);
      if (this.previewStatusBadge) {
        this.previewStatusBadge.textContent = 'HOT RELOAD: CONNECTING...';
      }
    }
  }

  public sendProgramToPreview(
    program: Instruction[],
    options?: { targetScene?: string | null; targetLine?: number | null; fileId?: string | null },
  ): void {
    const targetOrigin = this.context.getPreviewOrigin();
    const project = this.context.getProject();

    const payload = {
      type: 'HOT_RELOAD_PROGRAM',
      projectId: project.id,
      program,
      characters: project.characters,
      assets: project.assets,
      targetScene: options?.targetScene,
      targetLine: options?.targetLine,
      fileId: options?.fileId,
    };

    if (this.previewIframe && this.previewIframe.contentWindow) {
      this.previewIframe.contentWindow.postMessage(payload, targetOrigin);
    }

    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.postMessage(payload, targetOrigin);
    }
  }

  public reloadPreview(): void {
    if (this.previewIframe) {
      this.previewIframe.src = this.previewIframe.src;
      this.context.showToast('Reloading Live Preview...');
    }
  }

  public popoutPreview(): void {
    const project = this.context.getProject();
    const targetUrl = buildPreviewUrl(this.context.getPreviewBaseUrl(), project?.id, {
      isPopout: true,
    });
    this.popoutWindow = window.open(
      targetUrl,
      'VN_Preview_Popout',
      'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
    );
    if (!this.popoutWindow) {
      this.context.showToast('Popout blocked by browser. Please allow popups.');
    } else {
      this.context.showToast('Preview opened in external window.');
    }
  }
}

