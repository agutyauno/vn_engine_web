// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (MAIN ENTRY)
// Tích hợp Kernel, Adapters và Preact UI Root
// ==========================================

import { render, h } from 'preact';
import { compileString } from '@vn-engine/dsl-compiler';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type { Instruction, Character } from '@vn-engine/shared-types';

import { VNRuntimeKernel } from './core/VNRuntimeKernel';
import type { PlayerMode } from './core/contracts';
import { RendererAdapter } from './adapters/RendererAdapter';
import { AudioAdapter } from './adapters/AudioAdapter';
import { StorageAdapter } from './adapters/StorageAdapter';
import {
  AssetResolverAdapter,
  type ProjectData,
  type ProjectDataCharacter,
  type ProjectDataAsset,
} from './adapters/AssetResolverAdapter';
import { PreviewBridgeAdapter, isAllowedEditorOrigin } from './adapters/PreviewBridgeAdapter';
import { PlayerUIProvider } from './ui/context/PlayerUIContext';
import { PlayerApp } from './ui/components/PlayerApp';

import scenarioSource from './scenario.vns?raw';

const defaultStandaloneCharacters: Character[] = [
  { id: 'alice', name: 'Alice', colorHex: '#38bdf8', sprites: {} },
  { id: 'bob', name: 'Bob', colorHex: '#f43f5e', sprites: {} },
];

window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true' || window.name === 'VN_Preview_Popout';
  const isModePreview = urlParams.get('mode') === 'preview';
  const isEmbedded =
    (window.parent && window.parent !== window) || isPopout || urlParams.get('embedded') === 'true' || isModePreview;

  const projectId = urlParams.get('projectId') || urlParams.get('project') || undefined;

  if (isEmbedded) {
    document.documentElement.classList.add('is-embedded');
    document.body.classList.add('is-embedded');
  }

  // 1. Quản lý Project Data và Asset Resolver
  let currentProjectData: ProjectData = {
    id: projectId,
    characters: (!isEmbedded && !isModePreview) ? (defaultStandaloneCharacters as unknown as ProjectDataCharacter[]) : [],
    assets: [],
  };

  let bridge: PreviewBridgeAdapter;

  const assetResolver = new AssetResolverAdapter(
    () => currentProjectData,
    {
      report: (diag) => {
        if (bridge && typeof bridge.sendDiagnostic === 'function') {
          bridge.sendDiagnostic(diag as any);
        }
      },
    },
  );

  // 2. Khởi tạo Platform Adapters
  const gameRenderer = new GameRenderer();
  await gameRenderer.init();
  const rendererAdapter = new RendererAdapter(gameRenderer, {
    assetGraphicResolver: assetResolver.getAssetGraphicResolver(),
    isPropChecker: (id: string) => assetResolver.checkIsProp(id),
  });

  const audioManager = new AudioManager();
  const audioAdapter = new AudioAdapter(audioManager, {
    assetResolver: assetResolver.getAssetAudioResolver(),
  });

  const storageAdapter = new StorageAdapter({
    projectId,
    isPreview: isEmbedded || isModePreview,
  });

  // 3. Biên dịch kịch bản mặc định nếu không phải chế độ Live Preview
  let program: Instruction[] = [];
  if (!isEmbedded && !isModePreview) {
    try {
      const compileResult = compileString(scenarioSource, 'scenario.vns');
      if (compileResult.success && compileResult.program) {
        program = compileResult.program;
      } else {
        console.error('[RuntimePlayer] Scenario compile error:', compileResult.errors);
      }
    } catch (err) {
      console.error('[RuntimePlayer] Failed to compile scenario:', err);
    }
  }

  // 4. Khởi tạo VNRuntimeKernel
  const initialMode: PlayerMode = (isEmbedded || isModePreview) ? 'STANDBY' : 'TITLE';
  const kernel = new VNRuntimeKernel(
    program,
    {
      renderer: rendererAdapter,
      audio: audioAdapter,
      storage: storageAdapter,
    },
    {
      initialMode,
      projectId,
      characters: (!isEmbedded && !isModePreview) ? defaultStandaloneCharacters : undefined,
    },
  );

  (window as unknown as { vnKernel: VNRuntimeKernel }).vnKernel = kernel;

  // 5. Kết nối PreviewBridgeAdapter với Web Studio Editor
  let targetEditorOrigin = '*';
  const editorOriginParam = urlParams.get('editorOrigin');
  if (editorOriginParam && isAllowedEditorOrigin(editorOriginParam)) {
    targetEditorOrigin = editorOriginParam;
  } else if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (isAllowedEditorOrigin(refUrl.origin)) {
        targetEditorOrigin = refUrl.origin;
      }
    } catch {
      // ignore
    }
  }

  bridge = new PreviewBridgeAdapter({
    editorOrigin: targetEditorOrigin,
    onHotReload: async (newProgram, opts) => {
      if (opts?.characters || opts?.assets) {
        currentProjectData = {
          ...currentProjectData,
          id: opts.projectId || currentProjectData.id,
          characters: (opts.characters as unknown as ProjectDataCharacter[]) || currentProjectData.characters,
          assets: (opts.assets as unknown as ProjectDataAsset[]) || currentProjectData.assets,
        };
        assetResolver.resetWarnedAssets();
      }
      await kernel.loadProgram(newProgram, opts);
      if (kernel.getState().mode === 'STANDBY') {
        await kernel.startNewGame();
      }
    },
    onSetVariable: (name, value) => {
      kernel.setVariable(name, value);
    },
  });
  bridge.init();

  // 6. Gắn canvas PixiJS khi chuyển sang GAMEPLAY mode
  const attachCanvasToStage = () => {
    const container = document.getElementById('pixi-canvas-container');
    if (container && gameRenderer.app.canvas && !container.contains(gameRenderer.app.canvas)) {
      container.innerHTML = '';
      container.appendChild(gameRenderer.app.canvas);
      gameRenderer.resizeToContainer(container);
    }
  };

  kernel.subscribe((state) => {
    if (state.mode === 'GAMEPLAY') {
      requestAnimationFrame(attachCanvasToStage);
    }
    bridge.sendStateUpdate(kernel.getVariables());
  });

  // 6. Mount Preact UI Root vào #ui-root
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    render(
      h(PlayerUIProvider, { kernel }, h(PlayerApp, null)),
      uiRoot,
    );
  }
});
