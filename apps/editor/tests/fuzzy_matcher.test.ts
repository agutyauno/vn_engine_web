import { describe, it, expect } from 'vitest';
import { findClosestMatches } from '../src/core/utils/fuzzyMatcher';

describe('Unit Tests: Fuzzy Typo Matcher (Levenshtein Distance with Pruning)', () => {
  // TC-FUZZY-01: Returns accurate distance for script typos
  describe('TC-FUZZY-01: Distance Calculation for Script Typos', () => {
    it('should find single-character deletion typos (dist 1)', () => {
      const candidates = ['alice', 'bob', 'charlie'];
      const matches = findClosestMatches('alce', candidates);
      expect(matches).toContain('alice');
      expect(matches[0]).toBe('alice');
    });

    it('should find single-character substitution typos (dist 1)', () => {
      const candidates = ['bg_school', 'bg_classroom', 'bg_corridor'];
      const matches = findClosestMatches('bg_scholl', candidates);
      expect(matches).toContain('bg_school');
      expect(matches[0]).toBe('bg_school');
    });

    it('should find single-character insertion typos (dist 1)', () => {
      const candidates = ['score', 'health', 'level'];
      const matches = findClosestMatches('scoree', candidates);
      expect(matches).toContain('score');
      expect(matches[0]).toBe('score');
    });

    it('should match transposition or two edits within default maxDistance = 2', () => {
      const candidates = ['school', 'park', 'market'];
      const matches = findClosestMatches('shcool', candidates);
      expect(matches).toContain('school');
    });

    it('should handle exact match with distance 0 at highest priority', () => {
      const candidates = ['score', 'scores', 'scoreboard'];
      const matches = findClosestMatches('score', candidates);
      expect(matches[0]).toBe('score');
    });
  });

  // TC-FUZZY-02: Length pruning for candidates exceeding maxDistance
  describe('TC-FUZZY-02: Early Length Pruning', () => {
    it('should prune candidates whose length difference exceeds default maxDistance (2)', () => {
      const candidates = [
        'bg_school_courtyard_day_extra_long', // len diff >> 2
        'bg_school',                          // len diff 0
        'b',                                  // len diff 8
      ];
      const matches = findClosestMatches('bg_scholl', candidates);
      expect(matches).toEqual(['bg_school']);
      expect(matches).not.toContain('bg_school_courtyard_day_extra_long');
      expect(matches).not.toContain('b');
    });

    it('should prune candidate with diff > 1 when maxDistance is explicitly set to 1', () => {
      const candidates = ['alice', 'alicia']; // 'alicia' len 6, 'alic' len 4, diff 2 > 1
      const matches = findClosestMatches('alic', candidates, 1);
      expect(matches).toEqual(['alice']);
      expect(matches).not.toContain('alicia');
    });
  });

  // TC-FUZZY-03: Max results limit & ascending distance ordering
  describe('TC-FUZZY-03: Results Limit & Ordering', () => {
    it('should limit returned results to maxResults (default = 2)', () => {
      const candidates = ['vari', 'val', 'vars', 'var_extra'];
      const matches = findClosestMatches('var', candidates, 2, 2);
      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it('should order results by ascending Levenshtein distance', () => {
      const candidates = ['alicia', 'alice', 'unrelated'];
      const matches = findClosestMatches('alic', candidates, 2, 2);
      expect(matches.length).toBe(2);
      expect(matches[0]).toBe('alice');   // dist 1
      expect(matches[1]).toBe('alicia');  // dist 2
    });

    it('should return empty array if no candidate is within maxDistance', () => {
      const candidates = ['classroom', 'hospital', 'rooftop'];
      const matches = findClosestMatches('garden', candidates, 2);
      expect(matches).toEqual([]);
    });
  });

  // Edge cases & Boundaries
  describe('Edge Cases & Zero-Trust Safety', () => {
    it('should perform case-insensitive comparison while preserving original candidate casing', () => {
      const candidates = ['Alice', 'Bob'];
      const matches = findClosestMatches('ALCE', candidates);
      expect(matches).toEqual(['Alice']);
    });

    it('should return empty array when query is empty or whitespace-only', () => {
      expect(findClosestMatches('', ['alice', 'bob'])).toEqual([]);
      expect(findClosestMatches('   ', ['alice', 'bob'])).toEqual([]);
    });

    it('should return empty array when candidate list is empty', () => {
      expect(findClosestMatches('alice', [])).toEqual([]);
    });

    it('should handle special characters in identifiers gracefully', () => {
      const candidates = ['bg_sunset_01', 'bg_sunset_02', 'bg_rain'];
      const matches = findClosestMatches('bg_sunset_0', candidates);
      expect(matches).toContain('bg_sunset_01');
      expect(matches).toContain('bg_sunset_02');
    });
  });
});

