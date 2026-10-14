import { describe, expect, it } from 'vitest';
import { estimateWidth } from '../src/metrics';

describe('estimateWidth', () => {
  it('sums the Helvetica advance widths, scaled by the size', () => {
    // H 722 + i 222 = 944 per 1000 em
    expect(estimateWidth('Hi', 20, 400, 0)).toBeCloseTo(18.88, 6);
    expect(estimateWidth('', 20, 400, 0)).toBe(0);
  });

  it('knows that an "i" is narrower than an "m"', () => {
    expect(estimateWidth('iiii', 10, 400, 0)).toBeLessThan(estimateWidth('mmmm', 10, 400, 0) / 3);
  });

  it('makes bold text wider, and adds the letter spacing after every character', () => {
    const regular = estimateWidth('Hello', 16, 400, 0);
    expect(estimateWidth('Hello', 16, 700, 0)).toBeGreaterThan(regular);
    expect(estimateWidth('Hello', 16, 400, 1)).toBeCloseTo(regular + 5, 6);
  });

  it('falls back to 0.6 em for other Latin characters and a full em for CJK, counted by code point', () => {
    expect(estimateWidth('é', 10, 400, 0)).toBeCloseTo(6, 6);
    expect(estimateWidth('日本', 10, 400, 0)).toBeCloseTo(20, 6);
    expect(estimateWidth('😀', 10, 400, 0)).toBeCloseTo(6, 6);
  });
});
