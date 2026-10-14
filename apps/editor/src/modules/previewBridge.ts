// ================================================================
// VN ENGINE STUDIO - PREVIEW BRIDGE MODULE
// Giao tiếp hai chiều với Sandbox Live Preview Iframe & Pop-out Window
// ================================================================

import type { Instruction } from '@vn-engine/shared-types';
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

export class PreviewBridge {
  private context: StudioContext;
  private previewIframe: HTMLIFrameElement;
  private previewStatusBadge: HTMLElement | null;
  private popoutWindow: Window | null = null;

  constructor(context: StudioContext) {
    this.context = context;
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    if (this.previewIframe) {
      this.previewIframe.src = `${this.context.getPreviewBaseUrl()}/?embedded=true`;
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
    });
  }

  public sendProgramToPreview(
    program: Instruction[],
    options?: { targetScene?: string | null; targetLine?: number | null; fileId?: string | null },
  ): void {
    const targetOrigin = this.context.getPreviewOrigin();
    const project = this.context.getProject();

    const payload = {
      type: 'HOT_RELOAD_PROGRAM',
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
    const targetUrl = `${this.context.getPreviewBaseUrl()}/`;
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
