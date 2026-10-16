import { describe, it, expect } from 'vitest';
import { isAllowedPreviewOrigin } from '../src/modules/previewBridge';

describe('PreviewBridge Origin Security', () => {
  const configuredPreviewOrigin = 'http://localhost:3000';

  it('allows localhost and 127.0.0.1 default player ports', () => {
    expect(isAllowedPreviewOrigin('http://localhost:3000', configuredPreviewOrigin)).toBe(true);
    expect(isAllowedPreviewOrigin('http://127.0.0.1:3000', configuredPreviewOrigin)).toBe(true);
  });

  it('allows usercontent-platform.com domain variants for sandbox', () => {
    expect(isAllowedPreviewOrigin('https://sub-domain.usercontent-platform.com', configuredPreviewOrigin)).toBe(true);
    expect(isAllowedPreviewOrigin('http://test-123.usercontent-platform.com:8080', configuredPreviewOrigin)).toBe(true);
  });

  it('rejects untrusted third-party origins', () => {
    expect(isAllowedPreviewOrigin('https://malicious-site.com', configuredPreviewOrigin)).toBe(false);
    expect(isAllowedPreviewOrigin('http://localhost:8080', configuredPreviewOrigin)).toBe(false);
  });
});

describe('PreviewBridge URL Building and Project Isolation', () => {
  it('builds preview url with mode=preview, embedded=true, and projectId', async () => {
    const { buildPreviewUrl } = await import('../src/modules/previewBridge');
    const url = buildPreviewUrl('http://localhost:3000', 'proj_alpha');
    expect(url).toContain('mode=preview');
    expect(url).toContain('embedded=true');
    expect(url).toContain('projectId=proj_alpha');
  });

  it('builds popout preview url with popout=true and projectId', async () => {
    const { buildPreviewUrl } = await import('../src/modules/previewBridge');
    const url = buildPreviewUrl('http://localhost:3000', 'proj_beta', { isPopout: true });
    expect(url).toContain('mode=preview');
    expect(url).toContain('popout=true');
    expect(url).toContain('projectId=proj_beta');
    expect(url).not.toContain('embedded=true');
  });
});

