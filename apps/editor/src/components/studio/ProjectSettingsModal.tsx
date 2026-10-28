import React, { useState, useEffect } from 'react';
import type { Project, ProjectDisplaySettings, ProjectEditorSettings, ProjectGameplaySettings } from '@vn-engine/shared-types';
import {
  XIcon,
  SlidersIcon,
  SettingsIcon,
  CheckIcon,
} from '../common/Icons';

export interface ProjectSettingsModalProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
  onSave: (updatedSettings: Project) => void;
}

export type SettingsTab = 'general' | 'display' | 'editor' | 'gameplay';

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  project,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [formData, setFormData] = useState<Project>(project);

  useEffect(() => {
    setFormData(project);
  }, [project, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSave(formData);
  };

  const currentDisplay: ProjectDisplaySettings = {
    width: formData.displaySettings?.width ?? 1920,
    height: formData.displaySettings?.height ?? 1080,
    orientation: formData.displaySettings?.orientation ?? 'landscape',
    lockAspectRatio: formData.displaySettings?.lockAspectRatio ?? true,
  };

  const currentEditor: ProjectEditorSettings = {
    autoSave: formData.editorSettings?.autoSave ?? true,
    autoSaveDebounceMs: formData.editorSettings?.autoSaveDebounceMs ?? 1000,
  };

  const currentGameplay: ProjectGameplaySettings = {
    unmetChoiceDisplay: formData.gameplaySettings?.unmetChoiceDisplay ?? 'hidden',
    textSpeed: formData.gameplaySettings?.textSpeed ?? 30,
    autoForwardDelay: formData.gameplaySettings?.autoForwardDelay ?? 2,
    defaultVolumes: {
      master: formData.gameplaySettings?.defaultVolumes?.master ?? 100,
      bgm: formData.gameplaySettings?.defaultVolumes?.bgm ?? 80,
      sfx: formData.gameplaySettings?.defaultVolumes?.sfx ?? 100,
      voice: formData.gameplaySettings?.defaultVolumes?.voice ?? 100,
    },
  };

  const setResolutionPreset = (w: number, h: number, orient: 'landscape' | 'portrait') => {
    setFormData((prev) => ({
      ...prev,
      displaySettings: {
        width: w,
        height: h,
        orientation: orient,
        lockAspectRatio: prev.displaySettings?.lockAspectRatio ?? true,
      },
    }));
  };

  return (
    <div
      data-testid="modal-project-settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex h-[540px] w-full max-w-2xl flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4 bg-neutral-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <SettingsIcon size={16} className="text-neutral-400" />
            <span>Project Settings</span>
          </div>

          <button
            type="button"
            data-testid="btn-close-settings"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Modal Body: Left Tab Navigator + Right Tab Content */}
        <div className="flex flex-1 min-h-0 divide-x divide-neutral-800">
          {/* Navigation Sidebar */}
          <aside className="w-44 shrink-0 bg-neutral-950/60 p-2 space-y-1 text-xs">
            <button
              type="button"
              data-testid="tab-settings-general"
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-left font-medium transition ${
                activeTab === 'general'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>General</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-display"
              onClick={() => setActiveTab('display')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-left font-medium transition ${
                activeTab === 'display'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>Display & Canvas</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-editor"
              onClick={() => setActiveTab('editor')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-left font-medium transition ${
                activeTab === 'editor'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>Editor & Save</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-gameplay"
              onClick={() => setActiveTab('gameplay')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-left font-medium transition ${
                activeTab === 'gameplay'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <SlidersIcon size={13} />
              <span>Gameplay</span>
            </button>
          </aside>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-auto p-5 text-xs text-neutral-300">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Project Title
                  </label>
                  <input
                    type="text"
                    data-testid="input-settings-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Synopsis / Description
                  </label>
                  <textarea
                    rows={3}
                    data-testid="input-settings-desc"
                    value={formData.description || ''}
                    placeholder="Short summary of this visual novel..."
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full resize-none rounded border border-neutral-700 bg-neutral-950 p-2 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Display & Canvas Tab */}
            {activeTab === 'display' && (
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-medium text-neutral-300 mb-2">
                    Resolution Presets
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="preset-landscape-fhd"
                      onClick={() => setResolutionPreset(1920, 1080, 'landscape')}
                      className={`flex flex-col items-start p-2.5 rounded border text-left transition ${
                        currentDisplay.width === 1920 && currentDisplay.height === 1080
                          ? 'border-neutral-400 bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="font-semibold text-white">1920 × 1080 (16:9)</span>
                      <span className="text-[10px] text-neutral-400">Full HD Landscape</span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-portrait-mobile"
                      onClick={() => setResolutionPreset(1080, 1920, 'portrait')}
                      className={`flex flex-col items-start p-2.5 rounded border text-left transition ${
                        currentDisplay.width === 1080 && currentDisplay.height === 1920
                          ? 'border-neutral-400 bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="font-semibold text-white">1080 × 1920 (9:16)</span>
                      <span className="text-[10px] text-neutral-400">Mobile Webtoon / TikTok</span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-landscape-hd"
                      onClick={() => setResolutionPreset(1280, 720, 'landscape')}
                      className={`flex flex-col items-start p-2.5 rounded border text-left transition ${
                        currentDisplay.width === 1280 && currentDisplay.height === 720
                          ? 'border-neutral-400 bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="font-semibold text-white">1280 × 720 (16:9)</span>
                      <span className="text-[10px] text-neutral-400">Standard HD</span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-classic"
                      onClick={() => setResolutionPreset(1024, 768, 'landscape')}
                      className={`flex flex-col items-start p-2.5 rounded border text-left transition ${
                        currentDisplay.width === 1024 && currentDisplay.height === 768
                          ? 'border-neutral-400 bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="font-semibold text-white">1024 × 768 (4:3)</span>
                      <span className="text-[10px] text-neutral-400">Classic Retro VN</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Width (px)</label>
                    <input
                      type="number"
                      data-testid="input-settings-width"
                      value={currentDisplay.width}
                      onChange={(e) =>
                        setResolutionPreset(
                          Number(e.target.value) || 1920,
                          currentDisplay.height,
                          currentDisplay.orientation
                        )
                      }
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs text-white focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Height (px)</label>
                    <input
                      type="number"
                      data-testid="input-settings-height"
                      value={currentDisplay.height}
                      onChange={(e) =>
                        setResolutionPreset(
                          currentDisplay.width,
                          Number(e.target.value) || 1080,
                          currentDisplay.orientation
                        )
                      }
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs text-white focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Editor & Save Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded border border-neutral-800 bg-neutral-950">
                  <div>
                    <span className="block font-medium text-white">Auto-save to IndexedDB</span>
                    <span className="text-[11px] text-neutral-400">
                      Automatically persist script changes after typing stops
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    data-testid="checkbox-settings-autosave"
                    checked={currentEditor.autoSave}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        editorSettings: {
                          ...currentEditor,
                          autoSave: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Auto-save Debounce Time (ms)
                  </label>
                  <input
                    type="number"
                    min={300}
                    max={5000}
                    step={100}
                    data-testid="input-settings-autosave-debounce"
                    value={currentEditor.autoSaveDebounceMs}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        editorSettings: {
                          ...currentEditor,
                          autoSaveDebounceMs: Number(e.target.value) || 1000,
                        },
                      })
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block font-mono">
                    Default: 1000ms (1 second). Range: 300ms – 5000ms.
                  </span>
                </div>
              </div>
            )}

            {/* Gameplay Tab */}
            {activeTab === 'gameplay' && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-neutral-300">BGM Volume</span>
                    <span className="font-mono text-neutral-400">
                      {currentGameplay.defaultVolumes.bgm}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    data-testid="slider-settings-bgm"
                    value={currentGameplay.defaultVolumes.bgm}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gameplaySettings: {
                          ...currentGameplay,
                          defaultVolumes: {
                            ...currentGameplay.defaultVolumes,
                            bgm: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="w-full accent-neutral-300"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-neutral-300">Voice Volume</span>
                    <span className="font-mono text-neutral-400">
                      {currentGameplay.defaultVolumes.voice}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    data-testid="slider-settings-voice"
                    value={currentGameplay.defaultVolumes.voice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gameplaySettings: {
                          ...currentGameplay,
                          defaultVolumes: {
                            ...currentGameplay.defaultVolumes,
                            voice: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="w-full accent-neutral-300"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-neutral-300">Typewriter Text Speed</span>
                    <span className="font-mono text-neutral-400">
                      {currentGameplay.textSpeed} ms/char
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    data-testid="slider-settings-speed"
                    value={currentGameplay.textSpeed}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gameplaySettings: {
                          ...currentGameplay,
                          textSpeed: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-neutral-300"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex h-12 items-center justify-end gap-2 border-t border-neutral-800 px-4 bg-neutral-950">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid="btn-save-settings"
            onClick={handleSubmit}
            className="flex items-center gap-1.5 rounded bg-white px-4 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 transition"
          >
            <CheckIcon size={12} />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
