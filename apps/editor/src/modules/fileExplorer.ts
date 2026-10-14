// ================================================================
// VN ENGINE STUDIO - FILE EXPLORER MODULE
// Quản lý danh sách tệp kịch bản (.vns), tạo mới, đổi tên inline & xóa
// ================================================================

import type { StudioContext } from './editorTypes';

/**
 * Sinh tên file mặc định tự tăng số kiểu Windows (New Script.vns, New Script (2).vns, ...)
 */
export function generateDefaultScriptName(existingNames: string[]): string {
  const base = 'New Script';
  let candidate = `${base}.vns`;
  let counter = 2;
  const set = new Set(existingNames);
  while (set.has(candidate)) {
    candidate = `${base} (${counter}).vns`;
    counter++;
  }
  return candidate;
}

/**
 * Kiểm tra tính hợp lệ của tên tệp kịch bản
 */
export function validateFileName(
  name: string,
  existingNames: string[],
): { valid: boolean; error?: string; normalizedName?: string } {
  let rawName = name.trim();
  if (!rawName) {
    return { valid: false, error: 'File name cannot be empty.' };
  }

  if (!rawName.endsWith('.vns')) {
    rawName += '.vns';
  }

  // Check forbidden characters: \ / : * ? " < > |
  if (/[\\/:*?"<>|]/.test(rawName)) {
    return {
      valid: false,
      error: 'File name cannot contain characters: \\ / : * ? " < > |',
    };
  }

  if (existingNames.includes(rawName)) {
    return {
      valid: false,
      error: `File "${rawName}" already exists!`,
    };
  }

  return { valid: true, normalizedName: rawName };
}

export class FileExplorer {
  private context: StudioContext;
  private fileListEl: HTMLElement;
  private btnAddFile: HTMLElement;
  private activeFilenameEl: HTMLElement;

  constructor(context: StudioContext) {
    this.context = context;
    this.fileListEl = document.getElementById('file-list')!;
    this.btnAddFile = document.getElementById('btn-add-file')!;
    this.activeFilenameEl = document.getElementById('active-filename')!;

    this.btnAddFile?.addEventListener('click', () => {
      this.addNewFile();
    });
  }

  public renderFileList(): void {
    this.fileListEl.innerHTML = '';
    const project = this.context.getProject();
    const activeFile = this.context.getActiveFile();

    project.files.forEach(file => {
      const fileName = file.name;
      const li = document.createElement('li');
      li.className = `file-item ${fileName === activeFile ? 'active' : ''}`;
      li.dataset.filename = fileName;

      const nameGroup = document.createElement('div');
      nameGroup.className = 'file-name-group';
      nameGroup.innerHTML = `<span class="file-icon">📄</span> <span class="file-name-text"></span>`;
      const nameSpan = nameGroup.querySelector('.file-name-text') as HTMLSpanElement;
      nameSpan.textContent = fileName;
      li.appendChild(nameGroup);

      if (fileName !== 'main.vns') {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-file-delete';
        btnDel.innerHTML = '✕';
        btnDel.title = `Delete file ${fileName}`;
        btnDel.addEventListener('click', e => {
          e.stopPropagation();
          this.deleteFile(fileName);
        });
        li.appendChild(btnDel);
      }

      li.addEventListener('click', () => {
        this.switchActiveFile(fileName);
      });

      // Double click to rename file
      li.addEventListener('dblclick', e => {
        e.stopPropagation();
        this.startRenameFile(fileName, li);
      });

      this.fileListEl.appendChild(li);
    });

    this.activeFilenameEl.textContent = activeFile;
  }

  public switchActiveFile(fileName: string): void {
    const activeFile = this.context.getActiveFile();
    if (activeFile === fileName) return;
    const project = this.context.getProject();
    const fileExists = project.files.some(f => f.name === fileName);
    if (!fileExists) return;

    // Flush any pending debounce changes
    this.context.flushEditorChanges();

    // Switch activeFile
    this.context.setActiveFile(fileName);

    // Switch Monaco model
    const targetModel = this.context.getOrCreateTextModel(
      fileName,
      this.context.getFileContent(fileName),
    );
    const editor = this.context.getEditorInstance();
    if (editor) {
      editor.setModel(targetModel);
    }
    this.activeFilenameEl.textContent = fileName;

    this.renderFileList();
    this.context.showToast(`Opening: ${fileName}`);
    this.context.compileCurrentScript();
  }

  /**
   * Tạo tệp mới kiểu Windows Explorer: tạo dòng inline, tự bôi đen phần tên (trừ .vns),
   * Enter/blur để lưu, Escape để hủy.
   */
  public addNewFile(): void {
    const existingInput = this.fileListEl.querySelector(
      '.file-rename-input',
    ) as HTMLInputElement | null;
    if (existingInput) {
      existingInput.focus();
      return;
    }

    const project = this.context.getProject();
    const existingNames = project.files.map(f => f.name);
    const defaultName = generateDefaultScriptName(existingNames);

    const li = document.createElement('li');
    li.className = 'file-item file-item-editing';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-rename-input';
    input.value = defaultName;
    input.spellcheck = false;

    li.appendChild(input);
    this.fileListEl.appendChild(li);

    // Select name portion excluding .vns extension
    const dotIndex = defaultName.lastIndexOf('.');
    const selectEnd = dotIndex !== -1 ? dotIndex : defaultName.length;
    input.focus();
    input.setSelectionRange(0, selectEnd);

    let isHandled = false;

    const commitCreation = () => {
      if (isHandled) return;
      isHandled = true;

      const validation = validateFileName(input.value, existingNames);
      if (!validation.valid) {
        if (validation.error) {
          this.context.showToast(validation.error);
        }
        li.remove();
        return;
      }

      const newFileName = validation.normalizedName!;
      this.context.flushEditorChanges();

      this.context.setFileContent(newFileName, '');
      const model = this.context.getOrCreateTextModel(newFileName, '');

      this.context.setActiveFile(newFileName);
      const editor = this.context.getEditorInstance();
      if (editor) {
        editor.setModel(model);
      }
      this.activeFilenameEl.textContent = newFileName;

      void this.context.saveProjectToStorage();
      this.renderFileList();
      this.context.compileCurrentScript();
      this.context.showToast(`Created new file: ${newFileName}`);
    };

    const cancelCreation = () => {
      if (isHandled) return;
      isHandled = true;
      li.remove();
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCreation();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCreation();
      }
    });

    input.addEventListener('blur', () => {
      commitCreation();
    });
  }

  /**
   * Đổi tên tệp inline chuẩn Windows Explorer (Enter/blur để lưu, Escape để hủy)
   */
  public startRenameFile(oldFileName: string, liElement: HTMLElement): void {
    if (liElement.querySelector('.file-rename-input')) return;

    this.context.flushEditorChanges();

    liElement.innerHTML = '';
    liElement.classList.add('file-item-editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-rename-input';
    input.value = oldFileName;
    input.spellcheck = false;

    liElement.appendChild(input);

    const dotIndex = oldFileName.lastIndexOf('.');
    const selectEnd = dotIndex !== -1 ? dotIndex : oldFileName.length;
    input.focus();
    input.setSelectionRange(0, selectEnd);

    let isHandled = false;

    const commitRename = () => {
      if (isHandled) return;
      isHandled = true;

      let newName = input.value.trim();
      if (!newName) {
        this.renderFileList();
        return;
      }

      if (!newName.endsWith('.vns')) {
        newName += '.vns';
      }

      if (newName === oldFileName) {
        this.renderFileList();
        return;
      }

      const project = this.context.getProject();
      const existingNames = project.files.map(f => f.name).filter(n => n !== oldFileName);
      const validation = validateFileName(newName, existingNames);
      if (!validation.valid) {
        if (validation.error) {
          this.context.showToast(validation.error);
        }
        this.renderFileList();
        return;
      }

      const validatedName = validation.normalizedName!;

      // Rename in files list
      const content = this.context.getFileContent(oldFileName);
      this.context.renameFileKey(oldFileName, validatedName);

      this.context.disposeTextModel(oldFileName);
      const newModel = this.context.getOrCreateTextModel(validatedName, content);

      const activeFile = this.context.getActiveFile();
      if (activeFile === oldFileName) {
        this.context.setActiveFile(validatedName);
        const editor = this.context.getEditorInstance();
        if (editor) {
          editor.setModel(newModel);
        }
        this.activeFilenameEl.textContent = validatedName;
      }

      void this.context.saveProjectToStorage();
      this.renderFileList();
      this.context.compileCurrentScript();
      this.context.showToast(`Renamed: ${oldFileName} → ${validatedName}`);
    };

    const cancelRename = () => {
      if (isHandled) return;
      isHandled = true;
      this.renderFileList();
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    });

    input.addEventListener('blur', () => {
      commitRename();
    });
  }

  public deleteFile(fileName: string): void {
    if (fileName === 'main.vns') {
      this.context.showToast('Cannot delete root file main.vns!');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete file "${fileName}"?`)) return;

    const activeFile = this.context.getActiveFile();
    const wasActive = activeFile === fileName;

    // 1. Remove from files list
    this.context.removeFile(fileName);

    // 2. Dispose Monaco model
    this.context.disposeTextModel(fileName);

    // 3. Fallback if active
    if (wasActive) {
      const project = this.context.getProject();
      const fallbackFile = project.files[0]?.name ?? 'main.vns';
      this.context.setActiveFile(fallbackFile);

      const fallbackModel = this.context.getOrCreateTextModel(
        fallbackFile,
        this.context.getFileContent(fallbackFile),
      );
      const editor = this.context.getEditorInstance();
      if (editor) {
        editor.setModel(fallbackModel);
      }
      this.activeFilenameEl.textContent = fallbackFile;
    }

    void this.context.saveProjectToStorage();
    this.renderFileList();
    this.context.compileCurrentScript();
    this.context.showToast(`Deleted file: ${fileName}`);
  }
}
