import React, { useState, useEffect } from 'react';
import type {
  Project,
  ProjectDisplaySettings,
  ProjectEditorSettings,
  ProjectGameplaySettings,
} from '@vn-engine/shared-types';
import {
  XIcon,
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex h-[540px] w-full max-w-2xl flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4 bg-neutral-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <SettingsIcon size={16} className="text-neutral-400" />
            <span id="project-settings-title">Project Settings</span>
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
          <div className="w-48 bg-neutral-950/60 p-2 space-y-1 shrink-0">
            <button
              type="button"
              data-testid="tab-settings-general"
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-xs font-medium text-left transition ${
                activeTab === 'general'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>General</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-display"
              onClick={() => setActiveTab('display')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-xs font-medium text-left transition ${
                activeTab === 'display'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>Display & Canvas</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-editor"
              onClick={() => setActiveTab('editor')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-xs font-medium text-left transition ${
                activeTab === 'editor'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>Editor & Auto-save</span>
            </button>

            <button
              type="button"
              data-testid="tab-settings-gameplay"
              onClick={() => setActiveTab('gameplay')}
              className={`w-full flex items-center gap-2 rounded px-3 py-2 text-xs font-medium text-left transition ${
                activeTab === 'gameplay'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <span>Gameplay</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-5 text-neutral-200">
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
                    Description
                  </label>
                  <textarea
                    rows={3}
                    data-testid="input-settings-description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short summary of this visual novel..."
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Entry Scene
                  </label>
                  <select
                    data-testid="select-settings-entry-scene"
                    value={formData.entryScene || (formData.files?.[0]?.name ?? 'main.vns')}
                    onChange={(e) => setFormData({ ...formData, entryScene: e.target.value })}
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  >
                    {(formData.files || []).map((file) => (
                      <option key={file.id} value={file.name}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    The starting script file loaded when the story begins.
                  </span>
                </div>
              </div>
            )}

            {/* Display Tab */}
            {activeTab === 'display' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-2">
                    Resolution Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="preset-1080p-landscape"
                      onClick={() => setResolutionPreset(1920, 1080, 'landscape')}
                      className={`flex flex-col items-start rounded border p-2 text-left transition ${
                        currentDisplay.width === 1920 && currentDisplay.height === 1080
                          ? 'border-white bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-xs font-semibold text-white">1080p Full HD</span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        1920 × 1080 (16:9 Landscape)
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-720p-landscape"
                      onClick={() => setResolutionPreset(1280, 720, 'landscape')}
                      className={`flex flex-col items-start rounded border p-2 text-left transition ${
                        currentDisplay.width === 1280 && currentDisplay.height === 720
                          ? 'border-white bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-xs font-semibold text-white">720p HD</span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        1280 × 720 (16:9 Landscape)
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-portrait-mobile"
                      onClick={() => setResolutionPreset(1080, 1920, 'portrait')}
                      className={`flex flex-col items-start rounded border p-2 text-left transition ${
                        currentDisplay.width === 1080 && currentDisplay.height === 1920
                          ? 'border-white bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-xs font-semibold text-white">Mobile Portrait</span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        1080 × 1920 (9:16 Portrait)
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="preset-retro-43"
                      onClick={() => setResolutionPreset(1024, 768, 'landscape')}
                      className={`flex flex-col items-start rounded border p-2 text-left transition ${
                        currentDisplay.width === 1024 && currentDisplay.height === 768
                          ? 'border-white bg-neutral-800'
                          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                      }`}
                    >
                      <span className="text-xs font-semibold text-white">Retro 4:3</span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        1024 × 768 (4:3 Landscape)
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Canvas Width (px)
                    </label>
                    <input
                      type="number"
                      data-testid="input-settings-width"
                      value={currentDisplay.width}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          displaySettings: {
                            ...currentDisplay,
                            width: Number(e.target.value) || 1920,
                          },
                        })
                      }
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Canvas Height (px)
                    </label>
                    <input
                      type="number"
                      data-testid="input-settings-height"
                      value={currentDisplay.height}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          displaySettings: {
                            ...currentDisplay,
                            height: Number(e.target.value) || 1080,
                          },
                        })
                      }
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="lockAspectRatio"
                    data-testid="checkbox-settings-aspect-ratio"
                    checked={currentDisplay.lockAspectRatio}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        displaySettings: {
                          ...currentDisplay,
                          lockAspectRatio: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded accent-neutral-200"
                  />
                  <label htmlFor="lockAspectRatio" className="text-xs text-neutral-300 cursor-pointer">
                    Lock aspect ratio during viewport scaling
                  </label>
                </div>
              </div>
            )}

            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950/60 p-3">
                  <div>
                    <span className="block text-xs font-medium text-white">
                      Auto-save Enabled
                    </span>
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
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Unmet Choice Display
                  </label>
                  <select
                    data-testid="select-settings-unmet-choice"
                    value={currentGameplay.unmetChoiceDisplay}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gameplaySettings: {
                          ...currentGameplay,
                          unmetChoiceDisplay: e.target.value as 'hidden' | 'disabled',
                        },
                      })
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="hidden">Hidden (Do not render options whose condition is false)</option>
                    <option value="disabled">Disabled (Render greyed out option with lock indicator)</option>
                  </select>
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
                    data-testid="slider-settings-text-speed"
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
                  <span className="text-[10px] text-neutral-500 mt-0.5 block font-mono">
                    Speed per character typed (5ms = Instant, 100ms = Slow).
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-neutral-300">Auto-forward Delay</span>
                    <span className="font-mono text-neutral-400">
                      {currentGameplay.autoForwardDelay} s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    data-testid="slider-settings-autoforward-delay"
                    value={currentGameplay.autoForwardDelay}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gameplaySettings: {
                          ...currentGameplay,
                          autoForwardDelay: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-neutral-300"
                  />
                  <span className="text-[10px] text-neutral-500 mt-0.5 block font-mono">
                    Delay in seconds before advancing dialog in auto mode.
                  </span>
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
