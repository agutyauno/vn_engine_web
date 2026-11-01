import type { Project } from '@vn-engine/shared-types';
import type { VnsProjectContext, SceneItem } from '../../vnsLanguageFeatures';

export type { SceneItem };

/**
 * Trích xuất các khai báo scene và subscene từ một tệp VNS,
 * loại trừ chú thích một dòng và nhiều dòng, đồng thời chuẩn hóa tên subscene theo ADR-015 (parent.sub).
 */
export function extractScenesFromFile(fileName: string, content: string): SceneItem[] {
  const lines = content.split('\n');
  const scenes: SceneItem[] = [];
  let currentParentScene: string | null = null;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;

    // Kiểm tra trạng thái khối chú thích nhiều dòng /* ... */
    if (inBlockComment) {
      const closeIdx = line.indexOf('*/');
      if (closeIdx !== -1) {
        inBlockComment = false;
        line = line.substring(closeIdx + 2);
      } else {
        continue;
      }
    }

    // Xử lý các khối /* ... */ bắt đầu trên dòng hiện tại
    while (line.includes('/*')) {
      const openIdx = line.indexOf('/*');
      const closeIdx = line.indexOf('*/', openIdx + 2);
      if (closeIdx !== -1) {
        line = line.substring(0, openIdx) + ' ' + line.substring(closeIdx + 2);
      } else {
        inBlockComment = true;
        line = line.substring(0, openIdx);
        break;
      }
    }

    // Cắt bỏ chú thích một dòng // hoặc #
    const singleCommentIdx = line.search(/\/\/|#/);
    if (singleCommentIdx !== -1) {
      line = line.substring(0, singleCommentIdx);
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Subscene: scene .<subname>
    const subMatch = trimmed.match(/^scene\s+\.([a-zA-Z0-9_]+)\b/);
    if (subMatch && subMatch[1] && currentParentScene) {
      scenes.push({
        name: `${currentParentScene}.${subMatch[1]}`,
        file: fileName,
        line: i + 1,
      });
      continue;
    }

    // Top-level scene: scene <name>
    const topMatch = trimmed.match(/^scene\s+([a-zA-Z0-9_]+)\b/);
    if (topMatch && topMatch[1]) {
      currentParentScene = topMatch[1];
      scenes.push({
        name: currentParentScene,
        file: fileName,
        line: i + 1,
      });
      continue;
    }
  }

  return scenes;
}

/**
 * Creates a dynamic Monaco VNS Language Features Context Provider bound to the live Zustand store.
 * Eliminates stale closures and ensures completion items comply strictly with DSL 1.1.0 (asset.id).
 */
export function createVnsProjectContext(
  getProject: () => Project | null,
  fallbackProject?: Project
): VnsProjectContext {
  const getCurProject = () => getProject() || fallbackProject || null;

  // Cache bóc tách phân cảnh theo tệp để tối ưu hiệu năng
  const sceneCache = new Map<string, { content: string; scenes: SceneItem[] }>();
  let cachedAggregatedScenes: SceneItem[] | null = null;
  let lastFilesList: Array<{ name: string; content: string }> | null = null;

  return {
    getFiles: () => {
      const proj = getCurProject();
      const map: Record<string, string> = {};
      for (const f of proj?.files || []) {
        map[f.name] = f.content;
      }
      return map;
    },

    getScenes: () => {
      const proj = getCurProject();
      const files = proj?.files || [];

      // Kiểm tra xem danh sách tệp và nội dung có thay đổi không
      let hasChanges = false;
      if (!lastFilesList || lastFilesList.length !== files.length) {
        hasChanges = true;
      } else {
        for (let i = 0; i < files.length; i++) {
          if (
            files[i]!.name !== lastFilesList[i]!.name ||
            files[i]!.content !== lastFilesList[i]!.content
          ) {
            hasChanges = true;
            break;
          }
        }
      }

      if (!hasChanges && cachedAggregatedScenes !== null) {
        return cachedAggregatedScenes;
      }

      // Cập nhật cache từng tệp và tái tổng hợp mảng kết quả
      const aggregated: SceneItem[] = [];
      for (const file of files) {
        const cached = sceneCache.get(file.name);
        if (cached && cached.content === file.content) {
          aggregated.push(...cached.scenes);
        } else {
          const extracted = extractScenesFromFile(file.name, file.content);
          sceneCache.set(file.name, { content: file.content, scenes: extracted });
          aggregated.push(...extracted);
        }
      }

      lastFilesList = files.map((f) => ({ name: f.name, content: f.content }));
      cachedAggregatedScenes = aggregated;
      return cachedAggregatedScenes;
    },

    getCharacters: () => {
      const proj = getCurProject();
      const map = new Map<string, { displayName?: string; sprites: Set<string> }>();
      for (const c of proj?.characters || []) {
        map.set(c.id, {
          displayName: c.name,
          sprites: new Set(Object.keys(c.sprites || {})),
        });
      }
      return map;
    },

    getAssets: () => {
      const proj = getCurProject();
      const backgrounds = new Set<string>();
      const audio = new Set<string>();
      const voices = new Set<string>();

      for (const a of proj?.assets || []) {
        const isVoice = a.category === 'voice';
        const isAudio =
          a.type === 'audio' ||
          a.category === 'bgm' ||
          a.category === 'sfx' ||
          isVoice;

        // Prioritize DSL 1.1.0 asset identifier (e.g. bg_classroom, bgm_peaceful, voice_alice_01)
        if (a.id) {
          if (isVoice) {
            voices.add(a.id);
          }
          if (isAudio) {
            audio.add(a.id);
          } else {
            backgrounds.add(a.id);
          }
        }

        // Support fallback display/filename reference
        if (a.name) {
          if (isVoice) {
            voices.add(a.name);
          }
          if (isAudio) {
            audio.add(a.name);
          } else {
            backgrounds.add(a.name);
          }
        }
      }

      return { backgrounds, audio, voices };
    },

    getAssetDetails: () => {
      const proj = getCurProject();
      const map = new Map<string, { category?: string; type: string; sizeBytes?: number }>();
      for (const a of proj?.assets || []) {
        const meta = {
          category: a.category,
          type: a.type,
          sizeBytes: a.sizeBytes,
        };
        if (a.id) map.set(a.id, meta);
        if (a.name) map.set(a.name, meta);
      }
      return map;
    },

    getVariables: () => {
      const proj = getCurProject();
      return (proj?.variables || []).map((v) => v.name);
    },

    switchActiveFile: () => {},
  };
}
