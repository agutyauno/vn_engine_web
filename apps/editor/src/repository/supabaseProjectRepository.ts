// ================================================================
// SUPABASE PROJECT REPOSITORY (TAD 2.3, system_architecture.md 3.6, ADR-019)
// Tầng lưu trữ Supabase Postgres với quan hệ chuẩn hóa & RLS
// ================================================================

import type { Project, ScriptFile } from '@vn-engine/shared-types';
import type { IProjectRepository } from './projectRepository';
import { DEFAULT_STARTER_SCRIPT, IndexedDBProjectRepository } from './projectRepository';
import { AuthService } from '../services/authService';

export class SupabaseProjectRepository implements IProjectRepository {
  private authService: AuthService;
  private localFallback: IndexedDBProjectRepository;

  constructor() {
    this.authService = AuthService.getInstance();
    this.localFallback = new IndexedDBProjectRepository();
  }

  private isCloudActive(): boolean {
    const supabase = this.authService.getSupabaseClient();
    const user = this.authService.getState().user;
    return !!(supabase && user && !this.authService.isGuest());
  }

  public async getProject(id: string): Promise<Project | null> {
    if (!this.isCloudActive()) {
      return this.localFallback.getProject(id);
    }

    const supabase = this.authService.getSupabaseClient()!;
    try {
      // 1. Fetch project header
      const { data: projectRow, error: pError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (pError || !projectRow) {
        // Try local fallback if not found in cloud
        return this.localFallback.getProject(id);
      }

      // 2. Fetch script files
      const { data: filesRows } = await supabase
        .from('script_files')
        .select('*')
        .eq('project_id', id)
        .order('order_index', { ascending: true });

      // 3. Fetch assets
      const { data: assetRows } = await supabase
        .from('assets')
        .select('*')
        .eq('project_id', id);

      // 4. Fetch UI custom screens
      const { data: uiRows } = await supabase
        .from('ui_custom_screens')
        .select('*')
        .eq('project_id', id);

      // 5. Fetch custom script screens
      const { data: customScriptRows } = await supabase
        .from('custom_script_screens')
        .select('*')
        .eq('project_id', id);

      const files: ScriptFile[] = (filesRows || []).map(f => ({
        id: f.id,
        name: f.name,
        content: f.content,
        order: f.order_index,
        version: f.version || 1,
        updatedBy: f.updated_by || undefined,
      }));

      const project: Project = {
        id: projectRow.id,
        title: projectRow.title,
        version: projectRow.version || 1,
        ownerId: projectRow.owner_id,
        defaultLanguage: projectRow.default_language || 'en',
        publishedGameId: projectRow.published_game_id || undefined,
        files: files.length > 0 ? files : [
          {
            id: 'main.vns',
            name: 'main.vns',
            content: DEFAULT_STARTER_SCRIPT,
            order: 0,
            version: 1,
          }
        ],
        characters: projectRow.characters || [],
        variables: projectRow.variables || [],
        assets: (assetRows || []).map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          storageUrl: a.storage_url,
          sizeBytes: Number(a.size_bytes || 0),
          version: a.version || 1,
        })),
        uiScreens: (uiRows || []).map(u => ({
          id: u.id,
          name: u.name,
          targetSlot: u.target_slot,
          template: u.template,
          version: u.version || 1,
        })),
        customScripts: (customScriptRows || []).map(s => ({
          id: s.id,
          name: s.name,
          scriptContent: s.script_content,
          version: s.version || 1,
        })),
      };

      return project;
    } catch (err) {
      console.warn('[SupabaseProjectRepository] Error loading from cloud, falling back to local:', err);
      return this.localFallback.getProject(id);
    }
  }

  public async saveProject(project: Project): Promise<void> {
    // Always mirror to local IndexedDB for offline resilience (TAD 2.4)
    await this.localFallback.saveProject(project);

    if (!this.isCloudActive()) return;

    const supabase = this.authService.getSupabaseClient()!;
    const ownerId = this.authService.getUserId();

    try {
      // Upsert project header (metadata level versioning only - ADR-011)
      await supabase.from('projects').upsert({
        id: project.id,
        owner_id: ownerId,
        title: project.title,
        default_language: project.defaultLanguage,
        version: project.version,
        published_game_id: project.publishedGameId || null,
        characters: project.characters,
        variables: project.variables,
        updated_at: new Date().toISOString(),
      });

      // Upsert script files
      if (project.files && project.files.length > 0) {
        for (const file of project.files) {
          await supabase.from('script_files').upsert({
            project_id: project.id,
            name: file.name,
            content: file.content,
            order_index: file.order,
            version: file.version,
            updated_by: ownerId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'project_id,name' });
        }
      }

      // Upsert UI custom screens
      if (project.uiScreens && project.uiScreens.length > 0) {
        for (const ui of project.uiScreens) {
          await supabase.from('ui_custom_screens').upsert({
            id: ui.id,
            project_id: project.id,
            name: ui.name,
            target_slot: ui.targetSlot,
            template: ui.template,
            version: ui.version || 1,
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Upsert assets
      if (project.assets && project.assets.length > 0) {
        for (const asset of project.assets) {
          await supabase.from('assets').upsert({
            id: asset.id,
            project_id: project.id,
            name: asset.name,
            type: asset.type,
            storage_url: asset.storageUrl,
            storage_path: asset.name,
            size_bytes: asset.sizeBytes,
            version: asset.version || 1,
          });
        }
      }
    } catch (err) {
      console.error('[SupabaseProjectRepository] Error saving to cloud:', err);
    }
  }

  public async saveScriptFile(projectId: string, file: ScriptFile): Promise<void> {
    await this.localFallback.saveScriptFile(projectId, file);

    if (!this.isCloudActive()) return;

    const supabase = this.authService.getSupabaseClient()!;
    const ownerId = this.authService.getUserId();
    try {
      await supabase.from('script_files').upsert({
        project_id: projectId,
        name: file.name,
        content: file.content,
        order_index: file.order,
        version: file.version,
        updated_by: ownerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,name' });
    } catch (err) {
      console.error('[SupabaseProjectRepository] Error saving script to cloud:', err);
    }
  }

  public async listProjects(): Promise<Project[]> {
    if (!this.isCloudActive()) {
      return this.localFallback.listProjects();
    }

    const supabase = this.authService.getSupabaseClient()!;
    const ownerId = this.authService.getUserId();

    try {
      const { data: projectRows, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false });

      if (error || !projectRows || projectRows.length === 0) {
        return this.localFallback.listProjects();
      }

      // Convert rows to Project stubs
      const projects: Project[] = projectRows.map(r => ({
        id: r.id,
        title: r.title,
        version: r.version || 1,
        ownerId: r.owner_id,
        defaultLanguage: r.default_language || 'en',
        publishedGameId: r.published_game_id || undefined,
        files: [],
        characters: r.characters || [],
        variables: r.variables || [],
        assets: [],
        uiScreens: [],
        customScripts: [],
      }));

      return projects;
    } catch (err) {
      console.warn('[SupabaseProjectRepository] Error listing cloud projects:', err);
      return this.localFallback.listProjects();
    }
  }

  public async createProject(title: string, ownerId?: string): Promise<Project> {
    const finalOwnerId = ownerId || this.authService.getUserId();

    if (!this.isCloudActive()) {
      return this.localFallback.createProject(title, finalOwnerId);
    }

    const supabase = this.authService.getSupabaseClient()!;
    try {
      // Insert new project record
      const { data: newRow, error } = await supabase
        .from('projects')
        .insert({
          title: title.trim() || 'Untitled Project',
          owner_id: finalOwnerId,
          version: 1,
          default_language: 'en',
        })
        .select()
        .single();

      if (error || !newRow) {
        console.warn('[SupabaseProjectRepository] Failed to insert cloud project, falling back to local');
        return this.localFallback.createProject(title, finalOwnerId);
      }

      // Insert default main.vns
      await supabase.from('script_files').insert({
        project_id: newRow.id,
        name: 'main.vns',
        content: DEFAULT_STARTER_SCRIPT,
        order_index: 0,
        version: 1,
      });

      const newProject: Project = {
        id: newRow.id,
        title: newRow.title,
        version: 1,
        ownerId: newRow.owner_id,
        defaultLanguage: 'en',
        files: [
          {
            id: 'main.vns',
            name: 'main.vns',
            content: DEFAULT_STARTER_SCRIPT,
            order: 0,
            version: 1,
          }
        ],
        characters: [],
        variables: [],
        assets: [],
        uiScreens: [],
        customScripts: [],
      };

      // Also mirror to local
      await this.localFallback.saveProject(newProject);
      return newProject;
    } catch (err) {
      console.error('[SupabaseProjectRepository] Error creating cloud project:', err);
      return this.localFallback.createProject(title, finalOwnerId);
    }
  }

  public async deleteProject(id: string): Promise<void> {
    await this.localFallback.deleteProject(id);

    if (!this.isCloudActive()) return;

    const supabase = this.authService.getSupabaseClient()!;
    try {
      await supabase.from('projects').delete().eq('id', id);
    } catch (err) {
      console.error('[SupabaseProjectRepository] Error deleting cloud project:', err);
    }
  }

  public async seedDefaultProjectIfEmpty(): Promise<Project> {
    const list = await this.listProjects();
    if (list.length > 0 && list[0]) {
      return list[0];
    }
    return this.createProject('Academy Mystery');
  }
}
