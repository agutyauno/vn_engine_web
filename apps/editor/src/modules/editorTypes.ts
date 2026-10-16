// ================================================================
// VN ENGINE STUDIO - EDITOR TYPES & CONTEXT INTERFACE
// ================================================================

import type * as monaco from 'monaco-editor';
import type { Project, Instruction } from '@vn-engine/shared-types';

export interface CachedAstMetadata {
  scenes: string[];
  characters: Map<string, { displayName?: string; sprites: Set<string> }>;
  assets: {
    backgrounds: Set<string>;
    audio: Set<string>;
  };
  variables: string[];
}

export interface StudioContext {
  getProject(): Project;
  setProject(project: Project): void;
  getActiveFile(): string;
  setActiveFile(fileName: string): void;
  markDirty(): void;
  saveProjectToStorage(): Promise<void>;
  showToast(message: string): void;
  compileCurrentScript(): void;
  getPreviewBaseUrl(): string;
  getPreviewOrigin(): string;
  getFilesMap(): Record<string, string>;
  getFileContent(fileName: string): string;
  setFileContent(fileName: string, content: string): void;
  removeFile(fileName: string): void;
  renameFileKey(oldName: string, newName: string): void;
  getProjectCharactersMap(): Map<string, { displayName?: string; sprites: Set<string> }>;
  getProjectAssetsMap(): { backgrounds: Set<string>; audio: Set<string> };
  getCachedAstMetadata(): CachedAstMetadata;
  getEditorInstance(): monaco.editor.IStandaloneCodeEditor | undefined;
  getLatestProgram(): Instruction[] | null;
  getOrCreateTextModel(fileName: string, initialContent?: string): monaco.editor.ITextModel;
  disposeTextModel(fileName: string): void;
  flushEditorChanges(): void;
  renderFileList(): void;
  renderCharacterList(): void;
  renderAssetList(): void;
  setModelMarkers(
    currentModel: monaco.editor.ITextModel,
    owner: string,
    markers: monaco.editor.IMarkerData[],
  ): void;
}
