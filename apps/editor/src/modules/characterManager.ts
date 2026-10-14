// ================================================================
// VN ENGINE STUDIO - CHARACTER MANAGER MODULE
// Quản lý danh sách nhân vật, Modal biểu cảm (sprites), bảng màu & reconciliation
// ================================================================

import type { Character } from '@vn-engine/shared-types';
import type { StudioContext } from './editorTypes';

export class CharacterManager {
  private context: StudioContext;

  private charContainer: HTMLElement | null;
  private btnAddCharacter: HTMLElement | null;
  private charReconciliationEl: HTMLElement | null;
  private modalCharForm: HTMLElement | null;
  private formCharacter: HTMLFormElement | null;

  // Trạng thái danh sách biểu cảm trong modal nhân vật
  private modalSpriteRows: { name: string; imageDataUrl: string }[] = [];

  constructor(context: StudioContext) {
    this.context = context;
    this.charContainer = document.getElementById('character-list-container');
    this.btnAddCharacter = document.getElementById('btn-add-character');
    this.charReconciliationEl = document.getElementById('char-reconciliation-alerts');
    this.modalCharForm = document.getElementById('modal-character-form');
    this.formCharacter = document.getElementById('form-character') as HTMLFormElement | null;

    this.setupCharacterManagement();
  }

  private setupCharacterManagement(): void {
    if (this.btnAddCharacter) {
      this.btnAddCharacter.addEventListener('click', () => {
        this.openCharacterModal();
      });
    }

    const btnClose = document.getElementById('btn-close-char-modal');
    const btnCancel = document.getElementById('btn-cancel-char-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeCharacterModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeCharacterModal());

    // Color controls: hex input, color picker, sample preview tag
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;
    const previewTag = document.getElementById('char-color-preview-tag');
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement | null;

    const updateColorState = (hex: string) => {
      let normalized = hex.trim();
      if (!normalized.startsWith('#')) {
        normalized = '#' + normalized;
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(normalized) || /^#[0-9A-Fa-f]{3}$/.test(normalized)) {
        if (colorInput) {
          colorInput.value =
            normalized.length === 4
              ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
              : normalized;
        }
        if (previewTag) {
          previewTag.style.color = normalized;
          previewTag.style.borderColor = normalized;
        }
      }
    };

    if (hexInput) {
      hexInput.addEventListener('input', () => {
        updateColorState(hexInput.value);
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        const val = colorInput.value.toUpperCase();
        if (hexInput) hexInput.value = val;
        if (previewTag) {
          previewTag.style.color = val;
          previewTag.style.borderColor = val;
        }
      });
    }

    // Color preset buttons
    const colorPresets = document.querySelectorAll('.color-preset-btn');
    colorPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        if (color) {
          if (hexInput) hexInput.value = color.toUpperCase();
          if (colorInput) colorInput.value = color;
          if (previewTag) {
            previewTag.style.color = color;
            previewTag.style.borderColor = color;
          }
        }
      });
    });

    if (nameInput && previewTag) {
      nameInput.addEventListener('input', () => {
        previewTag.textContent = nameInput.value.trim() || 'Display Name';
      });
    }

    // Button thêm biểu cảm trong modal
    const btnAddSpriteRow = document.getElementById('btn-add-sprite-row');
    if (btnAddSpriteRow) {
      btnAddSpriteRow.addEventListener('click', () => {
        this.addModalSpriteRow();
      });
    }

    if (this.formCharacter) {
      this.formCharacter.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.saveCharacterFromModal();
      });
    }
  }

  public renderCharacterList(): void {
    if (!this.charContainer) return;
    this.charContainer.innerHTML = '';

    const project = this.context.getProject();
    const chars: Character[] = project.characters || [];
    if (chars.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-meta-hint';
      hint.textContent =
        'No characters in project yet. Click "+ Add Character" above to create the first character.';
      this.charContainer.appendChild(hint);
      return;
    }

    for (const char of chars) {
      const card = document.createElement('div');
      card.className = 'character-card';

      // Header row
      const header = document.createElement('div');
      header.className = 'character-card-header';

      const identity = document.createElement('div');
      identity.className = 'character-identity';

      const dot = document.createElement('span');
      dot.className = 'char-badge-dot';
      dot.style.backgroundColor = char.colorHex || '#38bdf8';

      const idSpan = document.createElement('span');
      idSpan.className = 'character-id-text';
      idSpan.textContent = char.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'character-name-text';
      nameSpan.textContent = char.name ? `(${char.name})` : '';

      const hexBadge = document.createElement('span');
      hexBadge.style.fontFamily = 'var(--vn-font-mono)';
      hexBadge.style.fontSize = '9px';
      hexBadge.style.color = char.colorHex || '#38bdf8';
      hexBadge.style.border = `1px solid ${char.colorHex || '#38bdf8'}`;
      hexBadge.style.padding = '0 3px';
      hexBadge.style.marginLeft = '4px';
      hexBadge.textContent = (char.colorHex || '#38bdf8').toUpperCase();

      identity.appendChild(dot);
      identity.appendChild(idSpan);
      if (char.name) identity.appendChild(nameSpan);
      identity.appendChild(hexBadge);

      const actions = document.createElement('div');
      actions.className = 'meta-card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-card-action';
      btnEdit.title = `Edit character ${char.id}`;
      btnEdit.textContent = '✎ Edit';
      btnEdit.addEventListener('click', () => {
        this.openCharacterModal(char.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-card-action btn-card-delete';
      btnDel.title = `Delete character ${char.id}`;
      btnDel.textContent = '✕ Delete';
      btnDel.addEventListener('click', () => {
        this.deleteCharacter(char.id);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      header.appendChild(identity);
      header.appendChild(actions);
      card.appendChild(header);

      // Sprites section
      const spritesSection = document.createElement('div');
      spritesSection.className = 'char-sprites-section';

      const label = document.createElement('span');
      label.className = 'sprites-label';
      label.textContent = 'Expressions (Sprites):';
      spritesSection.appendChild(label);

      const spritesList = document.createElement('div');
      spritesList.className = 'meta-tags-list';

      const spriteKeys = Object.keys(char.sprites || {});
      if (spriteKeys.length === 0) {
        const noSp = document.createElement('span');
        noSp.style.fontSize = '10px';
        noSp.style.color = '#666';
        noSp.textContent = '(No sprites yet) ';
        spritesList.appendChild(noSp);
      } else {
        for (const sp of spriteKeys) {
          const pill = document.createElement('span');
          pill.className = 'sprite-pill';

          const imgData = char.sprites?.[sp];
          if (imgData && imgData.trim().length > 0) {
            const thumb = document.createElement('img');
            thumb.className = 'sprite-pill-thumb';
            thumb.src = imgData;
            thumb.alt = sp;
            pill.appendChild(thumb);
          }

          const spName = document.createElement('span');
          spName.textContent = sp;

          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn-remove-sprite';
          removeBtn.title = `Delete expression ${sp}`;
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.removeCharacterSprite(char.id, sp);
          });

          pill.appendChild(spName);
          pill.appendChild(removeBtn);
          spritesList.appendChild(pill);
        }
      }

      // Add sprite button
      const btnAddSprite = document.createElement('button');
      btnAddSprite.className = 'btn-add-sprite-inline';
      btnAddSprite.textContent = '+ Add sprite';
      btnAddSprite.addEventListener('click', () => {
        const spName = window.prompt(
          `Enter new sprite/expression name for character "${char.id}":`,
        );
        if (spName && spName.trim()) {
          this.addCharacterSprite(char.id, spName.trim());
        }
      });
      spritesList.appendChild(btnAddSprite);

      spritesSection.appendChild(spritesList);

      // Reconciliation check: Does script use sprites not declared?
      const astMetadata = this.context.getCachedAstMetadata();
      const astCharInfo = astMetadata.characters.get(char.id);
      if (astCharInfo && astCharInfo.sprites) {
        const missingSprites: string[] = [];
        for (const usedSp of astCharInfo.sprites) {
          if (!usedSp || usedSp === 'default') continue;
          if (!char.sprites || !(usedSp in char.sprites)) {
            missingSprites.push(usedSp);
          }
        }
        if (missingSprites.length > 0) {
          const warningEl = document.createElement('div');
          warningEl.style.marginTop = '4px';
          warningEl.style.fontSize = '10px';
          warningEl.style.color = '#facc15';
          warningEl.textContent = `⚠️ Script calls: ${missingSprites.join(', ')} (not in catalog)`;
          spritesSection.appendChild(warningEl);
        }
      }

      card.appendChild(spritesSection);
      this.charContainer.appendChild(card);
    }
  }

  public reconcileCharactersWithScript(
    astCharacters: Map<string, { displayName?: string; sprites: Set<string> }>,
  ): void {
    if (!this.charReconciliationEl) return;
    this.charReconciliationEl.innerHTML = '';

    const project = this.context.getProject();
    const declaredIds = new Set((project.characters || []).map(c => c.id));
    const assetNames = new Set((project.assets || []).map(a => a.name.toLowerCase()));
    const assetIds = new Set((project.assets || []).map(a => a.id.toLowerCase()));

    for (const [charId, info] of astCharacters) {
      if (assetNames.has(charId.toLowerCase()) || assetIds.has(charId.toLowerCase())) {
        // Đạo cụ sân khấu hoặc vật phẩm (Stage Prop / Item), không phải nhân vật thiếu khai báo
        continue;
      }
      if (!declaredIds.has(charId)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Character "${charId}" not declared in project`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = info.displayName
          ? `Script uses "${charId}" (${info.displayName}) but it is not added in the Characters tab.`
          : `Script uses "${charId}:" or "show ${charId}" but it is not added in the Characters tab.`;

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';
        btnGroup.style.marginTop = '6px';

        const btnQuick = document.createElement('button');
        btnQuick.className = 'reconciliation-alert-btn';
        btnQuick.textContent = `+ Quick Add (Default Color)`;
        btnQuick.addEventListener('click', () => {
          this.quickAddCharacter(charId, info.displayName);
        });

        const btnCustom = document.createElement('button');
        btnCustom.className = 'reconciliation-alert-btn';
        btnCustom.style.background = 'transparent';
        btnCustom.style.border = '1px solid var(--studio-border)';
        btnCustom.textContent = `✎ Customise`;
        btnCustom.addEventListener('click', () => {
          this.openCharacterModal(undefined, charId, info.displayName);
        });

        btnGroup.appendChild(btnQuick);
        btnGroup.appendChild(btnCustom);

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btnGroup);
        this.charReconciliationEl.appendChild(alertCard);
      }
    }
  }

  public quickAddCharacter(charId: string, displayName?: string): void {
    const formattedName = displayName || charId.charAt(0).toUpperCase() + charId.slice(1);
    const project = this.context.getProject();
    if (!Array.isArray(project.characters)) {
      project.characters = [];
    }
    if (project.characters.some(c => c.id === charId)) return;

    project.characters.push({
      id: charId,
      name: formattedName,
      colorHex: '#38BDF8',
      sprites: { default: '' },
    });

    void this.context.saveProjectToStorage();
    this.renderCharacterList();
    this.context.compileCurrentScript();
    this.context.showToast(
      `Quick added character "${charId}" (${formattedName}) with default color.`,
    );
  }

  public renderModalSpriteRows(): void {
    const listContainer = document.getElementById('char-sprites-manager-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (this.modalSpriteRows.length === 0) {
      this.modalSpriteRows.push({ name: 'default', imageDataUrl: '' });
    }

    this.modalSpriteRows.forEach((row, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'sprite-manager-row';

      // 1. Ô nhập tên biểu cảm
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'wf-form-input sprite-row-name';
      nameInput.placeholder = idx === 0 ? 'default' : 'sprite name...';
      nameInput.value = row.name;
      nameInput.addEventListener('input', () => {
        row.name = nameInput.value.trim();
      });

      // 2. Hộp xem trước thumbnail
      const thumbBox = document.createElement('div');
      thumbBox.className = 'sprite-row-thumb-box';
      if (row.imageDataUrl) {
        const img = document.createElement('img');
        img.className = 'sprite-row-thumb-img';
        img.src = row.imageDataUrl;
        img.alt = row.name;
        thumbBox.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'sprite-row-thumb-placeholder';
        placeholder.textContent = '🖼';
        thumbBox.appendChild(placeholder);
      }

      // 3. Nút tải ảnh lên từ máy
      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'sprite-upload-btn-label';
      uploadLabel.textContent = row.imageDataUrl ? 'Change' : '📁 Upload';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'hidden';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            row.imageDataUrl = reader.result as string;
            this.renderModalSpriteRows();
          };
          reader.readAsDataURL(file);
        }
      });
      uploadLabel.appendChild(fileInput);

      // 4. Trạng thái ảnh
      const statusText = document.createElement('span');
      statusText.className = 'sprite-row-status';
      statusText.textContent = row.imageDataUrl ? 'Has image' : '(no image)';

      rowEl.appendChild(nameInput);
      rowEl.appendChild(thumbBox);
      rowEl.appendChild(uploadLabel);

      // 5. Nút gỡ ảnh nếu đã có ảnh
      if (row.imageDataUrl) {
        const btnClearImg = document.createElement('button');
        btnClearImg.type = 'button';
        btnClearImg.className = 'btn-clear-sprite-img';
        btnClearImg.title = 'Remove this image';
        btnClearImg.textContent = '✕ Remove';
        btnClearImg.addEventListener('click', () => {
          row.imageDataUrl = '';
          this.renderModalSpriteRows();
        });
        rowEl.appendChild(btnClearImg);
      }

      rowEl.appendChild(statusText);

      // 6. Nút xóa hàng biểu cảm
      const btnRemoveRow = document.createElement('button');
      btnRemoveRow.type = 'button';
      btnRemoveRow.className = 'btn-remove-sprite-row';
      btnRemoveRow.title = 'Delete this expression';
      btnRemoveRow.textContent = '✕';
      btnRemoveRow.addEventListener('click', () => {
        this.modalSpriteRows.splice(idx, 1);
        if (this.modalSpriteRows.length === 0) {
          this.modalSpriteRows.push({ name: 'default', imageDataUrl: '' });
        }
        this.renderModalSpriteRows();
      });
      rowEl.appendChild(btnRemoveRow);

      listContainer.appendChild(rowEl);
    });
  }

  public addModalSpriteRow(name = '', imageDataUrl = ''): void {
    this.modalSpriteRows.push({ name, imageDataUrl });
    this.renderModalSpriteRows();
  }

  public openCharacterModal(charId?: string, prefillId?: string, prefillName?: string): void {
    if (!this.modalCharForm) return;

    const titleEl = document.getElementById('modal-char-title');
    const modeEl = document.getElementById('char-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('char-original-id') as HTMLInputElement;
    const idInput = document.getElementById('char-input-id') as HTMLInputElement;
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement;
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;
    const previewTag = document.getElementById('char-color-preview-tag');

    const project = this.context.getProject();

    if (charId) {
      const existing = (project.characters || []).find(c => c.id === charId);
      if (existing) {
        if (titleEl) titleEl.textContent = `EDIT CHARACTER: ${existing.id}`;
        modeEl.value = 'edit';
        origIdEl.value = existing.id;
        idInput.value = existing.id;
        idInput.disabled = true;
        nameInput.value = existing.name || '';

        const color = (existing.colorHex || '#38BDF8').toUpperCase();
        if (hexInput) hexInput.value = color;
        if (colorInput) colorInput.value = color;
        if (previewTag) {
          previewTag.style.color = color;
          previewTag.style.borderColor = color;
          previewTag.textContent = existing.name || existing.id;
        }

        const entries = Object.entries(existing.sprites || {});
        if (entries.length > 0) {
          this.modalSpriteRows = entries.map(([k, v]) => ({ name: k, imageDataUrl: v || '' }));
        } else {
          this.modalSpriteRows = [{ name: 'default', imageDataUrl: '' }];
        }
      }
    } else {
      if (titleEl) titleEl.textContent = 'ADD NEW CHARACTER';
      modeEl.value = 'create';
      origIdEl.value = '';
      idInput.value = prefillId || '';
      idInput.disabled = false;
      const initialName =
        prefillName || (prefillId ? prefillId.charAt(0).toUpperCase() + prefillId.slice(1) : '');
      nameInput.value = initialName;

      const color = '#38BDF8';
      if (hexInput) hexInput.value = color;
      if (colorInput) colorInput.value = color;
      if (previewTag) {
        previewTag.style.color = color;
        previewTag.style.borderColor = color;
        previewTag.textContent = initialName || 'Display Name';
      }

      this.modalSpriteRows = [
        { name: 'default', imageDataUrl: '' },
        { name: 'happy', imageDataUrl: '' },
      ];
    }

    this.renderModalSpriteRows();
    this.modalCharForm.classList.remove('hidden');
    idInput.focus();
  }

  public closeCharacterModal(): void {
    if (this.modalCharForm) {
      this.modalCharForm.classList.add('hidden');
    }
  }

  public saveCharacterFromModal(): void {
    const modeEl = document.getElementById('char-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('char-original-id') as HTMLInputElement;
    const idInput = document.getElementById('char-input-id') as HTMLInputElement;
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement;
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;

    const charId = idInput.value.trim().toLowerCase();
    const charName = nameInput.value.trim();

    let colorHex = (
      hexInput ? hexInput.value.trim() : colorInput?.value || '#38BDF8'
    ).toUpperCase();
    if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex) && !/^#[0-9A-Fa-f]{3}$/.test(colorHex)) {
      colorHex = '#38BDF8';
    }

    if (!charId) {
      this.context.showToast('Please enter character ID');
      return;
    }

    const project = this.context.getProject();
    if (!Array.isArray(project.characters)) {
      project.characters = [];
    }

    const spritesRecord: Record<string, string> = {};
    for (const row of this.modalSpriteRows) {
      const sName = row.name.trim().toLowerCase();
      if (sName) {
        spritesRecord[sName] = row.imageDataUrl || '';
      }
    }
    if (Object.keys(spritesRecord).length === 0) {
      spritesRecord['default'] = '';
    }

    if (modeEl.value === 'edit') {
      const idx = project.characters.findIndex(c => c.id === origIdEl.value);
      if (idx >= 0) {
        const targetChar = project.characters[idx];
        if (targetChar) {
          targetChar.name = charName;
          targetChar.colorHex = colorHex;
          targetChar.sprites = spritesRecord;
          this.context.showToast(`Updated character "${origIdEl.value}"`);
        }
      }
    } else {
      if (project.characters.some(c => c.id === charId)) {
        this.context.showToast(`Character ID "${charId}" already exists!`);
        return;
      }
      project.characters.push({
        id: charId,
        name: charName,
        colorHex,
        sprites: spritesRecord,
      });
      this.context.showToast(`Added new character "${charId}" (${charName})`);
    }

    this.closeCharacterModal();
    void this.context.saveProjectToStorage();
    this.renderCharacterList();
    this.context.compileCurrentScript();
  }

  public deleteCharacter(charId: string): void {
    if (!window.confirm(`Are you sure you want to delete character "${charId}" from project?`)) {
      return;
    }
    const project = this.context.getProject();
    project.characters = (project.characters || []).filter(c => c.id !== charId);
    void this.context.saveProjectToStorage();
    this.renderCharacterList();
    this.context.compileCurrentScript();
    this.context.showToast(`Deleted character "${charId}"`);
  }

  public addCharacterSprite(charId: string, spriteName: string): void {
    const project = this.context.getProject();
    const char = (project.characters || []).find(c => c.id === charId);
    if (!char) return;
    if (!char.sprites) char.sprites = {};
    char.sprites[spriteName] = '';
    void this.context.saveProjectToStorage();
    this.renderCharacterList();
    this.context.showToast(`Added expression "${spriteName}" for character "${charId}"`);
  }

  public removeCharacterSprite(charId: string, spriteName: string): void {
    const project = this.context.getProject();
    const char = (project.characters || []).find(c => c.id === charId);
    if (!char || !char.sprites) return;
    delete char.sprites[spriteName];
    void this.context.saveProjectToStorage();
    this.renderCharacterList();
    this.context.showToast(`Deleted expression "${spriteName}" from "${charId}"`);
  }
}
