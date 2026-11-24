/**
 * Phát hiện chế độ khởi chạy của runtime player.
 *
 * Gói web xuất bản (Export → Web) có thẻ `<meta name="taleforge-mode" content="published">`
 * do editor chèn vào `index.html`. Khi có thẻ này, player luôn chạy standalone (nạp
 * `project.json`) kể cả khi nằm trong iframe, ví dụ itch.io, và không mở kênh preview với editor.
 */

export const PUBLISHED_MODE_META_NAME = 'taleforge-mode';
export const PUBLISHED_MODE_META_CONTENT = 'published';

export interface LaunchContextInput {
  /** `window.location.search` */
  search: string;
  /** `window.name` */
  windowName: string;
  /** Trang đang nằm trong iframe (`window.self !== window.top`). */
  isFramed: boolean;
  /** Nội dung thẻ meta published, hoặc `null` khi không có. */
  publishedMeta: string | null;
}

export interface LaunchContext {
  isPublished: boolean;
  isPopout: boolean;
  isModePreview: boolean;
  /** Đang được editor nhúng (iframe, popout, `embedded=true`, `mode=preview`). */
  isEmbedded: boolean;
  /** Có khởi tạo `PreviewBridgeAdapter` hay không. */
  enablePreviewBridge: boolean;
}

export function detectLaunchContext(input: LaunchContextInput): LaunchContext {
  if (input.publishedMeta === PUBLISHED_MODE_META_CONTENT) {
    return {
      isPublished: true,
      isPopout: false,
      isModePreview: false,
      isEmbedded: false,
      enablePreviewBridge: false,
    };
  }

  const params = new URLSearchParams(input.search);
  const isPopout = params.get('popout') === 'true' || input.windowName === 'VN_Preview_Popout';
  const isModePreview = params.get('mode') === 'preview';
  const isEmbedded =
    input.isFramed || isPopout || params.get('embedded') === 'true' || isModePreview;

  return {
    isPublished: false,
    isPopout,
    isModePreview,
    isEmbedded,
    enablePreviewBridge: true,
  };
}

export function readLaunchContextInput(doc: Document, win: Window): LaunchContextInput {
  const meta = doc.querySelector(`meta[name="${PUBLISHED_MODE_META_NAME}"]`);
  let isFramed: boolean;
  try {
    isFramed = win.self !== win.top;
  } catch {
    // Truy cập window.top bị chặn do khác origin -> chắc chắn đang ở trong iframe
    isFramed = true;
  }
  return {
    search: win.location.search,
    windowName: win.name,
    isFramed,
    publishedMeta: meta ? meta.getAttribute('content') : null,
  };
}
