import type {
  Project,
  ProjectDisplaySettings,
  ProjectGameplaySettings,
  ProjectEditorSettings,
} from '@vn-engine/shared-types';

export type {
  Project,
  ProjectDisplaySettings,
  ProjectGameplaySettings,
  ProjectEditorSettings,
};

export type DisplaySettings = ProjectDisplaySettings;
export type GameplaySettings = ProjectGameplaySettings;
export type EditorSettings = ProjectEditorSettings;

export interface StorageEstimate {
  usedBytes: number;
  quotaBytes: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description?: string;
  updatedAt: number;
  canvasWidth: number;
  canvasHeight: number;
  orientation: 'landscape' | 'portrait';
  scriptCount: number;
  characterCount: number;
  assetCount: number;
  totalSizeBytes: number;
}

export interface CreateProjectParams {
  title: string;
  description?: string;
  displaySettings: ProjectDisplaySettings;
  gameplaySettings?: Partial<ProjectGameplaySettings>;
  editorSettings?: Partial<ProjectEditorSettings>;
}

export interface AssetBlobRecord {
  id: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;
  updatedAt: number;
}

export interface ProjectRepository {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(params: CreateProjectParams): Promise<Project>;
  updateProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string, newTitle: string): Promise<Project>;
  exportProjectZip?(id: string): Promise<Blob>;
  importProjectZip?(zipFile: File | Blob): Promise<Project>;
  getStorageUsage(): Promise<StorageEstimate>;
  getAssetBlob(assetId: string): Promise<Blob | null>;
  saveAssetBlob(assetId: string, blob: Blob): Promise<void>;
  deleteAssetBlob(assetId: string): Promise<void>;
}
