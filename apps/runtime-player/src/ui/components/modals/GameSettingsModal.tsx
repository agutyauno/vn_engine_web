import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import type { DialogueFontSize } from '../../../core/contracts';
import {
  BookOpenIcon,
  CloseIcon,
  EyeIcon,
  KeyboardIcon,
  SettingsIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from '../common/Icons';
import type { IconProps } from '../common/Icons';

type SettingsTab = 'audio' | 'text' | 'display' | 'shortcuts';

const TABS: ReadonlyArray<{
  id: SettingsTab;
  label: string;
  Icon: (props: IconProps) => JSX.Element;
}> = [
  { id: 'audio', label: 'Audio', Icon: VolumeIcon },
  { id: 'text', label: 'Text & Playback', Icon: BookOpenIcon },
  { id: 'display', label: 'Display', Icon: EyeIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: KeyboardIcon },
];

const FONT_SIZES: ReadonlyArray<{ id: DialogueFontSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/** Separator between keys in the legend; any plain string is a key rendered in `<kbd>`. */
interface LegendSep {
  sep: string;
}
type LegendToken = string | LegendSep;
const OR: LegendSep = { sep: '/' };
const TO: LegendSep = { sep: '–' };
const THEN: LegendSep = { sep: '+' };

/**
 * Reference-only legend. Lists only controls that exist in GameplayOverlay
 * and ChoiceOverlay (spec 7.6).
 */
const SHORTCUTS: ReadonlyArray<{ keys: ReadonlyArray<LegendToken>; action: string }> = [
  { keys: ['Space', OR, 'Enter', OR, '→'], action: 'Advance / complete dialogue' },
  { keys: ['←', OR, 'PageUp'], action: 'Rollback to previous line' },
  { keys: ['A'], action: 'Toggle auto forward' },
  { keys: ['S', OR, 'Tab'], action: 'Toggle skip (seen text only)' },
  { keys: ['L'], action: 'Open / close dialogue log (backlog)' },
  { keys: ['H'], action: 'Hide all UI (press any key or click to restore)' },
  { keys: ['Right Click'], action: 'Hide system controls' },
  { keys: ['Esc'], action: 'Open settings / close window' },
  { keys: ['1', TO, '9'], action: 'Select choice by number' },
  { keys: ['↑', OR, '↓', THEN, 'Enter'], action: 'Move choice focus and confirm' },
];

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog.';
const PREVIEW_DWELL_MS = 1500;

interface RangeRowProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onValue: (raw: string) => void;
}

function RangeRow({ id, label, min, max, step, value, display, onValue }: RangeRowProps) {
  const handle = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => onValue(e.currentTarget.value);
  return (
    <div className="setting-row">
      <label htmlFor={id}>{label}</label>
      <div className="setting-control">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={handle}
          onChange={handle}
        />
        <span className="slider-val">{display}</span>
      </div>
    </div>
  );
}

const percent = (v: number): string => `${Math.round(v * 100)}%`;

function toggleFullscreen(): void {
  if (typeof document === 'undefined' || !document.fullscreenEnabled) return;
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function GameSettingsModal(): JSX.Element {
  const { mode, audio, settings } = usePlayerState();
  const actions = usePlayerActions();
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [previewCharCount, setPreviewCharCount] = useState(0);

  const masterVol = audio?.masterVolume ?? 1.0;
  const musicVol = audio?.channelVolumes?.music ?? 0.8;
  const soundVol = audio?.channelVolumes?.sound ?? 0.8;
  const voiceVol = audio?.channelVolumes?.voice ?? 1.0;
  const isMuted = audio?.isMuted ?? false;
  const textSpeed = settings?.textSpeed ?? 40;
  const autoDelay = settings?.autoDelayMs ?? 1500;
  const fontSize = settings?.fontSize ?? 'medium';
  const boxOpacity = settings?.boxOpacity ?? 0.85;

  // Own Escape listener (capture phase) so the modal closes on TitleScreen too,
  // and stopImmediatePropagation keeps GameplayOverlay from handling it again.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (showReturnConfirm) {
        setShowReturnConfirm(false);
      } else {
        actions.closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showReturnConfirm, actions]);

  // Live typewriter preview: types the sample at 1000/speed ms per char, waits
  // PREVIEW_DWELL_MS at the end, then loops. Timers are cleared on tab switch/unmount.
  useEffect(() => {
    if (activeTab !== 'text') return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const intervalMs = Math.max(10, 1000 / textSpeed);

    const runStep = (charIndex: number) => {
      if (charIndex > SAMPLE_TEXT.length) {
        timeoutId = setTimeout(() => {
          setPreviewCharCount(0);
          timeoutId = setTimeout(() => runStep(1), intervalMs);
        }, PREVIEW_DWELL_MS);
        return;
      }
      setPreviewCharCount(charIndex);
      timeoutId = setTimeout(() => runStep(charIndex + 1), intervalMs);
    };

    setPreviewCharCount(0);
    timeoutId = setTimeout(() => runStep(1), intervalMs);

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [activeTab, textSpeed]);

  return (
    <div
      id="modal-game-settings"
      className="modal-game-settings wf-modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) actions.closeModal();
      }}
    >
      <div className="modal-settings-window settings-menu-modal">
        <div className="wf-modal-header modal-settings-header">
          <div className="settings-title-group">
            <SettingsIcon size={18} />
            <h2 className="wf-modal-title">GAME SETTINGS</h2>
          </div>
          <button
            id="btn-close-settings"
            className="btn-close-settings"
            onClick={() => actions.closeModal()}
            aria-label="Close settings"
            title="Close"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="settings-split-body">
          <nav className="settings-sidebar" aria-label="Settings categories">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`tab-btn-${id}`}
                className={`settings-tab-btn${activeTab === id ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-pane-container">
            {activeTab === 'audio' && (
              <section id="pane-audio" className="settings-pane active">
                <RangeRow
                  id="slider-volume-master"
                  label="Master Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={masterVol}
                  display={percent(masterVol)}
                  onValue={raw => actions.setAudioVolume('master', parseFloat(raw))}
                />
                <div className="setting-row">
                  <span className="setting-label">Mute Audio</span>
                  <button
                    id="btn-toggle-mute"
                    className={`wf-btn wf-btn-icon${isMuted ? ' active' : ''}`}
                    onClick={() => actions.toggleMute()}
                    aria-label="Mute audio"
                    aria-pressed={isMuted}
                  >
                    {isMuted ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
                    <span>{isMuted ? 'Muted' : 'Unmuted'}</span>
                  </button>
                </div>
                <RangeRow
                  id="slider-volume-music"
                  label="Music Volume (BGM)"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVol}
                  display={percent(musicVol)}
                  onValue={raw => actions.setAudioVolume('music', parseFloat(raw))}
                />
                <RangeRow
                  id="slider-volume-sound"
                  label="Sound Effects (SFX)"
                  min={0}
                  max={1}
                  step={0.05}
                  value={soundVol}
                  display={percent(soundVol)}
                  onValue={raw => actions.setAudioVolume('sound', parseFloat(raw))}
                />
                <RangeRow
                  id="slider-volume-voice"
                  label="Voice Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voiceVol}
                  display={percent(voiceVol)}
                  onValue={raw => actions.setAudioVolume('voice', parseFloat(raw))}
                />
              </section>
            )}

            {activeTab === 'text' && (
              <section id="pane-text" className="settings-pane active">
                <RangeRow
                  id="slider-text-speed"
                  label="Text Speed"
                  min={1}
                  max={100}
                  step={1}
                  value={textSpeed}
                  display={`${textSpeed} chars/s`}
                  onValue={raw => actions.setTextSpeed(parseInt(raw, 10))}
                />
                <div className="typewriter-preview-container">
                  <div className="settings-hint">Live Typewriter Preview</div>
                  <div id="preview-typewriter-box" className="preview-typewriter-box">
                    {SAMPLE_TEXT.slice(0, previewCharCount)}
                    <span className="typewriter-cursor" aria-hidden="true">
                      |
                    </span>
                  </div>
                </div>
                <RangeRow
                  id="slider-auto-delay"
                  label="Auto Forward Delay"
                  min={500}
                  max={5000}
                  step={100}
                  value={autoDelay}
                  display={`${(autoDelay / 1000).toFixed(1)}s`}
                  onValue={raw => actions.setAutoDelay(parseInt(raw, 10))}
                />
                <p className="settings-hint">
                  Skip mode only skips dialogue you have already read.
                </p>
              </section>
            )}

            {activeTab === 'display' && (
              <section id="pane-display" className="settings-pane active">
                <div className="setting-row">
                  <span className="setting-label">Screen Mode</span>
                  <button
                    id="btn-toggle-fullscreen"
                    className="wf-btn"
                    onClick={toggleFullscreen}
                    aria-label="Toggle Fullscreen"
                    title="Toggle Fullscreen"
                  >
                    Toggle Fullscreen
                  </button>
                </div>
                <div className="setting-row">
                  <span className="setting-label">Dialogue Font Size</span>
                  <div className="setting-control" role="group" aria-label="Dialogue font size">
                    {FONT_SIZES.map(({ id, label }) => (
                      <button
                        key={id}
                        id={`btn-font-${id}`}
                        className={`wf-btn${fontSize === id ? ' active' : ''}`}
                        aria-pressed={fontSize === id}
                        onClick={() => actions.setFontSize(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <RangeRow
                  id="slider-box-opacity"
                  label="Dialogue Box Opacity"
                  min={0.6}
                  max={1}
                  step={0.05}
                  value={boxOpacity}
                  display={percent(boxOpacity)}
                  onValue={raw => actions.setBoxOpacity(parseFloat(raw))}
                />
              </section>
            )}

            {activeTab === 'shortcuts' && (
              <section id="pane-shortcuts" className="settings-pane active">
                <dl className="shortcut-legend">
                  {SHORTCUTS.map(({ keys, action }) => (
                    <div key={action} className="shortcut-row">
                      <dt className="shortcut-keys">
                        {keys.map((token, i) =>
                          typeof token === 'string' ? (
                            <kbd key={i}>{token}</kbd>
                          ) : (
                            <span key={i} className="shortcut-sep">
                              {token.sep}
                            </span>
                          ),
                        )}
                      </dt>
                      <dd className="shortcut-action">{action}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-footer-group">
            <button
              id="btn-restore-defaults"
              className="wf-btn"
              onClick={() => actions.restoreDefaultSettings()}
            >
              Restore Defaults
            </button>
            {mode === 'GAMEPLAY' && (
              <button
                id="btn-settings-load"
                className="wf-btn"
                onClick={() => actions.openModal('load')}
              >
                Load Game
              </button>
            )}
            {mode === 'GAMEPLAY' && (
              <button
                id="btn-return-title"
                className="wf-btn wf-btn-danger"
                onClick={() => setShowReturnConfirm(true)}
              >
                Return to Title
              </button>
            )}
          </div>
          <button
            id="btn-done-settings"
            className="wf-btn wf-btn-primary"
            onClick={() => actions.closeModal()}
          >
            Close
          </button>
        </div>

        {showReturnConfirm && (
          <div className="settings-confirm-overlay">
            <div
              className="settings-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-confirm-message"
            >
              <p id="settings-confirm-message">
                Are you sure you want to return to the Title Screen? Any unsaved progress will be
                lost.
              </p>
              <div className="settings-confirm-actions">
                <button
                  id="btn-confirm-return"
                  className="wf-btn wf-btn-danger"
                  onClick={() => {
                    actions.closeModal();
                    actions.returnToTitle();
                  }}
                >
                  Return to Title
                </button>
                <button
                  id="btn-cancel-return"
                  className="wf-btn"
                  onClick={() => setShowReturnConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
