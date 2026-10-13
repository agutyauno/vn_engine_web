// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (MAIN ENTRY)
// ==========================================

import { compileString } from '@vn-engine/dsl-compiler';
import { VNPlayer } from './player';
import scenarioSource from './scenario.vns?raw';
import type { Instruction } from '@vn-engine/shared-types';

function isAllowedEditorOrigin(origin: string): boolean {
  const envOrigin = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_EDITOR_ORIGIN;
  const allowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001', window.location.origin];
  if (envOrigin && typeof envOrigin === 'string' && envOrigin.trim().length > 0) {
    allowedOrigins.push(envOrigin.trim().replace(/\/+$/, ''));
  }
  if (allowedOrigins.includes(origin)) return true;
  const userContentRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;
  return userContentRegex.test(origin);
}

function isValidProgram(program: unknown): program is Instruction[] {
  if (!Array.isArray(program)) return false;
  return program.every(
    item =>
      item &&
      typeof item === 'object' &&
      typeof (item as { type?: unknown }).type === 'string',
  );
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[RuntimePlayer] Loading and compiling sample VNS scenario...');

  const compileResult = compileString(scenarioSource, 'scenario.vns');
  if (!compileResult.success || !compileResult.program) {
    console.error('[RuntimePlayer] Script compilation error:', compileResult.errors);
    alert('Script compilation error! Please check Console.');
    return;
  }

  console.log(
    `[RuntimePlayer] Successfully compiled ${compileResult.program.length} instructions. Initializing VNPlayer...`,
  );

  const player = new VNPlayer(compileResult.program);
  await player.start();

  // Expose player to window for debugging if needed
  (window as unknown as { vnPlayer: VNPlayer }).vnPlayer = player;

  // Kiểm tra nếu đang nhúng trong iframe hoặc mở Pop-out (Web Studio Live Preview)
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true' || window.name === 'VN_Preview_Popout';
  const isEmbedded =
    (window.parent && window.parent !== window) || isPopout || urlParams.get('embedded') === 'true';
  if (isEmbedded) {
    document.documentElement.classList.add('is-embedded');
    document.body.classList.add('is-embedded');
  }

  // Khởi tạo các nút trên Footer Trang Web Công Khai (Public Player Shell)
  const btnFullscreen = document.getElementById('btn-public-fullscreen');
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('[RuntimePlayer] Cannot enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (btnFullscreen) {
      btnFullscreen.textContent = document.fullscreenElement
        ? '[✕ Exit Fullscreen]'
        : '[⛶ Fullscreen]';
    }
  });

  document.getElementById('btn-public-report')?.addEventListener('click', () => {
    player.showToast('Thank you! Feedback recorded for author.');
  });

  // Báo cho parent (Editor / Live Preview Container) biết Player đã sẵn sàng
  let targetOrigin =
    window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (isAllowedEditorOrigin(refUrl.origin)) {
        targetOrigin = refUrl.origin;
      }
    } catch {
      // ignore
    }
  }
  if (isEmbedded) {
    window.parent.postMessage({ type: 'PLAYER_READY' }, targetOrigin);
  }
  if (window.opener) {
    window.opener.postMessage({ type: 'PLAYER_READY' }, targetOrigin);
  }
});

// Lắng nghe sự kiện Hot Reload từ Editor có kiểm tra origin an toàn (SAD 3.6)
window.addEventListener('message', async (event: MessageEvent) => {
  if (!isAllowedEditorOrigin(event.origin)) {
    return;
  }

  if (event.data?.type === 'HOT_RELOAD_PROGRAM') {
    if (!isValidProgram(event.data.program)) {
      console.warn('[RuntimePlayer] Invalid program structure received in HOT_RELOAD_PROGRAM');
      return;
    }

    console.log(
      `[RuntimePlayer] Received HOT_RELOAD_PROGRAM from ${event.origin} with ${event.data.program.length} instructions`,
    );
    const player = (window as unknown as { vnPlayer?: VNPlayer }).vnPlayer;
    if (player) {
      if (event.data.characters || event.data.assets) {
        player.updateProjectData({
          characters: event.data.characters,
          assets: event.data.assets,
        });
      }
      await player.reloadProgram(event.data.program, {
        targetScene: event.data.targetScene,
        targetLine: event.data.targetLine,
        fileId: event.data.fileId,
      });
    }
  }
});
