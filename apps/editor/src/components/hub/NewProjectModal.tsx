import React, { useState } from 'react';
import { CreateProjectParams } from '../../core/contracts/repository';
import { CloseIcon } from '../common/Icons';

export interface NewProjectModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onCreate?: (params: CreateProjectParams) => Promise<void> | void;
  onSubmit?: (params: CreateProjectParams) => Promise<void> | void;
}

export type AspectPreset = '16:9' | '9:16' | '4:3' | 'custom';

export const PRESET_RESOLUTIONS: Record<
  Exclude<AspectPreset, 'custom'>,
  { width: number; height: number; orientation: 'landscape' | 'portrait'; label: string }
> = {
  '16:9': { width: 1920, height: 1080, orientation: 'landscape', label: 'Landscape 16:9 (1920 × 1080)' },
  '9:16': { width: 1080, height: 1920, orientation: 'portrait', label: 'Portrait 9:16 (1080 × 1920) - Mobile' },
  '4:3': { width: 1024, height: 768, orientation: 'landscape', label: 'Classic 4:3 (1024 × 768)' },
};

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  isSubmitting = false,
  onClose,
  onCreate,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preset, setPreset] = useState<AspectPreset>('16:9');
  const [width, setWidth] = useState<number | string>(1920);
  const [height, setHeight] = useState<number | string>(1080);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextPreset = e.target.value as AspectPreset;
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      const res = PRESET_RESOLUTIONS[nextPreset];
      setWidth(res.width);
      setHeight(res.height);
    }
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isSubmitting) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Project name is required');
      return;
    }
    if (trimmedTitle.length > 60) {
      setError('Project name must be between 1 and 60 characters.');
      return;
    }

    let numWidth = typeof width === 'number' ? width : Number(width);
    let numHeight = typeof height === 'number' ? height : Number(height);

    if (preset === 'custom') {
      if (
        width === '' ||
        height === '' ||
        String(width).trim() === '' ||
        String(height).trim() === '' ||
        isNaN(numWidth) ||
        isNaN(numHeight) ||
        !Number.isInteger(numWidth) ||
        !Number.isInteger(numHeight)
      ) {
        setError('Resolution dimensions must be integers');
        return;
      }
      if (numWidth < 320 || numHeight < 240) {
        setError('Minimum resolution is 320x240');
        return;
      }
      if (numWidth > 3840 || numHeight > 2160) {
        setError('Maximum resolution is 3840x2160 (4K UHD)');
        return;
      }
    } else {
      const res = PRESET_RESOLUTIONS[preset];
      numWidth = res.width;
      numHeight = res.height;
    }

    try {
      setSubmitting(true);
      setError(null);
      const orientation = numWidth >= numHeight ? 'landscape' : 'portrait';
      const submitHandler = onCreate ?? onSubmit;
      if (submitHandler) {
        await submitHandler({
          title: trimmedTitle,
          description: description.trim() || undefined,
          displaySettings: {
            width: numWidth,
            height: numHeight,
            orientation,
            lockAspectRatio: true,
          },
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || isSubmitting;
  const presetIsResolutionError = preset === 'custom' && Boolean(error?.toLowerCase().includes('resolution'));

  return (
    <div
      data-testid="modal-new-project"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 className="text-lg font-semibold tracking-wide">Create New Project</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              autoFocus
              data-testid="input-project-name"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. My First Visual Novel"
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
            />
            {error && (!presetIsResolutionError) && (
              <p data-testid="error-project-name" className="mt-1 text-xs text-red-400">
                {error}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              Aspect Ratio & Resolution
            </label>
            <select
              id="select-canvas-resolution"
              data-testid="select-project-aspect"
              value={preset}
              onChange={handlePresetChange}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-400 focus:outline-none"
            >
              <option value="16:9">Landscape 16:9 (1920 × 1080)</option>
              <option value="9:16">Portrait 9:16 (1080 × 1920) - Mobile</option>
              <option value="4:3">Classic 4:3 (1024 × 768)</option>
              <option value="custom">Custom Resolution</option>
            </select>
          </div>

          {preset === 'custom' && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400">Width (px)</label>
                  <input
                    type="number"
                    data-testid="input-project-width"
                    value={width}
                    onChange={(e) => {
                      setWidth(e.target.value);
                      if (error) setError(null);
                    }}
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400">Height (px)</label>
                  <input
                    type="number"
                    data-testid="input-project-height"
                    value={height}
                    onChange={(e) => {
                      setHeight(e.target.value);
                      if (error) setError(null);
                    }}
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              {error && presetIsResolutionError && (
                <p data-testid="error-project-resolution" className="mt-1 text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              Description (Optional)
            </label>
            <textarea
              data-testid="input-project-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary or premise of your project..."
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              data-testid="btn-cancel-create-project"
              onClick={onClose}
              disabled={busy}
              className="rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-confirm-create-project"
              disabled={busy}
              className="rounded bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50"
            >
              {busy ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
