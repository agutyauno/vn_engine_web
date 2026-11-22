import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ToastTone } from '../../core/contracts';
import { usePlayerState } from '../context/PlayerUIContext';
import { AlertCircleIcon, CheckCircleIcon, InfoIcon, type IconProps } from './common/Icons';

const ICON_BY_TONE: Record<ToastTone, (props: IconProps) => JSX.Element> = {
  success: CheckCircleIcon,
  info: InfoIcon,
  error: AlertCircleIcon,
};

export function ToastNotification(): JSX.Element | null {
  const { activeToast } = usePlayerState();
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  if (!activeToast || activeToast.id === dismissedId) {
    return null;
  }

  const handleDismiss = () => {
    setDismissedId(activeToast.id);
  };

  const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      handleDismiss();
    }
  };

  const ToneIcon = ICON_BY_TONE[activeToast.tone] ?? InfoIcon;

  return (
    <div
      id="toast-notification"
      className={`toast-notification toast-${activeToast.tone}`}
      role="status"
      aria-live="polite"
      tabIndex={0}
      title="Click or press Enter to dismiss"
      onClick={handleDismiss}
      onKeyDown={handleKeyDown}
    >
      <span className="toast-icon" data-tone-icon={activeToast.tone} aria-hidden="true">
        <ToneIcon size={16} />
      </span>
      <span className="toast-message">{activeToast.message}</span>
    </div>
  );
}
