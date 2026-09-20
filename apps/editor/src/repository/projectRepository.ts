// ================================================================
// PROJECT REPOSITORY PATTERN (system_architecture.md 3.6)
// Tầng lưu trữ trừu tượng IndexedDB cho Web Studio Editor
// ================================================================

import type { Project, ScriptFile } from '@vn-engine/shared-types';

export interface IProjectRepository {
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  saveScriptFile(projectId: string, file: ScriptFile): Promise<void>;
}

const DB_NAME = 'vn_engine_studio_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';

export class IndexedDBProjectRepository implements IProjectRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  public async getProject(id: string): Promise<Project | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve((request.result as Project) || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async saveProject(project: Project): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.put(project);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async saveScriptFile(projectId: string, file: ScriptFile): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) return;

    const existingIndex = project.files.findIndex(f => f.id === file.id || f.name === file.name);
    if (existingIndex >= 0) {
      project.files[existingIndex] = file;
    } else {
      project.files.push(file);
    }
    project.version = (project.version || 1) + 1;

    await this.saveProject(project);
  }
}
