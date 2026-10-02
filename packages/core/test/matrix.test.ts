import { describe, expect, it } from 'vitest';
import { apply, IDENTITY, isIdentity, matrixAttr, mul, round, translate } from '../src/matrix';

describe('matrix', () => {
  it('mul(m, n) applies n first, then m', () => {
    const scale2: [number, number, number, number, number, number] = [2, 0, 0, 2, 0, 0];
    expect(apply(mul(translate(10, 5), scale2), 1, 1)).toEqual([12, 7]);
  });

  it('identity is neutral', () => {
    expect(mul(IDENTITY, translate(3, 4))).toEqual(translate(3, 4));
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(translate(0, 1))).toBe(false);
  });

  it('round keeps 3 decimals and matrixAttr formats for SVG', () => {
    expect(round(1.23456)).toBe(1.235);
    expect(matrixAttr([1, 0, 0, 1, 10.12349, -3])).toBe('matrix(1 0 0 1 10.123 -3)');
  });
});
