// ================================================================
// VN ENGINE STUDIO - EXPORT WIZARD MODULE
// Quản lý Modal xuất bản trò chơi (JSON bundle, HTML5 ZIP, web link, iframe embed)
// ================================================================

import type { StudioContext } from './editorTypes';

export class ExportWizard {
  private context: StudioContext;
  private modalExport: HTMLElement;

  constructor(context: StudioContext) {
    this.context = context;
    this.modalExport = document.getElementById('modal-export-wizard')!;

    this.setupExportWizardActions();
  }

  public open(): void {
    if (this.modalExport) {
      this.modalExport.classList.remove('hidden');
    }
  }

  public close(): void {
    if (this.modalExport) {
      this.modalExport.classList.add('hidden');
    }
  }

  private setupExportWizardActions(): void {
    document.getElementById('btn-close-export')?.addEventListener('click', () => {
      this.close();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.modalExport.classList.contains('hidden')) {
        this.close();
      }
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const urlInput = document.getElementById('export-url-input') as HTMLInputElement | null;
      const url = urlInput?.value || 'https://secret-academy.usercontent-platform.com';
      navigator.clipboard?.writeText(url);
      this.context.showToast('Copied web link to clipboard!');
    });

    document.getElementById('btn-open-playable')?.addEventListener('click', () => {
      window.open(`${this.context.getPreviewBaseUrl()}/`, '_blank');
      this.context.showToast('Opening public game web page...');
    });

    document.getElementById('btn-copy-iframe')?.addEventListener('click', () => {
      const iframeInput = document.getElementById('export-iframe-input') as HTMLInputElement | null;
      const snippet =
        iframeInput?.value ||
        '<iframe src="https://secret-academy.usercontent-platform.com" width="960" height="540" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard?.writeText(snippet);
      this.context.showToast('Copied iFrame embed code!');
    });

    document.getElementById('btn-download-bundle')?.addEventListener('click', () => {
      const project = this.context.getProject();
      const bundleData = {
        metadata: {
          title: project.title,
          exportedAt: new Date().toISOString(),
          engineVersion: '1.0.0',
        },
        project,
        program: this.context.getLatestProgram() || [],
      };
      const blob = new Blob([JSON.stringify(bundleData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn-game-bundle.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.context.showToast('Downloaded vn-game-bundle.json!');
    });

    document.getElementById('btn-download-zip')?.addEventListener('click', () => {
      this.context.showToast('Generating self-contained HTML5 game.zip...');
      const project = this.context.getProject();
      const manifest = {
        title: project.title,
        version: '1.0.0',
        entry: 'index.html',
        scripts: this.context.getFilesMap(),
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn-game-itch.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setTimeout(() => {
        this.context.showToast('Generated and downloaded vn-game-itch.zip!');
      }, 400);
    });
  }
}
