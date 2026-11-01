import type { JSX } from 'preact';

export function PreviewStandbyScreen(): JSX.Element {
  return (
    <div id="preview-standby-screen" className="preview-standby-screen">
      <div className="standby-box">
        <div className="standby-status-pill">LIVE PREVIEW STANDBY</div>
        <div className="standby-title">Live Preview Connected</div>
        <div className="standby-desc">Waiting for script from Studio Editor...</div>
      </div>
    </div>
  );
}
