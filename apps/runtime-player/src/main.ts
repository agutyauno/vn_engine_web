// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (MAIN ENTRY)
// ==========================================

import { compileString } from '@vn-engine/dsl-compiler';
import { VNPlayer } from './player';
import scenarioSource from './scenario.vns?raw';

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[RuntimePlayer] Đang nạp và biên dịch kịch bản VNS mẫu (Bí ẩn phòng Hội học sinh)...');

  const compileResult = compileString(scenarioSource, 'scenario.vns');
  if (!compileResult.success || !compileResult.program) {
    console.error('[RuntimePlayer] Lỗi biên dịch kịch bản:', compileResult.errors);
    alert('Lỗi biên dịch kịch bản! Vui lòng kiểm tra Console.');
    return;
  }

  console.log(
    `[RuntimePlayer] Biên dịch thành công ${compileResult.program.length} instructions. Khởi tạo VNPlayer...`,
  );

  const player = new VNPlayer(compileResult.program);
  await player.start();

  // Expose player to window for debugging if needed
  (window as unknown as { vnPlayer: VNPlayer }).vnPlayer = player;

  // Kiểm tra nếu đang nhúng trong iframe (Web Studio Live Preview)
  const isEmbedded = window.parent && window.parent !== window;
  if (isEmbedded) {
    document.body.classList.add('is-embedded');
  }

  // Khởi tạo các nút trên Footer Trang Web Công Khai (Public Player Shell)
  const btnFullscreen = document.getElementById('btn-public-fullscreen');
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('[RuntimePlayer] Không thể bật toàn màn hình:', err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (btnFullscreen) {
      btnFullscreen.textContent = document.fullscreenElement
        ? '[✕ Thoát toàn màn hình]'
        : '[⛶ Toàn màn hình]';
    }
  });

  document.getElementById('btn-public-report')?.addEventListener('click', () => {
    player.showToast('Cảm ơn bạn! Đã ghi nhận phản hồi gửi về tác giả.');
  });

  // Báo cho parent (Editor / Live Preview Container) biết Player đã sẵn sàng
  const targetOrigin = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '*';
  if (isEmbedded) {
    window.parent.postMessage({ type: 'PLAYER_READY' }, targetOrigin);
  }
  if (window.opener) {
    window.opener.postMessage({ type: 'PLAYER_READY' }, targetOrigin);
  }
});

// Lắng nghe sự kiện Hot Reload từ Editor có kiểm tra origin an toàn (SAD 3.6)
window.addEventListener('message', async (event: MessageEvent) => {
  const allowedOrigins = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    window.location.origin,
  ];

  if (!allowedOrigins.includes(event.origin) && !event.origin.endsWith('.usercontent-platform.com')) {
    return;
  }

  if (event.data?.type === 'HOT_RELOAD_PROGRAM' && Array.isArray(event.data.program)) {
    console.log(`[RuntimePlayer] Nhận lệnh HOT_RELOAD_PROGRAM từ ${event.origin} với ${event.data.program.length} instructions`);
    const player = (window as unknown as { vnPlayer?: VNPlayer }).vnPlayer;
    if (player) {
      if (event.data.characters || event.data.assets) {
        player.updateProjectData({
          characters: event.data.characters,
          assets: event.data.assets,
        });
      }
      await player.reloadProgram(event.data.program);
    }
  }
});
