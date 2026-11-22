// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StudioHeader } from '../src/components/studio/StudioHeader';

describe('StudioHeader Preview Start Mode Button (TASK-editor-title-branding E5)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders btn-preview-start-mode with aria-pressed="true", text "Title", and title attribute when previewStartMode is "title"', () => {
    render(
      <StudioHeader
        projectTitle="Test Project"
        onQuickPlay={vi.fn()}
        previewStartMode="title"
        onTogglePreviewStartMode={vi.fn()}
      />,
    );

    const modeBtn = screen.getByTestId('btn-preview-start-mode');
    expect(modeBtn).toBeInTheDocument();
    expect(modeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(modeBtn).toHaveTextContent('Title');
    expect(modeBtn.getAttribute('title')).toBeTruthy();
  });

  it('renders btn-preview-start-mode with aria-pressed="false", text "Scene", and title attribute when previewStartMode is "scene"', () => {
    render(
      <StudioHeader
        projectTitle="Test Project"
        onQuickPlay={vi.fn()}
        previewStartMode="scene"
        onTogglePreviewStartMode={vi.fn()}
      />,
    );

    const modeBtn = screen.getByTestId('btn-preview-start-mode');
    expect(modeBtn).toBeInTheDocument();
    expect(modeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(modeBtn).toHaveTextContent('Scene');
    expect(modeBtn.getAttribute('title')).toBeTruthy();
  });

  it('invokes onTogglePreviewStartMode exactly once when clicked', () => {
    const handleToggle = vi.fn();
    render(
      <StudioHeader
        projectTitle="Test Project"
        onQuickPlay={vi.fn()}
        previewStartMode="scene"
        onTogglePreviewStartMode={handleToggle}
      />,
    );

    const modeBtn = screen.getByTestId('btn-preview-start-mode');
    fireEvent.click(modeBtn);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('does not render btn-preview-start-mode when onQuickPlay is not provided', () => {
    render(
      <StudioHeader
        projectTitle="Test Project"
        previewStartMode="title"
        onTogglePreviewStartMode={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('btn-preview-start-mode')).not.toBeInTheDocument();
  });

  it('strictly satisfies Rule 8: zero colored OS emojis in rendered output', () => {
    const { container } = render(
      <StudioHeader
        projectTitle="Test Project"
        onQuickPlay={vi.fn()}
        previewStartMode="title"
        onTogglePreviewStartMode={vi.fn()}
      />,
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(container.innerHTML).not.toMatch(emojiRegex);
  });
});
