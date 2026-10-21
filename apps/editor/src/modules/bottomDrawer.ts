// ================================================================
// VN ENGINE STUDIO - BOTTOM DRAWER MODULE
// Quản lý Drawer phía dưới: Báo cáo lỗi (Problems), Variables Watch & AST Inspector
// ================================================================

import type * as monaco from 'monaco-editor';
import type { CompileError } from '@vn-engine/dsl-compiler';
import type { StudioContext } from './editorTypes';
import type { PreviewStateUpdateMessage } from './previewBridge';

export interface VariableMeta {
  name: string;
  value: unknown;
  scope: 'global' | 'local';
  sceneName?: string;
}

export class BottomDrawer {
  private context: StudioContext;

  private drawerTabProblems: HTMLElement;
  private problemsSummary: HTMLElement;
  private problemsList: HTMLElement;
  private varsWatchTbody: HTMLElement;
  private varsSceneFilterSelect: HTMLSelectElement | null = null;
  private varsCountBadge: HTMLElement | null = null;

  private filterMode: string = '__active__';
  private editorCursorScene: string | null = null;
  private allScenesList: string[] = [];

  private cachedAstVariables: Map<string, VariableMeta> = new Map();
  private latestLiveState: PreviewStateUpdateMessage | null = null;
  private previousValues: Map<string, unknown> = new Map();
  private changedTimestamps: Map<string, number> = new Map();
  private onVariableChange?: (
    name: string,
    value: string | number | boolean,
    scope?: 'global' | 'local',
  ) => void;

  constructor(context: StudioContext) {
    this.context = context;
    this.drawerTabProblems = document.getElementById('drawer-tab-problems')!;
    this.problemsSummary = document.getElementById('problems-summary')!;
    this.problemsList = document.getElementById('problems-list')!;
    this.varsWatchTbody = document.getElementById('vars-watch-tbody')!;
    this.varsSceneFilterSelect = document.getElementById(
      'vars-scene-filter',
    ) as HTMLSelectElement | null;
    this.varsCountBadge = document.getElementById('vars-count-badge');

    if (this.varsSceneFilterSelect) {
      this.varsSceneFilterSelect.addEventListener('change', () => {
        this.filterMode = this.varsSceneFilterSelect?.value || '__active__';
        this.renderVariablesWatch();
      });
    }

    this.setupBottomDrawer();
  }

  public setOnVariableChange(
    cb: (name: string, value: string | number | boolean, scope?: 'global' | 'local') => void,
  ): void {
    this.onVariableChange = cb;
  }

  public populateSceneFilter(scenes: string[]): void {
    this.allScenesList = scenes;
    if (!this.varsSceneFilterSelect) return;

    const currentSelected = this.filterMode;
    const activeSceneName = this.getActiveSceneName();

    this.varsSceneFilterSelect.innerHTML = '';

    const optActive = document.createElement('option');
    optActive.value = '__active__';
    optActive.textContent = `🎯 Active Scene (${activeSceneName})`;
    this.varsSceneFilterSelect.appendChild(optActive);

    const optAll = document.createElement('option');
    optAll.value = '__all__';
    optAll.textContent = '🌐 All Variables (Toàn bộ)';
    this.varsSceneFilterSelect.appendChild(optAll);

    if (scenes.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Specific Scenes';
      for (const sc of scenes) {
        const opt = document.createElement('option');
        opt.value = sc;
        opt.textContent = `Scene: ${sc}`;
        optGroup.appendChild(opt);
      }
      this.varsSceneFilterSelect.appendChild(optGroup);
    }

    this.varsSceneFilterSelect.value = currentSelected;
  }

  public setEditorCursorScene(sceneName: string): void {
    if (this.editorCursorScene !== sceneName) {
      this.editorCursorScene = sceneName;
      if (this.filterMode === '__active__' && !this.latestLiveState) {
        this.renderVariablesWatch();
      }
    }
  }

  public getActiveSceneName(): string {
    return (
      this.latestLiveState?.currentScene ||
      this.editorCursorScene ||
      this.allScenesList[0] ||
      'start'
    );
  }

  public updateLiveVariables(liveState: PreviewStateUpdateMessage): void {
    this.latestLiveState = liveState;
    this.renderVariablesWatch();
  }

  private setupBottomDrawer(): void {
    const drawerTabs = document.querySelectorAll<HTMLButtonElement>('.drawer-tab-btn');
    const drawerPanes = document.querySelectorAll<HTMLElement>('.drawer-pane');
    const bottomDrawer = document.getElementById('studio-bottom-drawer');
    const toggleBtn = document.getElementById('drawer-toggle-btn');

    drawerTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.drawerTab;
        drawerTabs.forEach(t => t.classList.toggle('active', t === tab));
        drawerPanes.forEach(p => {
          const isTarget =
            p.id === `drawer-pane-${targetTab}` ||
            (targetTab === 'variables-watch' && p.id === 'drawer-pane-variables') ||
            (targetTab === 'variables' && p.id === 'drawer-pane-variables-watch');
          p.classList.toggle('active', isTarget);
        });

        if (bottomDrawer?.classList.contains('collapsed')) {
          bottomDrawer.classList.remove('collapsed');
          if (toggleBtn) toggleBtn.textContent = '▾';
          this.context.getEditorInstance()?.layout();
        }
      });
    });

    if (toggleBtn && bottomDrawer) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = bottomDrawer.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '▴' : '▾';
        this.context.getEditorInstance()?.layout();
      });
    }

    const drawerHeader = document.querySelector('.drawer-header');
    drawerHeader?.addEventListener('dblclick', e => {
      if (
        (e.target as HTMLElement).closest('.drawer-tab-btn') ||
        (e.target as HTMLElement).closest('.drawer-toggle-btn')
      ) {
        return;
      }
      if (bottomDrawer) {
        const isCollapsed = bottomDrawer.classList.toggle('collapsed');
        if (toggleBtn) toggleBtn.textContent = isCollapsed ? '▴' : '▾';
        this.context.getEditorInstance()?.layout();
      }
    });
  }

  public renderSuccess(_instructionCount: number, currentModel?: monaco.editor.ITextModel): void {
    this.drawerTabProblems.classList.remove('has-error');
    this.problemsSummary.textContent = '● Problems (0)';
    this.problemsList.innerHTML = `<div class="problems-empty-state">✓ No problems detected in project. Code is valid.</div>`;

    if (currentModel) {
      this.context.setModelMarkers(currentModel, 'vns-compiler', []);
    }
  }

  public renderErrors(errors: CompileError[], currentModel?: monaco.editor.ITextModel): void {
    this.drawerTabProblems.classList.add('has-error');
    this.problemsSummary.textContent = `● Problems (${errors.length} errors)`;

    const bottomDrawer = document.getElementById('studio-bottom-drawer');
    if (bottomDrawer?.classList.contains('collapsed')) {
      bottomDrawer.classList.remove('collapsed');
      const toggleBtn = document.getElementById('drawer-toggle-btn');
      if (toggleBtn) toggleBtn.textContent = '▾';
      this.context.getEditorInstance()?.layout();
    }

    // Đảm bảo tab Problems active trong bottom drawer
    const problemsTab = document.getElementById('drawer-tab-problems');
    const problemsPane = document.getElementById('drawer-pane-problems');
    if (problemsTab && !problemsTab.classList.contains('active')) {
      document
        .querySelectorAll('.drawer-tab-btn')
        .forEach(t => t.classList.toggle('active', t === problemsTab));
      document
        .querySelectorAll('.drawer-pane')
        .forEach(p => p.classList.toggle('active', p === problemsPane));
    }

    const project = this.context.getProject();
    const activeFile = this.context.getActiveFile();

    // Tạo markers gạch chân đỏ trên Monaco
    if (currentModel) {
      const activeFileObj = project.files.find(f => f.name === activeFile);
      const activeFileId = activeFileObj?.id;

      const markers: monaco.editor.IMarkerData[] = errors
        .filter(
          err =>
            !err.loc?.fileId || err.loc.fileId === activeFile || err.loc.fileId === activeFileId,
        )
        .map(err => {
          const line = err.loc?.line ?? 1;
          const col = err.loc?.col ?? 1;
          const lineContent = currentModel.getLineContent(line) || '';
          return {
            startLineNumber: line,
            startColumn: col,
            endLineNumber: line,
            endColumn: Math.max(col + 1, lineContent.length + 1),
            message: err.message,
            severity: 8, // monaco.MarkerSeverity.Error
          };
        });
      this.context.setModelMarkers(currentModel, 'vns-compiler', markers);
    }

    this.problemsList.innerHTML = '';
    errors.forEach((err: CompileError) => {
      const row = document.createElement('div');
      row.className = 'problem-row';
      const line = err.loc?.line ?? 1;
      const col = err.loc?.col ?? 1;
      const matchingFile = project.files.find(
        f => f.id === err.loc?.fileId || f.name === err.loc?.fileId,
      );
      const displayFileName = matchingFile ? matchingFile.name : err.loc?.fileId || activeFile;
      const file = `[${displayFileName}] `;
      row.textContent = `✕ ${file}Line ${line}, Col ${col}: ${err.message}`;
      row.addEventListener('click', () => {
        if (err.loc?.fileId && err.loc.fileId !== activeFile) {
          const matchingName = matchingFile ? matchingFile.name : err.loc.fileId;
          const editor = this.context.getEditorInstance();
          if (editor) {
            this.context.setActiveFile(matchingName);
            const model = this.context.getOrCreateTextModel(
              matchingName,
              this.context.getFileContent(matchingName),
            );
            editor.setModel(model);
            this.context.renderFileList();
          }
        }
        this.jumpToLine(line, col);
      });
      this.problemsList.appendChild(row);
    });
  }

  public renderVariablesWatch(variables?: Map<string, VariableMeta>): void {
    if (variables) {
      this.cachedAstVariables = new Map(variables);
    }

    const combined = new Map<string, VariableMeta>(this.cachedAstVariables);

    if (this.latestLiveState) {
      for (const [varName, val] of Object.entries(this.latestLiveState.variables)) {
        if (!combined.has(varName)) {
          combined.set(varName, { name: varName, value: val, scope: 'global' });
        }
      }
      for (const [varName, val] of Object.entries(this.latestLiveState.localVariables)) {
        const localKey = `${this.latestLiveState.currentScene}.${varName}`;
        if (!combined.has(varName) && !combined.has(localKey)) {
          combined.set(varName, {
            name: varName,
            value: val,
            scope: 'local',
            sceneName: this.latestLiveState.currentScene,
          });
        }
      }
    }

    const activeSceneName = this.getActiveSceneName();

    if (this.varsSceneFilterSelect) {
      const optActive = this.varsSceneFilterSelect.querySelector('option[value="__active__"]');
      if (optActive) {
        optActive.textContent = `🎯 Active Scene (${activeSceneName})`;
      }
    }

    // Lọc biến theo filterMode
    const filtered = new Map<string, VariableMeta>();
    for (const [key, meta] of combined) {
      if (meta.scope === 'global') {
        filtered.set(key, meta);
      } else if (this.filterMode === '__all__') {
        filtered.set(key, meta);
      } else if (this.filterMode === '__active__') {
        if (!meta.sceneName || meta.sceneName === activeSceneName) {
          filtered.set(key, meta);
        }
      } else {
        if (meta.sceneName === this.filterMode) {
          filtered.set(key, meta);
        }
      }
    }

    if (this.varsCountBadge) {
      const count = filtered.size;
      this.varsCountBadge.textContent = `${count} variable${count === 1 ? '' : 's'}`;
    }

    this.varsWatchTbody.innerHTML = '';
    if (filtered.size === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.color = '#666';
      td.textContent = 'No variables for selected scope.';
      tr.appendChild(td);
      this.varsWatchTbody.appendChild(tr);
      return;
    }

    for (const [, meta] of filtered) {
      const tr = document.createElement('tr');

      let effectiveValue = meta.value;
      if (this.latestLiveState) {
        if (meta.scope === 'local' && meta.name in this.latestLiveState.localVariables) {
          effectiveValue = this.latestLiveState.localVariables[meta.name];
        } else if (meta.name in this.latestLiveState.variables) {
          effectiveValue = this.latestLiveState.variables[meta.name];
        }
      }

      const prevVal = this.previousValues.get(meta.name);
      const isChanged = prevVal !== undefined && prevVal !== effectiveValue;
      this.previousValues.set(meta.name, effectiveValue);
      if (isChanged) {
        this.changedTimestamps.set(meta.name, Date.now());
      }

      const flashAge = Date.now() - (this.changedTimestamps.get(meta.name) ?? 0);
      if (flashAge < 1500) {
        tr.classList.add('var-row-changed');
      }

      const tdName = document.createElement('td');
      tdName.style.fontWeight = '600';
      tdName.style.color = '#fff';
      tdName.textContent = meta.name;

      const tdScope = document.createElement('td');
      tdScope.style.color = meta.scope === 'global' ? '#4ade80' : '#60a5fa';
      if (meta.scope === 'global') {
        tdScope.textContent = 'Global';
      } else {
        const sceneLabel = meta.sceneName || 'scene';
        const isCurrentActive = meta.sceneName === activeSceneName;
        if (isCurrentActive) {
          tdScope.textContent = `Local (${sceneLabel})`;
        } else {
          tdScope.innerHTML = `<span>Local (${sceneLabel})</span> <span class="scope-inactive-pill" title="This scene is not active in VM right now">Inactive</span>`;
        }
      }

      const tdType = document.createElement('td');
      tdType.style.color = '#888';
      tdType.textContent = typeof effectiveValue;

      const tdVal = document.createElement('td');
      tdVal.className = 'var-val-cell';
      tdVal.style.color = '#22c55e';
      tdVal.style.cursor = 'pointer';
      tdVal.title = 'Double-click or click edit icon to change value';

      const valSpan = document.createElement('span');
      valSpan.className = 'var-val-text';
      valSpan.textContent = String(effectiveValue);

      const editIcon = document.createElement('span');
      editIcon.className = 'var-edit-icon';
      editIcon.title = 'Edit variable value';
      editIcon.textContent = ' ✎';
      editIcon.style.opacity = '0.7';
      editIcon.style.fontSize = '12px';
      editIcon.style.marginLeft = '6px';
      editIcon.style.cursor = 'pointer';

      tdVal.appendChild(valSpan);
      tdVal.appendChild(editIcon);

      const startEditing = () => {
        if (tdVal.querySelector('input')) return;

        const currentText = String(effectiveValue ?? '');
        tdVal.innerHTML = '';

        const input = document.createElement('input');
        input.className = 'var-inline-input';
        input.value = currentText;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '2px 6px';
        input.style.background = '#0f172a';
        input.style.color = '#22c55e';
        input.style.border = '1px solid #38bdf8';
        input.style.borderRadius = '3px';
        input.style.fontFamily = 'monospace';

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const raw = input.value.trim();
          let parsed: string | number | boolean = raw;
          if (raw.toLowerCase() === 'true') {
            parsed = true;
          } else if (raw.toLowerCase() === 'false') {
            parsed = false;
          } else if (!isNaN(Number(raw)) && raw !== '') {
            parsed = Number(raw);
          } else if (
            (raw.startsWith('"') && raw.endsWith('"')) ||
            (raw.startsWith("'") && raw.endsWith("'"))
          ) {
            parsed = raw.slice(1, -1);
          }
          this.onVariableChange?.(meta.name, parsed, meta.scope);
          tdVal.innerHTML = '';
          const newSpan = document.createElement('span');
          newSpan.className = 'var-val-text';
          newSpan.textContent = String(parsed);
          const newIcon = document.createElement('span');
          newIcon.className = 'var-edit-icon';
          newIcon.title = 'Edit variable value';
          newIcon.textContent = ' ✎';
          newIcon.style.opacity = '0.7';
          newIcon.style.fontSize = '12px';
          newIcon.style.marginLeft = '6px';
          newIcon.style.cursor = 'pointer';
          newIcon.addEventListener('click', (e: Event) => {
            e?.stopPropagation?.();
            startEditing();
          });
          tdVal.appendChild(newSpan);
          tdVal.appendChild(newIcon);
          this.previousValues.set(meta.name, parsed);
          this.changedTimestamps.set(meta.name, Date.now());
          tr.classList.add('var-row-changed');
        };

        input.addEventListener('keydown', (e: KeyboardEvent | { key: string }) => {
          if (e.key === 'Enter') {
            commit();
          } else if (e.key === 'Escape') {
            committed = true;
            tdVal.innerHTML = '';
            tdVal.appendChild(valSpan);
            tdVal.appendChild(editIcon);
          }
        });

        input.addEventListener('blur', () => {
          commit();
        });

        tdVal.appendChild(input);
        if (typeof input.focus === 'function') {
          input.focus();
        }
      };

      tdVal.addEventListener('click', startEditing);
      tdVal.addEventListener('dblclick', startEditing);
      editIcon.addEventListener('click', (e: Event) => {
        e?.stopPropagation?.();
        startEditing();
      });

      tr.appendChild(tdName);
      tr.appendChild(tdScope);
      tr.appendChild(tdType);
      tr.appendChild(tdVal);
      this.varsWatchTbody.appendChild(tr);
    }
  }

  public jumpToLine(lineNumber: number, col: number = 1): void {
    const editor = this.context.getEditorInstance();
    if (editor) {
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: col });
      editor.focus();
    }
  }
}
