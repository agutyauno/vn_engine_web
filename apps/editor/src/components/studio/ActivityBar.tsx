import React from 'react';
import { FileTextIcon, UserIcon, ImageIcon } from '../common/Icons';

export type StudioTab = 'scripts' | 'characters' | 'assets';

interface ActivityBarProps {
  activeTab: StudioTab | null;
  onSelectTab: (tab: StudioTab) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <aside
      data-testid="activity-bar"
      className="flex w-12 flex-col items-center border-r border-neutral-800 bg-neutral-950 py-3 text-neutral-400 select-none shrink-0"
    >
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
    </aside>
  );
};
