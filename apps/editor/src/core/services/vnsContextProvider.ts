import type { Project } from '@vn-engine/shared-types';
import type { VnsProjectContext } from '../../vnsLanguageFeatures';

/**
 * Creates a dynamic Monaco VNS Language Features Context Provider bound to the live Zustand store.
 * Eliminates stale closures and ensures completion items comply strictly with DSL 1.1.0 (asset.id).
 */
export function createVnsProjectContext(
  getProject: () => Project | null,
  fallbackProject?: Project
): VnsProjectContext {
  const getCurProject = () => getProject() || fallbackProject || null;

  return {
    getFiles: () => {
      const proj = getCurProject();
      const map: Record<string, string> = {};
      for (const f of proj?.files || []) {
        map[f.name] = f.content;
      }
      return map;
    },
    getScenes: () => [],
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

      for (const a of proj?.assets || []) {
        const isAudio =
          a.type === 'audio' ||
          a.category === 'bgm' ||
          a.category === 'sfx' ||
          a.category === 'voice';

        // Prioritize DSL 1.1.0 asset identifier (e.g. bg_classroom, bgm_peaceful)
        if (a.id) {
          if (isAudio) {
            audio.add(a.id);
          } else {
            backgrounds.add(a.id);
          }
        }

        // Support fallback display/filename reference
        if (a.name) {
          if (isAudio) {
            audio.add(a.name);
          } else {
            backgrounds.add(a.name);
          }
        }
      }

      return { backgrounds, audio };
    },
    getVariables: () => {
      const proj = getCurProject();
      return (proj?.variables || []).map((v) => v.name);
    },
    switchActiveFile: () => {},
  };
}

