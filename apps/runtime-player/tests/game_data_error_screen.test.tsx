import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import type { GameBundleError } from '../src/adapters/gameBundleLoader';
import { GameDataErrorScreen } from '../src/ui/components/GameDataErrorScreen';

type ErrorCode = 'not_found' | GameBundleError | 'invalid_json' | 'fetch_failed';

afterEach(() => {
  cleanup();
});

describe('GameDataErrorScreen component (Phase L2b RED)', () => {
  describe('Accessibility and root element structure', () => {
    it('renders #game-data-error element with role="alert"', () => {
      const { container } = render(<GameDataErrorScreen error="not_found" />);
      const errorRoot = container.querySelector('#game-data-error');
      expect(errorRoot).not.toBeNull();
      expect(errorRoot?.getAttribute('role')).toBe('alert');
    });
  });

  describe('Heading and title messaging based on error state', () => {
    it('renders "No game data found" title when error is "not_found"', () => {
      const { container } = render(<GameDataErrorScreen error="not_found" />);
      const errorRoot = container.querySelector('#game-data-error');
      expect(errorRoot).not.toBeNull();
      expect(errorRoot?.textContent).toContain('No game data found');
      expect(errorRoot?.textContent).not.toContain('Could not load game data');
    });

    const OTHER_ERRORS: ErrorCode[] = [
      'unsupported_version',
      'invalid_field',
      'not_object',
      'invalid_json',
      'fetch_failed',
    ];

    it.each(OTHER_ERRORS)(
      'renders "Could not load game data" title when error is "%s"',
      errorCode => {
        const { container } = render(<GameDataErrorScreen error={errorCode} />);
        const errorRoot = container.querySelector('#game-data-error');
        expect(errorRoot).not.toBeNull();
        expect(errorRoot?.textContent).toContain('Could not load game data');
        expect(errorRoot?.textContent).not.toContain('No game data found');
      },
    );
  });

  describe('Error code element display (.game-data-error-code)', () => {
    const ALL_ERRORS: ErrorCode[] = [
      'not_found',
      'unsupported_version',
      'invalid_field',
      'not_object',
      'invalid_json',
      'fetch_failed',
    ];

    it.each(ALL_ERRORS)('displays error code "%s" inside .game-data-error-code', errorCode => {
      const { container } = render(<GameDataErrorScreen error={errorCode} />);
      const codeElement = container.querySelector('.game-data-error-code');
      expect(codeElement).not.toBeNull();
      expect(codeElement?.textContent).toContain(errorCode);
    });
  });

  describe('UI hygiene and Clean Monochrome Iconography', () => {
    it('source file contains no inline <svg tags (must import from Icons.tsx)', () => {
      const filePath = resolve(__dirname, '../src/ui/components/GameDataErrorScreen.tsx');
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toContain('<svg');
    });

    it('renders monochrome icon with stroke="currentColor"', () => {
      const { container } = render(<GameDataErrorScreen error="fetch_failed" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
    });

    it('contains no emoji characters in rendered textContent across all error variants', () => {
      const emojiRegex = /\p{Extended_Pictographic}/u;
      const ALL_ERRORS: ErrorCode[] = [
        'not_found',
        'unsupported_version',
        'invalid_field',
        'not_object',
        'invalid_json',
        'fetch_failed',
      ];

      for (const errorCode of ALL_ERRORS) {
        const { container } = render(<GameDataErrorScreen error={errorCode} />);
        const root = container.querySelector('#game-data-error');
        expect(root).not.toBeNull();
        expect(root?.textContent ?? '').not.toMatch(emojiRegex);
      }
    });
  });
});
