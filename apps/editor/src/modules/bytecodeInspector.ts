// ================================================================
// VN ENGINE STUDIO - BYTECODE & AST INSPECTOR MODULE
// Quản lý hiển thị Bytecode VM Instruction table, AST JSON, Live PC indicator & Source jumping
// ================================================================

import type * as monaco from 'monaco-editor';
import type { Instruction, ProgramAST } from '@vn-engine/shared-types';
import type { StudioContext } from './editorTypes';

export class BytecodeInspector {
  private context: StudioContext;

  // DOM Elements
  private subtabBtnBytecode: HTMLElement | null;
  private subtabBtnAst: HTMLElement | null;
  private bytecodeViewContainer: HTMLElement | null;
  private astViewContainer: HTMLElement | null;
  private bytecodeTbody: HTMLElement | null;
  private searchInput: HTMLInputElement | null;
  private sceneSelect: HTMLSelectElement | null;
  private countBadge: HTMLElement | null;
  private btnJumpPc: HTMLElement | null;
  private btnCopyAst: HTMLElement | null;
  private outOfDateAlert: HTMLElement | null;
  private astMonacoContainer: HTMLElement | null;

  // State
  private program: Instruction[] = [];
  private ast: ProgramAST | null = null;
  private currentActivePc: number | null = null;
  private searchQuery: string = '';
  private selectedScene: string = '__all__';
  private astJsonString: string = '';
  private astEditor: monaco.editor.IStandaloneCodeEditor | null = null;

  constructor(context: StudioContext) {
    this.context = context;

    this.subtabBtnBytecode = document.getElementById('subtab-btn-bytecode');
    this.subtabBtnAst = document.getElementById('subtab-btn-ast');
    this.bytecodeViewContainer = document.getElementById('bytecode-view-container');
    this.astViewContainer = document.getElementById('ast-view-container');
    this.bytecodeTbody = document.getElementById('bytecode-tbody');
    this.searchInput = document.getElementById('bytecode-search-input') as HTMLInputElement | null;
    this.sceneSelect = document.getElementById('bytecode-scene-select') as HTMLSelectElement | null;
    this.countBadge = document.getElementById('bytecode-count-badge');
    this.btnJumpPc = document.getElementById('btn-jump-current-pc');
    this.btnCopyAst = document.getElementById('btn-copy-ast-json');
    this.outOfDateAlert = document.getElementById('bytecode-out-of-date-alert');
    this.astMonacoContainer = document.getElementById('ast-monaco-container');

    this.setupEvents();
  }

  private setupEvents(): void {
    // 1. Sub-tabs switching
    this.subtabBtnBytecode?.addEventListener('click', () => this.switchSubView('bytecode'));
    this.subtabBtnAst?.addEventListener('click', () => this.switchSubView('ast'));

    // 2. Search
    this.searchInput?.addEventListener('input', () => {
      this.search(this.searchInput?.value || '');
    });

    // 3. Scene filter
    this.sceneSelect?.addEventListener('change', () => {
      this.filterByScene(this.sceneSelect?.value || '__all__');
    });

    // 4. Jump to current PC
    this.btnJumpPc?.addEventListener('click', () => {
      if (this.currentActivePc !== null) {
        this.jumpToPc(this.currentActivePc);
      }
    });

    // 5. Copy AST JSON
    this.btnCopyAst?.addEventListener('click', async () => {
      if (!this.astJsonString) return;
      try {
        await navigator.clipboard.writeText(this.astJsonString);
        this.context.showToast('✓ AST JSON copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy AST JSON:', err);
      }
    });
  }

  public updateCompiledProgram(program: Instruction[], ast?: ProgramAST): void {
    this.program = program;
    if (ast) {
      this.ast = ast;
      this.astJsonString = JSON.stringify(ast, null, 2);
      this.updateAstEditor();
      this.populateSceneDropdown(ast);
    }

    this.renderBytecodeTable();
  }

  public setOutOfDate(hasErrors: boolean, errorCount: number = 0): void {
    if (!this.outOfDateAlert) return;
    if (hasErrors) {
      this.outOfDateAlert.classList.remove('hidden');
      this.outOfDateAlert.textContent = `⚠ Out of date (${errorCount} error${errorCount === 1 ? '' : 's'} - check Problems tab)`;
    } else {
      this.outOfDateAlert.classList.add('hidden');
    }
  }

  public updateExecutionPointer(pc: number, _currentScene?: string): void {
    this.currentActivePc = pc;

    if (!this.bytecodeTbody) return;

    // Remove active class from old rows
    const oldActive = this.bytecodeTbody.querySelectorAll('.bytecode-row-current');
    oldActive.forEach(el => el.classList.remove('bytecode-row-current'));

    // Find and highlight row with data-pc="pc"
    const allRows = Array.from(this.bytecodeTbody.querySelectorAll<HTMLTableRowElement>('tr'));
    const targetRow = allRows.find(r => r.dataset['pc'] === String(pc));
    if (targetRow) {
      targetRow.classList.add('bytecode-row-current');
    }
  }

  public jumpToPc(pc: number): void {
    const allRows = Array.from(
      this.bytecodeTbody?.querySelectorAll<HTMLTableRowElement>('tr') || [],
    );
    const targetRow = allRows.find(r => r.dataset['pc'] === String(pc));
    if (targetRow && typeof (targetRow as HTMLElement).scrollIntoView === 'function') {
      (targetRow as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  public search(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    this.applyVisibilityFilters();
  }

  public filterByScene(sceneName: string): void {
    this.selectedScene = sceneName;
    this.applyVisibilityFilters();
  }

  public switchSubView(view: 'bytecode' | 'ast'): void {
    if (view === 'bytecode') {
      this.subtabBtnBytecode?.classList.add('active');
      this.subtabBtnAst?.classList.remove('active');
      this.bytecodeViewContainer?.classList.remove('hidden');
      this.astViewContainer?.classList.add('hidden');
    } else {
      this.subtabBtnBytecode?.classList.remove('active');
      this.subtabBtnAst?.classList.add('active');
      this.bytecodeViewContainer?.classList.add('hidden');
      this.astViewContainer?.classList.remove('hidden');

      if (!this.astEditor && this.astMonacoContainer) {
        this.initAstEditor();
      } else if (this.astEditor) {
        this.astEditor.layout();
      }
    }
  }

  private populateSceneDropdown(ast: ProgramAST): void {
    if (!this.sceneSelect) return;
    const currentVal = this.sceneSelect.value;
    this.sceneSelect.innerHTML = '';

    const optAll = document.createElement('option');
    optAll.value = '__all__';
    optAll.textContent = 'All Scenes (Toàn bộ)';
    this.sceneSelect.appendChild(optAll);

    if (Array.isArray(ast.scenes)) {
      for (const sc of ast.scenes) {
        if (sc?.name) {
          const opt = document.createElement('option');
          opt.value = sc.name;
          opt.textContent = `Scene: ${sc.name}`;
          this.sceneSelect.appendChild(opt);
        }
      }
    }

    if (currentVal) {
      this.sceneSelect.value = currentVal;
    }
  }

  public getAst(): ProgramAST | null {
    return this.ast;
  }

  private renderBytecodeTable(): void {
    if (!this.bytecodeTbody) return;
    this.bytecodeTbody.innerHTML = '';

    if (this.countBadge) {
      this.countBadge.textContent = `${this.program.length} instructions`;
    }

    if (this.program.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.color = '#666';
      td.textContent = 'No compiled bytecode instructions.';
      tr.appendChild(td);
      this.bytecodeTbody.appendChild(tr);
      return;
    }

    let currentSceneContext = 'start';

    for (let pc = 0; pc < this.program.length; pc++) {
      const inst = this.program[pc];
      if (!inst) continue;
      if (inst.type === 'SCENE') {
        currentSceneContext = inst.name;
      }

      const tr = document.createElement('tr');
      tr.className = 'bytecode-row';
      tr.dataset['pc'] = String(pc);
      tr.dataset['scene'] = currentSceneContext;
      tr.dataset['opcode'] = inst.type.toLowerCase();

      if (this.currentActivePc === pc) {
        tr.classList.add('bytecode-row-current');
      }

      // Column 1: PC
      const tdPc = document.createElement('td');
      tdPc.className = 'col-pc font-mono';
      const pcFormatted = String(pc).padStart(4, '0');
      const pcIndicator = document.createElement('span');
      pcIndicator.className = 'pc-indicator';
      const pcNum = document.createElement('span');
      pcNum.className = 'pc-num';
      pcNum.textContent = pcFormatted;
      tdPc.appendChild(pcIndicator);
      tdPc.appendChild(pcNum);

      // Column 2: Opcode
      const tdOpcode = document.createElement('td');
      tdOpcode.className = 'col-opcode';
      const opcodePill = document.createElement('span');
      opcodePill.className = `bytecode-opcode-pill opcode-${this.getOpcodeCategory(inst.type)}`;
      opcodePill.textContent = inst.type;
      tdOpcode.appendChild(opcodePill);

      // Column 3: Payload / Arguments
      const tdPayload = document.createElement('td');
      tdPayload.className = 'col-payload font-mono';
      const formattedArgs = this.formatInstructionArgs(inst);
      tdPayload.textContent = formattedArgs;
      tdPayload.title = JSON.stringify(inst, null, 2);

      // Column 4: Source Line (loc)
      const tdLoc = document.createElement('td');
      tdLoc.className = 'col-loc font-mono';
      const file = inst.loc?.fileId || 'main.vns';
      const line = inst.loc?.line ?? 1;
      tdLoc.textContent = `${file}:${line}`;

      // Click to jump to line
      tr.addEventListener('click', () => {
        const targetLine = inst.loc?.line ?? 1;
        const targetCol = inst.loc?.col ?? 1;
        const targetFile = inst.loc?.fileId;

        if (targetFile && targetFile !== this.context.getActiveFile()) {
          this.context.setActiveFile(targetFile);
          const model = this.context.getOrCreateTextModel(
            targetFile,
            this.context.getFileContent(targetFile),
          );
          this.context.getEditorInstance()?.setModel(model);
          this.context.renderFileList();
        }

        const editor = this.context.getEditorInstance();
        if (editor) {
          editor.revealLineInCenter(targetLine);
          editor.setPosition({ lineNumber: targetLine, column: targetCol });
          editor.focus();
        }
      });

      tr.appendChild(tdPc);
      tr.appendChild(tdOpcode);
      tr.appendChild(tdPayload);
      tr.appendChild(tdLoc);

      this.bytecodeTbody.appendChild(tr);
    }

    this.applyVisibilityFilters();
  }

  private applyVisibilityFilters(): void {
    if (!this.bytecodeTbody) return;
    const rows = this.bytecodeTbody.querySelectorAll('tr');

    let visibleCount = 0;

    rows.forEach(r => {
      const pc = r.dataset['pc'] || '';
      const scene = r.dataset['scene'] || '';
      const opcode = r.dataset['opcode'] || '';
      const text = r.textContent?.toLowerCase() || '';

      const matchesScene = this.selectedScene === '__all__' || scene === this.selectedScene;
      const matchesSearch =
        !this.searchQuery ||
        pc.includes(this.searchQuery) ||
        opcode.includes(this.searchQuery) ||
        text.includes(this.searchQuery);

      if (matchesScene && matchesSearch) {
        r.classList.remove('hidden');
        visibleCount++;
      } else {
        r.classList.add('hidden');
      }
    });

    if (this.countBadge) {
      if (this.selectedScene !== '__all__' || this.searchQuery) {
        this.countBadge.textContent = `${visibleCount} of ${this.program.length} instructions`;
      } else {
        this.countBadge.textContent = `${this.program.length} instructions`;
      }
    }
  }

  private getOpcodeCategory(type: string): string {
    switch (type) {
      case 'GOTO':
      case 'CONDITIONAL_GOTO':
      case 'CALL':
      case 'RETURN':
      case 'LOOP_START':
      case 'LOOP_END':
      case 'HALT':
      case 'SCENE':
      case 'SCENE_END':
      case 'LABEL':
        return 'flow';
      case 'DIALOGUE':
      case 'REVEAL':
      case 'HIDE_DIALOGUE':
        return 'dialogue';
      case 'SHOW':
      case 'HIDE':
      case 'BACKGROUND':
      case 'INSPECT_BEGIN':
      case 'INSPECT_END':
        return 'visual';
      case 'PLAY':
      case 'STOP':
        return 'audio';
      case 'ASSIGN':
        return 'state';
      case 'CHOICE':
        return 'choice';
      default:
        return 'default';
    }
  }

  private formatInstructionArgs(inst: Instruction): string {
    switch (inst.type) {
      case 'DIALOGUE':
        return inst.character ? `${inst.character}: "${inst.text}"` : `"${inst.text}"`;
      case 'SHOW': {
        const posStr =
          typeof inst.position === 'object'
            ? `(${inst.position.x}, ${inst.position.y ?? 1})`
            : inst.position || 'center';
        return `${inst.character}.${inst.sprite} @ ${posStr}`;
      }
      case 'HIDE':
        return `${inst.character}`;
      case 'HIDE_DIALOGUE':
        return `(hide dialogue box)`;
      case 'BACKGROUND':
        return `${inst.assetId}`;
      case 'PLAY':
        return `[${inst.channel}] ${inst.assetId}${inst.volume !== undefined ? ` (vol: ${inst.volume})` : ''}${inst.loop ? ' (loop)' : ''}`;
      case 'STOP':
        return `[${inst.channel}]`;
      case 'CHOICE':
        return inst.choices.map(c => `"${c.text}" -> ${c.targetScene}`).join(' | ');
      case 'GOTO':
        return `goto ${inst.targetScene}`;
      case 'CONDITIONAL_GOTO':
        return `if condition goto ${inst.targetScene}`;
      case 'CALL':
        return `call ${inst.targetScene}`;
      case 'RETURN':
        return `return`;
      case 'ASSIGN':
        return `${inst.variable} = ${this.formatExpr(inst.value)}`;
      case 'SCENE':
        return `scene ${inst.name}`;
      case 'SCENE_END':
        return `end scene ${inst.sceneName}`;
      case 'WAIT':
        return `wait ${inst.duration}s`;
      case 'HALT':
        return `halt`;
      case 'LABEL':
        return `label ${inst.name}`;
      case 'RUN_SCRIPT':
        return `run script ${inst.screenId}`;
      case 'SPAWN_SCRIPT':
        return `spawn script ${inst.screenId}`;
      case 'INSPECT_BEGIN':
        return `inspect ${inst.assetId}${inst.title ? ` "${inst.title}"` : ''}`;
      case 'INSPECT_END':
        return `inspect end`;
      case 'REVEAL':
        return `reveal ${inst.characterId} as "${inst.displayName}"`;
      case 'LOOP_START':
        return `loop start -> ${inst.loopEndTargetScene}`;
      case 'LOOP_END':
        return `loop end -> ${inst.loopStartTargetScene}`;
      default:
        return JSON.stringify(inst);
    }
  }

  private formatExpr(expr: unknown): string {
    if (!expr || typeof expr !== 'object') return String(expr);
    const e = expr as Record<string, unknown>;
    if (e.type === 'Literal') return String(e.value);
    if (e.type === 'Identifier') return String(e.name);
    if (e.type === 'BinaryExpression') {
      return `${this.formatExpr(e.left)} ${e.operator} ${this.formatExpr(e.right)}`;
    }
    return JSON.stringify(expr);
  }

  private async initAstEditor(): Promise<void> {
    if (!this.astMonacoContainer) return;

    try {
      const winWithMonaco =
        typeof window !== 'undefined'
          ? (window as unknown as { monaco?: typeof monaco })
          : undefined;
      const monacoModule = winWithMonaco?.monaco ?? (await import('monaco-editor'));

      if (!monacoModule?.editor) return;

      this.astEditor = monacoModule.editor.create(this.astMonacoContainer, {
        value: this.astJsonString,
        language: 'json',
        theme: 'vns-wireframe-dark',
        readOnly: true,
        fontSize: 12,
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        lineHeight: 20,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        folding: true,
      });
    } catch (err) {
      console.warn('[BytecodeInspector] Could not initialize Monaco for AST viewer:', err);
    }
  }

  private updateAstEditor(): void {
    if (this.astEditor) {
      this.astEditor.setValue(this.astJsonString);
    }
  }
}
