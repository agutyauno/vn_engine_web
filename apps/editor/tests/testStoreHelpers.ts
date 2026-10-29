import {
  useProjectStore,
  initialProjectState,
  type ProjectStoreState,
} from '../src/core/stores/projectStore';
import {
  useEditorUIStore,
  initialUIState,
  type EditorUIStoreState,
} from '../src/core/stores/uiStore';
import {
  useDiagnosticsStore,
  initialDiagnosticsState,
  type DiagnosticsStoreState,
} from '../src/core/stores/diagnosticsStore';
import {
  usePreviewStore,
  initialPreviewState,
  type LivePreviewStoreState,
} from '../src/core/stores/livePreviewStore';

export interface TestStoreOverrides {
  project?: Partial<ProjectStoreState>;
  ui?: Partial<EditorUIStoreState>;
  diagnostics?: Partial<DiagnosticsStoreState>;
  livePreview?: Partial<LivePreviewStoreState>;
}

export function setupTestStore(overrides?: TestStoreOverrides): void {
  useProjectStore.setState({
    ...initialProjectState,
    ...(overrides?.project ?? {}),
  });

  useEditorUIStore.setState({
    ...initialUIState,
    ...(overrides?.ui ?? {}),
  });

  useDiagnosticsStore.setState({
    ...initialDiagnosticsState,
    ...(overrides?.diagnostics ?? {}),
  });

  usePreviewStore.setState({
    ...initialPreviewState,
    ...(overrides?.livePreview ?? {}),
  });
}
