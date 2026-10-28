import React from 'react';
import { FileTextIcon, UserIcon, ImageIcon, SettingsIcon } from '../common/Icons';

export type StudioTab = 'scripts' | 'characters' | 'assets';

export interface ActivityBarProps {
  activeTab: StudioTab | null;
  onSelectTab: (tab: StudioTab) => void;
  onOpenSettings?: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, onSelectTab, onOpenSettings }) => {
  return (
    <aside
      data-testid="activity-bar"
      className="flex w-12 flex-col justify-between items-center border-r border-neutral-800 bg-neutral-950 py-3 text-neutral-400 select-none shrink-0"
    >
      <div className="flex flex-col items-center">
        <button
          type="button"
          data-testid="tab-scripts"
          onClick={() => onSelectTab('scripts')}
          title="Scripts & Scenes"
          aria-label="Scripts"
          className={`relative my-1 flex h-10 w-10 items-center justify-center rounded transition-colors ${
            activeTab === 'scripts'
              ? 'bg-neutral-800 text-white'
              : 'hover:bg-neutral-900 hover:text-neutral-200'
          }`}
        >
          <FileTextIcon size={18} />
          {activeTab === 'scripts' && (
            <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-white" />
          )}
        </button>

        <button
          type="button"
          data-testid="tab-characters"
          onClick={() => onSelectTab('characters')}
          title="Characters & Expressions"
          aria-label="Characters"
          className={`relative my-1 flex h-10 w-10 items-center justify-center rounded transition-colors ${
            activeTab === 'characters'
              ? 'bg-neutral-800 text-white'
              : 'hover:bg-neutral-900 hover:text-neutral-200'
          }`}
        >
          <UserIcon size={18} />
          {activeTab === 'characters' && (
            <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-white" />
          )}
        </button>

        <button
          type="button"
          data-testid="tab-assets"
          onClick={() => onSelectTab('assets')}
          title="Asset Library (Audio, Backgrounds, CG)"
          aria-label="Assets"
          className={`relative my-1 flex h-10 w-10 items-center justify-center rounded transition-colors ${
            activeTab === 'assets'
              ? 'bg-neutral-800 text-white'
              : 'hover:bg-neutral-900 hover:text-neutral-200'
          }`}
        >
          <ImageIcon size={18} />
          {activeTab === 'assets' && (
            <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-white" />
          )}
        </button>
      </div>

      {onOpenSettings && (
        <button
          type="button"
          data-testid="activity-bar-btn-settings"
          onClick={onOpenSettings}
          title="Project Settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors"
        >
          <SettingsIcon size={18} />
        </button>
      )}
    </aside>
  );
};
