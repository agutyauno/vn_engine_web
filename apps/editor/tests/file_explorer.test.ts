import { describe, it, expect } from 'vitest';
import { generateDefaultScriptName, validateFileName } from '../src/modules/fileExplorer';

describe('FileExplorer Utility Logic', () => {
  it('generates Windows-style default script names sequentially', () => {
    const existing = ['main.vns'];
    expect(generateDefaultScriptName(existing)).toBe('New Script.vns');

    const existing2 = ['main.vns', 'New Script.vns'];
    expect(generateDefaultScriptName(existing2)).toBe('New Script (2).vns');

    const existing3 = ['main.vns', 'New Script.vns', 'New Script (2).vns'];
    expect(generateDefaultScriptName(existing3)).toBe('New Script (3).vns');
  });

  it('validates file names against forbidden characters and extensions', () => {
    const existing = ['main.vns', 'intro.vns'];

    // Valid file name without .vns gets .vns appended
    const res1 = validateFileName('chapter1', existing);
    expect(res1.valid).toBe(true);
    expect(res1.normalizedName).toBe('chapter1.vns');

    // Forbidden characters: \ / : * ? " < > |
    const forbidden = ['bad\\name', 'bad/name', 'bad:name', 'bad*name', 'bad?name', 'bad"name', 'bad<name', 'bad>name', 'bad|name'];
    for (const name of forbidden) {
      const res = validateFileName(name, existing);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot contain characters');
    }

    // Duplicate name check
    const resDup = validateFileName('intro.vns', existing);
    expect(resDup.valid).toBe(false);
    expect(resDup.error).toContain('already exists');

    // Empty name check
    const resEmpty = validateFileName('   ', existing);
    expect(resEmpty.valid).toBe(false);
  });
});
