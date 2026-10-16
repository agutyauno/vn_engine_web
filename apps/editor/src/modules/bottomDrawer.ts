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

  private cachedAstVariables: Map<string, VariableMeta> = new Map();
  private latestLiveState: PreviewStateUpdateMessage | null = null;
  private previousValues: Map<string, unknown> = new Map();
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

    this.setupBottomDrawer();
  }

  public setOnVariableChange(
    cb: (name: string, value: string | number | boolean, scope?: 'global' | 'local') => void,
  ): void {
    this.onVariableChange = cb;
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
          p.classList.toggle('active', p.id === `drawer-pane-${targetTab}`);
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

    this.varsWatchTbody.innerHTML = '';
    if (combined.size === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.color = '#666';
      td.textContent = 'No variables.';
      tr.appendChild(td);
      this.varsWatchTbody.appendChild(tr);
      return;
    }

    for (const [, meta] of combined) {
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
        tr.classList.add('var-row-changed');
      }

      const tdName = document.createElement('td');
      tdName.style.fontWeight = '600';
      tdName.style.color = '#fff';
      tdName.textContent = meta.name;

      const tdScope = document.createElement('td');
      tdScope.style.color = meta.scope === 'global' ? '#4ade80' : '#60a5fa';
      tdScope.textContent =
        meta.scope === 'global' ? 'Global' : `Local (${meta.sceneName || 'scene'})`;

      const tdType = document.createElement('td');
      tdType.style.color = '#888';
      tdType.textContent = typeof effectiveValue;

      const tdVal = document.createElement('td');
      tdVal.className = 'var-val-cell';
      tdVal.style.color = '#22c55e';
      tdVal.style.cursor = 'pointer';
      tdVal.title = 'Click to edit value';
      tdVal.textContent = String(effectiveValue);

      tdVal.addEventListener('click', () => {
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
          }
          this.onVariableChange?.(meta.name, parsed, meta.scope);
          tdVal.innerHTML = '';
          tdVal.textContent = String(parsed);
          this.previousValues.set(meta.name, parsed);
        };

        input.addEventListener('keydown', (e: KeyboardEvent | { key: string }) => {
          if (e.key === 'Enter') {
            commit();
          } else if (e.key === 'Escape') {
            committed = true;
            tdVal.innerHTML = '';
            tdVal.textContent = currentText;
          }
        });

        input.addEventListener('blur', () => {
          commit();
        });

        tdVal.appendChild(input);
        if (typeof input.focus === 'function') {
          input.focus();
        }
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
