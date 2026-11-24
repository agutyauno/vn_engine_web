// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (MAIN ENTRY)
// Tích hợp Kernel, Adapters và Preact UI Root
// ==========================================

import { render, h } from 'preact';
import { compileString } from '@vn-engine/dsl-compiler';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type { Instruction, AssetRef, EngineDiagnostic } from '@vn-engine/shared-types';

import { VNRuntimeKernel } from './core/VNRuntimeKernel';
import type { PlayerMode, TitleScreenConfig } from './core/contracts';
import { RendererAdapter } from './adapters/RendererAdapter';
import { AudioAdapter } from './adapters/AudioAdapter';
import { StorageAdapter } from './adapters/StorageAdapter';
import {
  AssetResolverAdapter,
  type ProjectData,
  type ProjectDataAsset,
} from './adapters/AssetResolverAdapter';
import {
  PreviewBridgeAdapter,
  isAllowedEditorOrigin,
  hydrateForeignAssetBlobs,
} from './adapters/PreviewBridgeAdapter';
import { resolveTitleConfig } from './adapters/titleConfigResolver';
import { loadGameBundle } from './adapters/gameBundleLoader';
import { GameDataErrorScreen } from './ui/components/GameDataErrorScreen';
import { PlayerUIProvider } from './ui/context/PlayerUIContext';
import { PlayerApp } from './ui/components/PlayerApp';

import scenarioSource from './scenario.vns?raw';

const defaultStandaloneAssets: AssetRef[] = [
  {
    id: 'asset_alice_default',
    name: 'alice.png',
    type: 'image',
    storageUrl: '',
    sizeBytes: 0,
    tag: 'alice',
    variant: 'default',
    category: 'sprite',
  },
  {
    id: 'asset_bob_default',
    name: 'bob.png',
    type: 'image',
    storageUrl: '',
    sizeBytes: 0,
    tag: 'bob',
    variant: 'default',
    category: 'sprite',
  },
];

window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true' || window.name === 'VN_Preview_Popout';
  const isModePreview = urlParams.get('mode') === 'preview';
  const isEmbedded =
    (window.parent && window.parent !== window) ||
    isPopout ||
    urlParams.get('embedded') === 'true' ||
    isModePreview;

  let projectId = urlParams.get('projectId') || urlParams.get('project') || undefined;

  if (isEmbedded) {
    document.documentElement.classList.add('is-embedded');
    document.body.classList.add('is-embedded');
  }

  // 1. Quản lý Project Data và Asset Resolver
  const currentProjectData: ProjectData = {
    id: projectId,
    assets:
      !isEmbedded && !isModePreview
        ? (defaultStandaloneAssets as unknown as ProjectDataAsset[])
        : [],
  };

  let program: Instruction[] = [];
  let titleConfig: Partial<TitleScreenConfig> | undefined;
  let entryScene: string | undefined;

  // 2. Nạp game bundle cho chế độ standalone (không áp dụng khi preview/embedded)
  if (!isEmbedded) {
    const loadResult = await loadGameBundle({
      document,
      fetchFn: url => fetch(url, { cache: 'no-cache' }),
      baseUrl: document.baseURI,
    });

    if (loadResult.kind === 'error') {
      const uiRoot = document.getElementById('ui-root');
      if (uiRoot) {
        render(h(GameDataErrorScreen, { error: loadResult.error }), uiRoot);
      }
      return;
    }

    if (loadResult.kind === 'none') {
      if (!import.meta.env.DEV) {
        const uiRoot = document.getElementById('ui-root');
        if (uiRoot) {
          render(h(GameDataErrorScreen, { error: 'not_found' }), uiRoot);
        }
        return;
      }

      // Giữ hành vi biên dịch kịch bản mặc định trong môi trường dev
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
    } else {
      // loadResult.kind === 'bundle'
      const { bundle, warnings } = loadResult;
      projectId = bundle.projectId;
      currentProjectData.id = projectId;
      currentProjectData.assets = bundle.assets.map(asset => ({ ...asset }));
      program = bundle.program;
      titleConfig = resolveTitleConfig(bundle.title, bundle.titleSettings, bundle.assets);
      entryScene = bundle.entryScene;
      document.title = bundle.title;
      for (const warning of warnings) {
        console.warn(warning);
      }
    }
  }

  // 3. Khởi tạo Platform Adapters (chỉ khi nạp thành công hoặc preview/embedded)
  let bridge: PreviewBridgeAdapter;

  const assetResolver = new AssetResolverAdapter(() => currentProjectData, {
    report: diag => {
      if (bridge && typeof bridge.sendDiagnostic === 'function') {
        bridge.sendDiagnostic(diag as EngineDiagnostic);
      }
    },
  });

  const gameRenderer = new GameRenderer();
  await gameRenderer.init();
  const rendererAdapter = new RendererAdapter(gameRenderer, {
    assetGraphicResolver: assetResolver.getAssetGraphicResolver(),
  });

  const audioManager = new AudioManager();
  const audioAdapter = new AudioAdapter(audioManager, {
    assetResolver: assetResolver.getAssetAudioResolver(),
    audioFormatResolver: assetResolver.getAssetAudioFormatResolver(),
  });

  const storageAdapter = new StorageAdapter({
    projectId,
    isPreview: isEmbedded || isModePreview,
  });
  // Ghi nốt settings đang chờ debounce (200ms) trước khi trang bị ẩn/đóng.
  window.addEventListener('pagehide', () => storageAdapter.flushSettings());

  // 4. Khởi tạo VNRuntimeKernel
  const initialMode: PlayerMode = isEmbedded || isModePreview ? 'STANDBY' : 'TITLE';
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
      titleConfig,
      entryScene,
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
      let effectiveAssets = opts?.assets;
      if (opts?.assets && opts.assets.length > 0) {
        effectiveAssets = await hydrateForeignAssetBlobs(opts.assets, bridge);
      }
      if (effectiveAssets) {
        currentProjectData.id = opts?.projectId || currentProjectData.id;
        currentProjectData.assets =
          (effectiveAssets as unknown as ProjectDataAsset[]) || currentProjectData.assets;
        assetResolver.resetWarnedAssets();
      }
      if (opts?.title !== undefined || opts?.titleSettings !== undefined) {
        kernel.setTitleConfig(
          resolveTitleConfig(opts.title, opts.titleSettings, effectiveAssets ?? []),
        );
      }
      const startAtTitle = opts?.startMode === 'title';
      await kernel.loadProgram(newProgram, {
        ...opts,
        assets: effectiveAssets,
        startAtTitle,
        startGameplay: opts?.startMode === 'scene',
      });
      if (kernel.getState().mode === 'STANDBY' && !startAtTitle) {
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

  kernel.subscribe(state => {
    if (state.mode === 'GAMEPLAY') {
      requestAnimationFrame(attachCanvasToStage);
    }
    bridge.sendStateUpdate(kernel.getVariables());
  });

  // 7. Mount Preact UI Root vào #ui-root
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    render(h(PlayerUIProvider, { kernel }, h(PlayerApp, null)), uiRoot);
  }
});
