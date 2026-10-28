import type { Project, ScriptFile } from '@vn-engine/shared-types';
import type {
  ProjectRepository,
  ProjectSummary,
  CreateProjectParams,
} from '../contracts/repository';

const DEFAULT_DB_NAME = 'vn_engine_studio_db';
const DB_VERSION = 1;

export class IndexedDBProjectRepository implements ProjectRepository {
  private dbName: string;
  private dbInstance: IDBDatabase | null = null;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbInstance) {
      return this.dbInstance;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('by_title', 'title', { unique: false });
          projectStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('asset_blobs')) {
          db.createObjectStore('asset_blobs', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.dbInstance = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  async close(): Promise<void> {
    if (this.dbInstance) {
      this.dbInstance.close();
      this.dbInstance = null;
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.getAll();

      request.onsuccess = () => {
        const projects: Project[] = request.result || [];
        const summaries: ProjectSummary[] = projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          updatedAt: p.updatedAt || Date.now(),
          canvasWidth: p.displaySettings?.width || 1920,
          canvasHeight: p.displaySettings?.height || 1080,
          orientation: p.displaySettings?.orientation || 'landscape',
          scriptCount: p.files?.length || 0,
          characterCount: p.characters?.length || 0,
          assetCount: p.assets?.length || 0,
          totalSizeBytes: JSON.stringify(p).length,
        }));

        // Sắp xếp theo ngày cập nhật mới nhất trước
        summaries.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(summaries);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to list projects'));
      };
    });
  }

  async getProject(id: string): Promise<Project | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to get project ${id}`));
      };
    });
  }

  async createProject(params: CreateProjectParams): Promise<Project> {
    const db = await this.getDB();
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const defaultScript: ScriptFile = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `file_${Date.now()}`,
      name: 'main.vns',
      content: `// Main visual novel script\nscene start {\n  narrator: "Welcome to ${params.title}."\n}\n`,
      order: 0,
      version: 1,
    };

    const newProject: Project = {
      id,
      title: params.title,
      description: params.description,
      version: 1,
      ownerId: 'local-author',
      defaultLanguage: 'vi',
      entryScene: 'start',
      updatedAt: now,
      displaySettings: params.displaySettings,
      gameplaySettings: {
        unmetChoiceDisplay: 'disabled',
        textSpeed: 45,
        autoForwardDelay: 2000,
        defaultVolumes: {
          master: 0.8,
          bgm: 0.7,
          sfx: 0.9,
          voice: 0.85,
        },
        ...params.gameplaySettings,
      },
      editorSettings: {
        autoSave: true,
        autoSaveDebounceMs: 1000,
        ...params.editorSettings,
      },
      files: [defaultScript],
      characters: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put(newProject);

      request.onsuccess = () => {
        resolve(newProject);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to create project'));
      };
    });
  }

  async updateProject(project: Project): Promise<void> {
    const db = await this.getDB();
    const updated = {
      ...project,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put(updated);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to update project ${project.id}`));
      };
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to delete project ${id}`));
      };
    });
  }

  async duplicateProject(id: string, newTitle: string): Promise<Project> {
    const original = await this.getProject(id);
    if (!original) {
      throw new Error(`Project not found: ${id}`);
    }

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const clonedProject: Project = {
      ...original,
      id: newId,
      title: newTitle,
      updatedAt: now,
      version: 1,
      files: (original.files || []).map((f) => ({
        ...f,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      })),
      characters: (original.characters || []).map((c) => ({ ...c })),
      assets: (original.assets || []).map((a) => ({ ...a })),
      variables: (original.variables || []).map((v) => ({ ...v })),
    };

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put(clonedProject);

      request.onsuccess = () => {
        resolve(clonedProject);
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to duplicate project ${id}`));
      };
    });
  }

  async getStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usedBytes: estimate.usage || 0,
          quotaBytes: estimate.quota || 1073741824, // Mặc định 1GB nếu quota không xác định
        };
      } catch {
        // Fallback bên dưới
      }
    }

    // Fallback: Ước lượng dựa trên dung lượng chuỗi JSON của các projects
    const summaries = await this.listProjects();
    const usedBytes = summaries.reduce((acc, curr) => acc + curr.totalSizeBytes, 0);
    return {
      usedBytes,
      quotaBytes: 1073741824, // 1GB quota
    };
  }
}
