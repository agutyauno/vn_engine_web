import type { JSX } from 'preact';
import type { GameBundleError } from '../../adapters/gameBundleLoader';
import { AlertCircleIcon } from './common/Icons';

export type GameDataErrorCode = 'not_found' | GameBundleError | 'invalid_json' | 'fetch_failed';

export interface GameDataErrorScreenProps {
  error: GameDataErrorCode;
}

/**
 * Trả về tiêu đề và mô tả tiếng Anh tương ứng với từng mã lỗi.
 */
function getErrorDetails(error: GameDataErrorCode): { title: string; description: string } {
  if (error === 'not_found') {
    return {
      title: 'No game data found',
      description: 'No published game data (project.json or embedded bundle) was found.',
    };
  }

  let description: string;
  switch (error) {
    case 'unsupported_version':
      description = 'The game bundle format version is not supported by this player.';
      break;
    case 'invalid_json':
      description = 'The game bundle file contains malformed or unparseable JSON.';
      break;
    case 'fetch_failed':
      description = 'Failed to load project.json from the network or server.';
      break;
    case 'invalid_field':
      description = 'The game bundle is missing required fields or has invalid attributes.';
      break;
    case 'not_object':
      description = 'The game bundle payload is not a valid JSON object.';
      break;
  }

  return {
    title: 'Could not load game data',
    description,
  };
}

/**
 * Màn hình thông báo lỗi khi không thể nạp bundle dữ liệu game.
 * Tuân thủ Clean Monochrome Iconography, không emoji, không inline SVG.
 */
export function GameDataErrorScreen({ error }: GameDataErrorScreenProps): JSX.Element {
  const { title, description } = getErrorDetails(error);

  return (
    <div id="game-data-error" className="game-data-error-screen" role="alert">
      <div className="game-data-error-card">
        <div className="game-data-error-icon" aria-hidden="true">
          <AlertCircleIcon size={48} />
        </div>
        <h1 className="game-data-error-title">{title}</h1>
        <p className="game-data-error-description">{description}</p>
        <p className="game-data-error-meta">
          <code className="game-data-error-code">{error}</code>
        </p>
      </div>
    </div>
  );
}
