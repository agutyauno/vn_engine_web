import type {
  Project,
  ProjectDisplaySettings,
  ProjectGameplaySettings,
  ProjectEditorSettings,
} from '@vn-engine/shared-types';

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

export interface ProjectRepository {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(params: CreateProjectParams): Promise<Project>;
  updateProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string, newTitle: string): Promise<Project>;
  exportProjectZip?(id: string): Promise<Blob>;
  importProjectZip?(zipFile: File | Blob): Promise<Project>;
  getStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number }>;
}
