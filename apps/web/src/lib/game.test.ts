import { describe, expect, it } from 'vitest';
import { playerLevel } from '@vq/game-engine/core';
import { CRITERIA_MAX, criterionLabel, levelProgress, outfitUnlockLevel, outfitUnlocked, scoreTone } from './game';

describe('levelProgress', () => {
  it('matches the server level formula for many XP values', () => {
    for (let xp = 0; xp < 20000; xp += 37) {
      const p = levelProgress(xp);
      const s = playerLevel(xp);
      expect(p.level, String(xp)).toBe(s.level);
      expect(p.nextAt).toBe(s.nextAt);
      expect(xp).toBeGreaterThanOrEqual(p.start);
      expect(xp).toBeLessThan(p.nextAt);
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThanOrEqual(1);
    }
  });
  it('level 1 starts at 0 and level 2 at 200', () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, start: 0, nextAt: 200, ratio: 0 });
    expect(levelProgress(200)).toMatchObject({ level: 2, start: 200, nextAt: 450 });
    expect(levelProgress(325).ratio).toBeCloseTo(0.5);
  });
});

describe('avatar unlocks', () => {
  it('outfit i needs player level i + 1 (same rule as PATCH /api/me)', () => {
    expect(outfitUnlockLevel('classic')).toBe(1);
    expect(outfitUnlockLevel('scarf')).toBe(2);
    expect(outfitUnlockLevel('astronaut')).toBe(6);
    expect(outfitUnlocked('cape', 2)).toBe(false);
    expect(outfitUnlocked('cape', 3)).toBe(true);
  });
});

describe('criteria', () => {
  it('uses the rubric maxima', () => {
    expect(Object.values(CRITERIA_MAX.writing).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(CRITERIA_MAX.speaking).reduce((a, b) => a + b, 0)).toBe(100);
    expect(CRITERIA_MAX.speaking.pronunciation).toBe(15);
  });
  it('never turns a missing score into a number', () => {
    expect(criterionLabel({ score: null, max: 25 })).toBeNull();
    expect(criterionLabel({ score: 0, max: 25 })).toBe('0/25');
    expect(scoreTone(null)).toBe('none');
    expect(scoreTone(49)).toBe('low');
    expect(scoreTone(74)).toBe('mid');
    expect(scoreTone(75)).toBe('high');
  });
});
