// ================================================================
// PROJECT REPOSITORY PATTERN (system_architecture.md 3.6, TAD 2.3)
// Tầng lưu trữ trừu tượng IndexedDB cho Web Studio Editor
// ================================================================

import type { Project, ScriptFile } from '@vn-engine/shared-types';

export interface IProjectRepository {
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  saveScriptFile(projectId: string, file: ScriptFile): Promise<void>;
  listProjects(): Promise<Project[]>;
  createProject(title: string, ownerId?: string): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  seedDefaultProjectIfEmpty(): Promise<Project>;
}

const DB_NAME = 'vn_engine_studio_db';
const STORE_PROJECTS = 'projects';

export const DEFAULT_STARTER_SCRIPT = `# ==============================================================
# Welcome to Visual Novel Engine!
# Write your script here and see the live preview on the right.
# ==============================================================

scene start {
    background bg_courtyard transition: "fade"
    play music "theme_peaceful" volume: 0.8 loop: true

    show alice.happy(position: "center")
    alice: "Hello and welcome to your new visual novel story!"
    alice: "You can write script scenes here and see them previewed live on the right."

    choice {
        "Tell me more": goto .more_info
        "Let's get started": goto .begin
    }

    scene .more_info {
        alice: "You can manage characters, backgrounds, and audio assets in the tabs above."
        goto .begin
    }

    scene .begin {
        alice: "Have fun creating your adventure!"
        end
    }
}
`;

export class IndexedDBProjectRepository implements IProjectRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      // Open without hardcoded version to avoid VersionError if database was upgraded on client
      const request = indexedDB.open(DB_NAME);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(STORE_PROJECTS)) {
          resolve(db);
        } else {
          // If store is missing on an existing higher-version database, upgrade by 1 version
          const nextVersion = (db.version || 1) + 1;
          db.close();

          const upgradeReq = indexedDB.open(DB_NAME, nextVersion);
          upgradeReq.onupgradeneeded = () => {
            const upgradedDb = upgradeReq.result;
            if (!upgradedDb.objectStoreNames.contains(STORE_PROJECTS)) {
              upgradedDb.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
            }
          };
          upgradeReq.onsuccess = () => resolve(upgradeReq.result);
          upgradeReq.onerror = () => reject(upgradeReq.error);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    }).catch(err => {
      this.dbPromise = null;
      throw err;
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

  public async listProjects(): Promise<Project[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as Project[]) || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async createProject(title: string, ownerId: string = 'local_guest'): Promise<Project> {
    const newId = 'proj_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const newProject: Project = {
      id: newId,
      title: title.trim() || 'Untitled Project',
      version: 1,
      ownerId: ownerId,
      defaultLanguage: 'en',
      files: [
        {
          id: 'main.vns',
          name: 'main.vns',
          content: DEFAULT_STARTER_SCRIPT,
          order: 0,
          version: 1,
        },
      ],
      characters: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    await this.saveProject(newProject);
    return newProject;
  }

  public async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async seedDefaultProjectIfEmpty(): Promise<Project> {
    const existing = await this.listProjects();
    if (existing.length > 0 && existing[0]) {
      return existing[0];
    }

    const defaultProject: Project = {
      id: 'local_default_project',
      title: 'Academy Mystery',
      version: 1,
      ownerId: 'local_guest',
      defaultLanguage: 'en',
      files: [
        {
          id: 'main.vns',
          name: 'main.vns',
          content: DEFAULT_STARTER_SCRIPT,
          order: 0,
          version: 1,
        },
      ],
      characters: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    await this.saveProject(defaultProject);
    return defaultProject;
  }
}
