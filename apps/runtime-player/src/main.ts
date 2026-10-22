// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (MAIN ENTRY)
// ==========================================

import { compileString } from '@vn-engine/dsl-compiler';
import { isValidProgram, validateProgram } from '@vn-engine/core-vm';
import { VNPlayer } from './player';
import { GameStorage } from './storage';
import scenarioSource from './scenario.vns?raw';

let activeEditorOrigin = 'http://localhost:3001';

function isAllowedEditorOrigin(origin: string): boolean {
  const envOrigin = import.meta.env.VITE_EDITOR_ORIGIN;
  const allowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001', window.location.origin];
  if (envOrigin && typeof envOrigin === 'string' && envOrigin.trim().length > 0) {
    allowedOrigins.push(envOrigin.trim().replace(/\/+$/, ''));
  }
  if (allowedOrigins.includes(origin)) return true;
  const userContentRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;
  return userContentRegex.test(origin);
}

function installConsoleForwarder(): void {
  const originalLog = console.log.bind(console);
  const originalInfo = console.info ? console.info.bind(console) : originalLog;
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  let isForwarding = false;

  const forward = (level: 'info' | 'warn' | 'error', ...args: unknown[]) => {
    if (level === 'error') originalError(...args);
    else if (level === 'warn') originalWarn(...args);
    else originalInfo(...args);

    if (isForwarding) return;
    isForwarding = true;
    try {
      const message = args
        .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');

      let channel: 'player' | 'assets' = 'player';
      let source = 'Runtime';

      if (message.includes('[Renderer]')) {
        channel = 'player';
        source = 'Renderer';
      } else if (message.includes('[AudioManager]')) {
        channel = 'player';
        source = 'Audio';
      } else if (message.includes('[VN Engine') || message.includes('Virtual Machine')) {
        channel = 'player';
        source = 'Core VM';
      } else if (
        message.includes('[AssetResolver]') ||
        message.toLowerCase().includes('missing asset') ||
        message.toLowerCase().includes('failed to load') ||
        message.toLowerCase().includes('texture') ||
        message.toLowerCase().includes('audio asset')
      ) {
        channel = 'assets';
        source = 'Assets';
      }

      const logPayload = {
        type: 'PLAYER_LOG',
        log: {
          id: `plog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          channel,
          level,
          message,
          source,
        },
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(logPayload, activeEditorOrigin);
      }
      if (window.opener) {
        window.opener.postMessage(logPayload, activeEditorOrigin);
      }
    } catch {
      // ignore
    } finally {
      isForwarding = false;
    }
  };

  console.log = (...args: unknown[]) => forward('info', ...args);
  console.info = (...args: unknown[]) => forward('info', ...args);
  console.warn = (...args: unknown[]) => forward('warn', ...args);
  console.error = (...args: unknown[]) => forward('error', ...args);
}

window.addEventListener('DOMContentLoaded', async () => {
  installConsoleForwarder();
  // Kiểm tra nếu đang nhúng trong iframe hoặc mở Pop-out (Web Studio Live Preview)
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true' || window.name === 'VN_Preview_Popout';
  const isModePreview = urlParams.get('mode') === 'preview';
  const isEmbedded =
    (window.parent && window.parent !== window) || isPopout || urlParams.get('embedded') === 'true' || isModePreview;

  const pid = urlParams.get('projectId') || urlParams.get('project');
  if (pid) {
    GameStorage.setProjectId(pid);
  }

  if (isModePreview || isEmbedded) {
    GameStorage.setPreviewMode(true);
  } else {
    GameStorage.setPreviewMode(false);
  }

  let player: VNPlayer;

  // Nếu là Live Preview: Khởi động ở chế độ Standby tinh gọn, không chạy kịch bản mẫu
  if (isModePreview || isEmbedded) {
    console.log('[RuntimePlayer] Initializing in Live Preview Standby mode...');
    player = new VNPlayer([], { isStandby: true });
    await player.start();
  } else {
    console.log('[RuntimePlayer] Loading and compiling sample VNS scenario...');
    const compileResult = compileString(scenarioSource, 'scenario.vns');
    if (!compileResult.success || !compileResult.program || !isValidProgram(compileResult.program)) {
      console.error('[RuntimePlayer] Script compilation or validation error:', compileResult.errors);
      alert('Script compilation error! Please check Console.');
      return;
    }

    console.log(
      `[RuntimePlayer] Successfully compiled ${compileResult.program.length} instructions. Initializing VNPlayer...`,
    );

    player = new VNPlayer(compileResult.program);
    await player.start();
  }

  // Expose player to window for debugging if needed
  (window as unknown as { vnPlayer: VNPlayer }).vnPlayer = player;
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
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? `http://${window.location.hostname}:3001`
      : window.location.origin;

  const editorOriginParam = urlParams.get('editorOrigin');
  if (editorOriginParam && isAllowedEditorOrigin(editorOriginParam)) {
    targetOrigin = editorOriginParam;
  } else if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (isAllowedEditorOrigin(refUrl.origin)) {
        targetOrigin = refUrl.origin;
      }
    } catch {
      // ignore
    }
  }

  activeEditorOrigin = targetOrigin;
  player.setEditorOrigin(targetOrigin);

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
  activeEditorOrigin = event.origin;

  const player = (window as unknown as { vnPlayer?: VNPlayer }).vnPlayer;
  if (player) {
    player.setEditorOrigin(event.origin);
  }

  if (event.data?.type === 'HOT_RELOAD_PROGRAM') {
    if (!isValidProgram(event.data.program)) {
      const validation = validateProgram(event.data.program);
      console.warn(
        '[RuntimePlayer] Invalid program structure received in HOT_RELOAD_PROGRAM:',
        validation.errors,
      );
      return;
    }

    console.log(
      `[RuntimePlayer] Received HOT_RELOAD_PROGRAM from ${event.origin} with ${event.data.program.length} instructions`,
    );
    const player = (window as unknown as { vnPlayer?: VNPlayer }).vnPlayer;
    if (player) {
      if (event.data.projectId) {
        GameStorage.setProjectId(event.data.projectId);
      }
      if (event.data.characters || event.data.assets || event.data.projectId) {
        player.updateProjectData({
          id: event.data.projectId,
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

  if (event.data?.type === 'SET_VM_VARIABLE') {
    const player = (window as unknown as { vnPlayer?: VNPlayer }).vnPlayer;
    if (player && typeof event.data.name === 'string') {
      console.log(
        `[RuntimePlayer] Received SET_VM_VARIABLE for '${event.data.name}' from ${event.origin}`,
      );
      player.setVariable(event.data.name, event.data.value, event.data.scope);
    }
  }
});
