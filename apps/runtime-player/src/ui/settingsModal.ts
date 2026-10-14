// ================================================================
// VN RUNTIME PLAYER - SETTINGS MODAL MODULE
// Modal cài đặt hợp nhất: Audio, Save/Load, Backlog, Debug, System
// ================================================================

import type { VisualNovelVM } from '@vn-engine/core-vm';
import type { AudioManager } from '@vn-engine/audio';
import type { BacklogEntry } from '../playerContext';

export class SettingsModal {
  private modalSettingsMenu: HTMLElement;
  private settingsTabButtons: HTMLButtonElement[] = [];
  private settingsPanes: HTMLElement[] = [];
  private btnCloseSettingsMenu: HTMLButtonElement | null = null;
  private backlogContainer: HTMLElement;

  private onTabSwitched?: (tabName: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system') => void;

  constructor(callbacks?: {
    onTabSwitched?: (tabName: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system') => void;
  }) {
    this.onTabSwitched = callbacks?.onTabSwitched;

    this.modalSettingsMenu = document.getElementById('modal-settings-menu')!;
    this.settingsTabButtons = Array.from(document.querySelectorAll('.settings-tab-btn'));
    this.settingsPanes = Array.from(document.querySelectorAll('.settings-pane'));
    this.btnCloseSettingsMenu = document.getElementById(
      'btn-close-settings-menu',
    ) as HTMLButtonElement | null;
    this.backlogContainer = document.getElementById('backlog-container')!;

    this.btnCloseSettingsMenu?.addEventListener('click', () => {
      this.close();
    });

    this.settingsTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as
          | 'audio'
          | 'saveload'
          | 'backlog'
          | 'debug'
          | 'system'
          | undefined;
        if (tab) {
          this.switchSettingsTab(tab);
        }
      });
    });
  }

  public isOpen(): boolean {
    return Boolean(
      this.modalSettingsMenu && !this.modalSettingsMenu.classList.contains('hidden'),
    );
  }

  public open(
    initialTab: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system' = 'audio',
  ): void {
    this.switchSettingsTab(initialTab);
    this.modalSettingsMenu.classList.remove('hidden');
  }

  public close(): void {
    if (this.modalSettingsMenu) {
      this.modalSettingsMenu.classList.add('hidden');
    }
  }

  public switchSettingsTab(
    tabName: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system',
  ): void {
    this.settingsTabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    this.settingsPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabName}`);
    });

    if (this.onTabSwitched) {
      this.onTabSwitched(tabName);
    }
  }

  public renderBacklog(backlog: BacklogEntry[]): void {
    if (!this.backlogContainer) return;
    this.backlogContainer.innerHTML = '';

    if (backlog.length === 0) {
      this.backlogContainer.innerHTML =
        '<div style="color: #666; font-style: italic; padding: 20px;">No dialogue history yet.</div>';
      return;
    }

    backlog.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'backlog-item';
      if (entry.speaker) {
        const spk = document.createElement('div');
        spk.className = 'backlog-speaker';
        spk.textContent = entry.speaker.toUpperCase();
        item.appendChild(spk);
      }
      const txt = document.createElement('div');
      txt.className = 'backlog-text';
      txt.textContent = entry.text;
      item.appendChild(txt);
      this.backlogContainer.appendChild(item);
    });

    const modalBody = this.modalSettingsMenu.querySelector('.wf-modal-body');
    if (modalBody) {
      modalBody.scrollTop = modalBody.scrollHeight;
    }
  }

  public renderDebugInfo(vm: VisualNovelVM, audio: AudioManager): void {
    const vmState = vm.getState();
    const sceneEl = document.getElementById('debug-scene');
    const ipEl = document.getElementById('debug-ip');
    const callstackEl = document.getElementById('debug-callstack');

    if (sceneEl) sceneEl.textContent = vmState.currentScene;
    if (ipEl) ipEl.textContent = vmState.instructionPointer.toString();
    if (callstackEl) callstackEl.textContent = vmState.callStack.length.toString();

    // Variables table
    const varBody = document.getElementById('debug-variables-body');
    if (varBody) {
      varBody.innerHTML = '';
      for (const [name, val] of Object.entries(vmState.variables)) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = name;

        const tdVal = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = String(val);
        tdVal.appendChild(strong);

        const tdType = document.createElement('td');
        tdType.textContent = typeof val;

        tr.appendChild(tdName);
        tr.appendChild(tdVal);
        tr.appendChild(tdType);
        varBody.appendChild(tr);
      }
    }

    // Audio channels table
    const audioBody = document.getElementById('debug-audio-body');
    if (audioBody) {
      audioBody.innerHTML = '';
      for (const ch of audio.getChannelsState()) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = ch.name;

        const tdAsset = document.createElement('td');
        tdAsset.textContent = ch.currentAssetId ?? '-';

        const tdVol = document.createElement('td');
        tdVol.textContent = `${Math.round(ch.volume * 100)}%`;

        const tdLoop = document.createElement('td');
        tdLoop.textContent = ch.loop ? 'Yes' : 'No';

        const tdPlay = document.createElement('td');
        tdPlay.textContent = ch.isPlaying ? 'Playing' : 'Stopped';

        tr.appendChild(tdName);
        tr.appendChild(tdAsset);
        tr.appendChild(tdVol);
        tr.appendChild(tdLoop);
        tr.appendChild(tdPlay);
        audioBody.appendChild(tr);
      }
    }
  }
}
