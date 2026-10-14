// ================================================================
// VN ENGINE STUDIO - ASSET MANAGER MODULE
// Quản lý tài nguyên đa phương tiện (ảnh, âm thanh, video, font) & reconciliation
// ================================================================

import type { AssetRef } from '@vn-engine/shared-types';
import type { StudioContext } from './editorTypes';

export class AssetManager {
  private context: StudioContext;

  private assetContainer: HTMLElement | null;
  private btnAddAsset: HTMLElement | null;
  private assetReconciliationEl: HTMLElement | null;
  private modalAssetForm: HTMLElement | null;
  private formAsset: HTMLFormElement | null;
  private activeAssetFilter: 'all' | 'image' | 'audio' | 'video' | 'font' = 'all';

  constructor(context: StudioContext) {
    this.context = context;
    this.assetContainer = document.getElementById('asset-list-container');
    this.btnAddAsset = document.getElementById('btn-add-asset');
    this.assetReconciliationEl = document.getElementById('asset-reconciliation-alerts');
    this.modalAssetForm = document.getElementById('modal-asset-form');
    this.formAsset = document.getElementById('form-asset') as HTMLFormElement | null;

    this.setupAssetManagement();
  }

  private setupAssetManagement(): void {
    if (this.btnAddAsset) {
      this.btnAddAsset.addEventListener('click', () => {
        this.openAssetModal();
      });
    }

    const btnClose = document.getElementById('btn-close-asset-modal');
    const btnCancel = document.getElementById('btn-cancel-asset-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeAssetModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeAssetModal());

    const filterBtns = document.querySelectorAll('.asset-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeAssetFilter =
          (btn.getAttribute('data-filter') as 'all' | 'image' | 'audio' | 'video' | 'font') ||
          'all';
        this.renderAssetList();
      });
    });

    if (this.formAsset) {
      this.formAsset.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.saveAssetFromModal();
      });
    }
  }

  public renderAssetList(): void {
    if (!this.assetContainer) return;
    this.assetContainer.innerHTML = '';

    const project = this.context.getProject();
    let assets: AssetRef[] = project.assets || [];
    if (this.activeAssetFilter !== 'all') {
      assets = assets.filter(a => a.type === this.activeAssetFilter);
    }

    if (assets.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-meta-hint';
      hint.textContent =
        this.activeAssetFilter === 'all'
          ? 'No assets in project yet. Click "+ Add Asset" above to add one.'
          : `No assets of type "${this.activeAssetFilter}".`;
      this.assetContainer.appendChild(hint);
      return;
    }

    const astMetadata = this.context.getCachedAstMetadata();
    const usedBackgrounds = astMetadata.assets.backgrounds;
    const usedAudio = astMetadata.assets.audio;

    for (const asset of assets) {
      const card = document.createElement('div');
      card.className = 'asset-card';

      const main = document.createElement('div');
      main.className = 'asset-card-main';

      const icon = document.createElement('div');
      icon.className = 'asset-card-icon';
      icon.textContent =
        asset.type === 'audio'
          ? '🎵'
          : asset.type === 'video'
            ? '🎥'
            : asset.type === 'font'
              ? '🔤'
              : '🖼';

      const info = document.createElement('div');
      info.className = 'asset-card-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'asset-name-row';

      const nameText = document.createElement('span');
      nameText.className = 'asset-name-text';
      nameText.textContent = asset.name;
      nameText.title = asset.name;

      const typeBadge = document.createElement('span');
      typeBadge.className = 'asset-type-badge';
      typeBadge.textContent = asset.type;

      nameRow.appendChild(nameText);
      nameRow.appendChild(typeBadge);

      // Check if used in script
      const isUsed =
        asset.type === 'audio'
          ? usedAudio.has(asset.name) || usedAudio.has(asset.id)
          : asset.type === 'video' || asset.type === 'font'
            ? true
            : usedBackgrounds.has(asset.name) || usedBackgrounds.has(asset.id);

      if (!isUsed) {
        const unusedBadge = document.createElement('span');
        unusedBadge.className = 'asset-badge-unused';
        unusedBadge.textContent = 'Unused';
        unusedBadge.title = 'This asset is not referenced in any script file';
        nameRow.appendChild(unusedBadge);
      }

      info.appendChild(nameRow);
      main.appendChild(icon);
      main.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'meta-card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-card-action';
      btnEdit.title = `Edit asset ${asset.name}`;
      btnEdit.textContent = '✎ Edit';
      btnEdit.addEventListener('click', () => {
        this.openAssetModal(asset.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-card-action btn-card-delete';
      btnDel.title = `Delete asset ${asset.name}`;
      btnDel.textContent = '✕ Delete';
      btnDel.addEventListener('click', () => {
        this.deleteAsset(asset.id);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(actions);
      this.assetContainer.appendChild(card);
    }
  }

  public reconcileAssetsWithScript(backgrounds: Set<string>, audio: Set<string>): void {
    if (!this.assetReconciliationEl) return;
    this.assetReconciliationEl.innerHTML = '';

    const project = this.context.getProject();
    const declaredNames = new Set((project.assets || []).map(a => a.name));
    const declaredIds = new Set((project.assets || []).map(a => a.id));

    for (const bg of backgrounds) {
      if (!declaredNames.has(bg) && !declaredIds.has(bg)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Background "${bg}" not registered`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = `Script uses command: background ${bg} but it is not in the Assets catalog.`;

        const btn = document.createElement('button');
        btn.className = 'reconciliation-alert-btn';
        btn.textContent = `+ Declare asset "${bg}"`;
        btn.addEventListener('click', () => {
          this.openAssetModal(undefined, bg, 'image');
        });

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btn);
        this.assetReconciliationEl.appendChild(alertCard);
      }
    }

    for (const aud of audio) {
      if (!declaredNames.has(aud) && !declaredIds.has(aud)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Audio "${aud}" not registered`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = `Script uses command play "${aud}" but it is not in the Assets catalog.`;

        const btn = document.createElement('button');
        btn.className = 'reconciliation-alert-btn';
        btn.textContent = `+ Declare asset "${aud}"`;
        btn.addEventListener('click', () => {
          this.openAssetModal(undefined, aud, 'audio');
        });

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btn);
        this.assetReconciliationEl.appendChild(alertCard);
      }
    }
  }

  public openAssetModal(
    assetId?: string,
    prefillName?: string,
    prefillType?: 'image' | 'audio' | 'video' | 'font',
  ): void {
    if (!this.modalAssetForm) return;

    const titleEl = document.getElementById('modal-asset-title');
    const modeEl = document.getElementById('asset-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('asset-original-id') as HTMLInputElement;
    const typeSelect = document.getElementById('asset-input-type') as HTMLSelectElement;
    const nameInput = document.getElementById('asset-input-name') as HTMLInputElement;
    const fileInput = document.getElementById('asset-input-file') as HTMLInputElement;
    const urlInput = document.getElementById('asset-input-url') as HTMLInputElement;

    fileInput.value = '';

    const project = this.context.getProject();

    if (assetId) {
      const existing = (project.assets || []).find(a => a.id === assetId);
      if (existing) {
        if (titleEl) titleEl.textContent = `EDIT ASSET: ${existing.name}`;
        modeEl.value = 'edit';
        origIdEl.value = existing.id;
        typeSelect.value = existing.type;
        nameInput.value = existing.name;
        urlInput.value = existing.storageUrl || '';
      }
    } else {
      if (titleEl) titleEl.textContent = 'ADD NEW ASSET';
      modeEl.value = 'create';
      origIdEl.value = '';
      typeSelect.value = prefillType || 'image';
      nameInput.value = prefillName || '';
      urlInput.value = '';
    }

    this.modalAssetForm.classList.remove('hidden');
    nameInput.focus();
  }

  public closeAssetModal(): void {
    if (this.modalAssetForm) {
      this.modalAssetForm.classList.add('hidden');
    }
  }

  public saveAssetFromModal(): void {
    const modeEl = document.getElementById('asset-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('asset-original-id') as HTMLInputElement;
    const typeSelect = document.getElementById('asset-input-type') as HTMLSelectElement;
    const nameInput = document.getElementById('asset-input-name') as HTMLInputElement;
    const fileInput = document.getElementById('asset-input-file') as HTMLInputElement;
    const urlInput = document.getElementById('asset-input-url') as HTMLInputElement;

    const assetName = nameInput.value.trim();
    const assetType = (typeSelect.value as 'image' | 'audio' | 'video' | 'font') || 'image';
    let storageUrl = urlInput.value.trim();

    if (!assetName) {
      this.context.showToast('Please enter asset name');
      return;
    }

    const project = this.context.getProject();
    if (!Array.isArray(project.assets)) {
      project.assets = [];
    }

    const saveRecord = (url: string, size: number) => {
      if (modeEl.value === 'edit') {
        const idx = project.assets.findIndex(a => a.id === origIdEl.value);
        if (idx >= 0) {
          const targetAsset = project.assets[idx];
          if (targetAsset) {
            targetAsset.name = assetName;
            targetAsset.type = assetType;
            if (url) targetAsset.storageUrl = url;
            if (size) targetAsset.sizeBytes = size;
            this.context.showToast(`Updated asset "${assetName}"`);
          }
        }
      } else {
        const newId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        project.assets.push({
          id: newId,
          name: assetName,
          type: assetType,
          storageUrl: url || '',
          sizeBytes: size || 1024 * 100,
        });
        this.context.showToast(`Added new asset "${assetName}"`);
      }

      this.closeAssetModal();
      void this.context.saveProjectToStorage();
      this.renderAssetList();
      this.context.compileCurrentScript();
    };

    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        storageUrl = typeof reader.result === 'string' ? reader.result : '';
        saveRecord(storageUrl, file.size);
      };
      reader.readAsDataURL(file);
    } else {
      saveRecord(storageUrl, 1024 * 50);
    }
  }

  public deleteAsset(assetId: string): void {
    const project = this.context.getProject();
    const existing = (project.assets || []).find(a => a.id === assetId);
    const name = existing ? existing.name : assetId;
    if (!window.confirm(`Are you sure you want to delete asset "${name}" from project?`)) {
      return;
    }
    project.assets = (project.assets || []).filter(a => a.id !== assetId);
    void this.context.saveProjectToStorage();
    this.renderAssetList();
    this.context.compileCurrentScript();
    this.context.showToast(`Deleted asset "${name}"`);
  }
}
