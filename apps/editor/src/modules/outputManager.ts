// ================================================================
// VN ENGINE STUDIO - OUTPUT MANAGER MODULE
// Quản lý Console & Log Stream trong Bottom Drawer:
// Stream logs từ Compiler, Runtime Player, Assets, Export Process
// ================================================================

import type { LogEntry, LogChannel, LogLevel } from '@vn-engine/shared-types';
import type { StudioContext } from './editorTypes';

export interface OutputManagerOptions {
  maxCapacity?: number;
}

export class OutputManager {
  private context: StudioContext;
  private maxCapacity: number;

  // DOM Elements
  private tabBtn: HTMLElement | null;
  private errorBadge: HTMLElement | null;
  private terminalLinesContainer: HTMLElement | null;
  private channelFilterSelect: HTMLSelectElement | null;
  private levelFilterSelect: HTMLSelectElement | null;
  private searchInput: HTMLInputElement | null;
  private btnClear: HTMLElement | null;
  private btnCopy: HTMLElement | null;
  private toggleAutoScroll: HTMLInputElement | null;

  // State
  private logs: LogEntry[] = [];
  private selectedChannel: LogChannel = 'all';
  private selectedLevel: 'all' | LogLevel = 'all';
  private searchQuery: string = '';
  private autoScroll: boolean = true;
  private errorCount: number = 0;
  private logIdCounter: number = 0;

  constructor(context: StudioContext, options?: OutputManagerOptions) {
    this.context = context;
    this.maxCapacity = options?.maxCapacity ?? 1000;

    this.tabBtn = document.getElementById('drawer-tab-output');
    this.errorBadge = document.getElementById('output-error-badge');
    this.terminalLinesContainer = document.getElementById('output-terminal-lines');
    this.channelFilterSelect = document.getElementById(
      'output-channel-filter',
    ) as HTMLSelectElement | null;
    this.levelFilterSelect = document.getElementById(
      'output-level-filter',
    ) as HTMLSelectElement | null;
    this.searchInput = document.getElementById('output-search-input') as HTMLInputElement | null;
    this.btnClear = document.getElementById('btn-clear-output');
    this.btnCopy = document.getElementById('btn-copy-output');
    this.toggleAutoScroll = document.getElementById(
      'toggle-autoscroll-output',
    ) as HTMLInputElement | null;

    this.setupEvents();
  }

  private setupEvents(): void {
    if (this.channelFilterSelect) {
      this.channelFilterSelect.addEventListener('change', () => {
        this.setChannelFilter((this.channelFilterSelect?.value as LogChannel) || 'all');
      });
    }

    if (this.levelFilterSelect) {
      this.levelFilterSelect.addEventListener('change', () => {
        this.setLevelFilter((this.levelFilterSelect?.value as 'all' | LogLevel) || 'all');
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        this.setSearchQuery(this.searchInput?.value || '');
      });
    }

    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => {
        this.clear();
      });
    }

    if (this.btnCopy) {
      this.btnCopy.addEventListener('click', () => {
        void this.copyLogsToClipboard();
      });
    }

    if (this.tabBtn) {
      this.tabBtn.addEventListener('click', () => {
        if (this.autoScroll && this.terminalLinesContainer) {
          this.terminalLinesContainer.scrollTop = this.terminalLinesContainer.scrollHeight;
        }
      });
    }

    if (this.toggleAutoScroll) {
      this.toggleAutoScroll.addEventListener('change', () => {
        this.setAutoScroll(Boolean(this.toggleAutoScroll?.checked));
      });
    }
  }

  public getTabButton(): HTMLElement | null {
    return this.tabBtn;
  }

  public appendLog(
    entry: Omit<LogEntry, 'id' | 'timestamp'> & Partial<Pick<LogEntry, 'id' | 'timestamp'>>,
  ): LogEntry {
    const fullEntry: LogEntry = {
      id: entry.id || `log_${++this.logIdCounter}_${Date.now()}`,
      timestamp: entry.timestamp || Date.now(),
      channel: entry.channel,
      level: entry.level,
      message: entry.message,
      source: entry.source,
      details: entry.details,
    };

    if (fullEntry.level === 'error') {
      this.errorCount++;
      this.updateErrorBadge();
    }

    this.logs.push(fullEntry);

    // Render line in DOM
    const lineEl = this.createLogLineElement(fullEntry);
    this.terminalLinesContainer?.appendChild(lineEl);

    // Enforce Ring Buffer capacity
    if (this.logs.length > this.maxCapacity) {
      const evicted = this.logs.shift();
      if (evicted && evicted.level === 'error' && this.errorCount > 0) {
        this.errorCount--;
        this.updateErrorBadge();
      }
      if (this.terminalLinesContainer && this.terminalLinesContainer.children.length > 0) {
        const first = this.terminalLinesContainer.children[0];
        if (first) {
          if (typeof this.terminalLinesContainer.removeChild === 'function') {
            this.terminalLinesContainer.removeChild(first);
          } else if (typeof (first as { remove?: () => void }).remove === 'function') {
            (first as { remove: () => void }).remove();
          }
        }
      }
    }

    // Scroll to bottom if auto-scroll is enabled
    if (this.autoScroll && this.terminalLinesContainer) {
      this.terminalLinesContainer.scrollTop = this.terminalLinesContainer.scrollHeight;
    }

    return fullEntry;
  }

  public info(
    channel: LogChannel,
    message: string,
    source?: string,
    details?: unknown,
  ): LogEntry {
    return this.appendLog({ channel, level: 'info', message, source, details });
  }

  public warn(
    channel: LogChannel,
    message: string,
    source?: string,
    details?: unknown,
  ): LogEntry {
    return this.appendLog({ channel, level: 'warn', message, source, details });
  }

  public error(
    channel: LogChannel,
    message: string,
    source?: string,
    details?: unknown,
  ): LogEntry {
    return this.appendLog({ channel, level: 'error', message, source, details });
  }

  public clear(): void {
    this.logs = [];
    this.errorCount = 0;
    this.updateErrorBadge();
    if (this.terminalLinesContainer) {
      this.terminalLinesContainer.innerHTML = '';
    }
  }

  public setChannelFilter(channel: LogChannel): void {
    this.selectedChannel = channel;
    if (this.channelFilterSelect && this.channelFilterSelect.value !== channel) {
      this.channelFilterSelect.value = channel;
    }
    this.applyVisibilityFilters();
  }

  public setLevelFilter(level: 'all' | LogLevel): void {
    this.selectedLevel = level;
    if (this.levelFilterSelect && this.levelFilterSelect.value !== level) {
      this.levelFilterSelect.value = level;
    }
    this.applyVisibilityFilters();
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    if (this.searchInput && this.searchInput.value !== query) {
      this.searchInput.value = query;
    }
    this.applyVisibilityFilters();
  }

  public setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled;
    if (this.toggleAutoScroll && this.toggleAutoScroll.checked !== enabled) {
      this.toggleAutoScroll.checked = enabled;
    }
    if (enabled && this.terminalLinesContainer) {
      this.terminalLinesContainer.scrollTop = this.terminalLinesContainer.scrollHeight;
    }
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getErrorCount(): number {
    return this.errorCount;
  }

  public async copyLogsToClipboard(): Promise<void> {
    const visibleEntries = this.logs.filter(entry => this.matchesFilters(entry));
    const formattedText = visibleEntries
      .map(e => {
        const timeStr = this.formatTimestamp(e.timestamp);
        return `[${timeStr}] [${e.channel.toUpperCase()}] [${e.level.toUpperCase()}] ${e.message}`;
      })
      .join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(formattedText);
      this.context.showToast('Copied logs to clipboard');
    }
  }

  private createLogLineElement(entry: LogEntry): HTMLElement {
    const line = document.createElement('div');
    line.className = `log-line log-${entry.level}`;
    line.dataset['id'] = entry.id;
    line.dataset['channel'] = entry.channel;
    line.dataset['level'] = entry.level;

    if (!this.matchesFilters(entry)) {
      line.classList.add('hidden');
    }

    // 1. Timestamp
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time font-mono';
    timeSpan.textContent = this.formatTimestamp(entry.timestamp);

    // 2. Channel tag
    const channelSpan = document.createElement('span');
    channelSpan.className = `log-channel-tag tag-${entry.channel} font-mono`;
    channelSpan.textContent = `[${entry.channel.toUpperCase()}]`;

    // 3. Level pill
    const levelSpan = document.createElement('span');
    levelSpan.className = `log-level-pill level-${entry.level}`;
    levelSpan.textContent = entry.level.toUpperCase();

    // 4. Message text
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-message font-mono';
    msgSpan.textContent = entry.message;

    line.appendChild(timeSpan);
    line.appendChild(channelSpan);
    line.appendChild(levelSpan);
    line.appendChild(msgSpan);

    return line;
  }

  private matchesFilters(entry: LogEntry): boolean {
    const matchesChannel =
      this.selectedChannel === 'all' || entry.channel === this.selectedChannel;
    const matchesLevel = this.selectedLevel === 'all' || entry.level === this.selectedLevel;
    const matchesSearch =
      !this.searchQuery ||
      entry.message.toLowerCase().includes(this.searchQuery) ||
      (entry.source && entry.source.toLowerCase().includes(this.searchQuery));

    return Boolean(matchesChannel && matchesLevel && matchesSearch);
  }

  private applyVisibilityFilters(): void {
    if (!this.terminalLinesContainer) return;
    const lineEls = this.terminalLinesContainer.querySelectorAll<HTMLElement>('.log-line');

    lineEls.forEach(el => {
      const channel = (el.dataset['channel'] as LogChannel) || 'all';
      const level = (el.dataset['level'] as LogLevel) || 'info';
      const text = el.textContent?.toLowerCase() || '';

      const matchesChannel =
        this.selectedChannel === 'all' || channel === this.selectedChannel;
      const matchesLevel = this.selectedLevel === 'all' || level === this.selectedLevel;
      const matchesSearch = !this.searchQuery || text.includes(this.searchQuery);

      if (matchesChannel && matchesLevel && matchesSearch) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    if (this.autoScroll && this.terminalLinesContainer) {
      this.terminalLinesContainer.scrollTop = this.terminalLinesContainer.scrollHeight;
    }
  }

  private updateErrorBadge(): void {
    if (!this.errorBadge) return;
    if (this.errorCount > 0) {
      this.errorBadge.textContent = String(this.errorCount);
      this.errorBadge.classList.remove('hidden');
    } else {
      this.errorBadge.classList.add('hidden');
    }
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const mmm = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
  }
}
