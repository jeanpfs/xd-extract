import { describe, expect, it } from 'vitest';
import { colorDistance, parseColor, solidCss } from '../src/color';

describe('solidCss', () => {
  it('emits rgb() when alpha is missing or 1', () => {
    expect(solidCss({ mode: 'RGB', value: { r: 255, g: 156, b: 41 } })).toBe('rgb(255,156,41)');
    expect(solidCss({ mode: 'RGB', value: { r: 1, g: 2, b: 3 }, alpha: 1 })).toBe('rgb(1,2,3)');
  });

  it('keeps alpha, which lives beside the colour, as rgba()', () => {
    expect(solidCss({ mode: 'RGB', value: { r: 199, g: 199, b: 199 }, alpha: 0.5019607843137255 })).toBe(
      'rgba(199,199,199,0.502)',
    );
  });
});

describe('parseColor', () => {
  it('parses hex and rgb()', () => {
    expect(parseColor('#ff9c29')).toEqual({ r: 255, g: 156, b: 41 });
    expect(parseColor('#f90')).toEqual({ r: 255, g: 153, b: 0 });
    expect(parseColor('rgb(255, 156, 41)')).toEqual({ r: 255, g: 156, b: 41 });
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual({ r: 1, g: 2, b: 3 });
  });

  it('returns null for non-colours', () => {
    expect(parseColor('orange')).toBeNull();
    expect(parseColor('cart-icon')).toBeNull();
  });

  it('colorDistance is euclidean', () => {
    expect(colorDistance({ r: 0, g: 0, b: 0 }, { r: 3, g: 4, b: 0 })).toBe(5);
  });
});
