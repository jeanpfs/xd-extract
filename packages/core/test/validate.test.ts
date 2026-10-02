import { describe, expect, it } from 'vitest';
import { validateRaster, validateSameFrame, validateStatic, validateSvg } from '../src/validate';

const svg = (inner: string, vb = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100" height="100">${inner}</svg>`;
const card = '<rect x="0" y="0" width="100" height="100" fill="rgb(255,0,0)"/>';
const codes = (f: { code: string }[]) => f.map((x) => x.code).sort();

describe('validateStatic', () => {
  it('accepts a well-formed SVG', () => {
    expect(validateStatic(svg(card))).toEqual([]);
  });

  it('flags a non-SVG root and a missing viewBox', () => {
    expect(codes(validateStatic('<html/>'))).toEqual(['not-svg']);
    expect(codes(validateStatic('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>'))).toEqual(
      ['no-viewbox'],
    );
  });

  it('flags an SVG with no shapes', () => {
    expect(codes(validateStatic(svg('<g/>')))).toEqual(['empty-svg']);
  });

  it('flags a shape without explicit fill (renders black) unless an ancestor sets fill', () => {
    expect(codes(validateStatic(svg('<rect width="5" height="5"/>')))).toEqual(['shape-missing-fill']);
    expect(validateStatic(svg('<g fill="red"><rect width="5" height="5"/></g>'))).toEqual([]);
  });

  it('does not require fill on clipPath children', () => {
    expect(
      validateStatic(svg(`<defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs>${card}`)),
    ).toEqual([]);
  });

  it('flags a <g> inside a clipPath', () => {
    const f = validateStatic(
      svg(`<defs><clipPath id="c"><g><rect width="5" height="5"/></g></clipPath></defs>${card}`),
    );
    expect(codes(f)).toEqual(['group-in-clippath']);
  });

  it('flags a <line> without stroke unless an ancestor sets stroke', () => {
    expect(codes(validateStatic(svg(`${card}<line x1="0" y1="0" x2="5" y2="5" fill="none"/>`)))).toEqual([
      'line-without-stroke',
    ]);
    expect(
      validateStatic(svg(`${card}<g stroke="#000"><line x1="0" y1="0" x2="5" y2="5" fill="none"/></g>`)),
    ).toEqual([]);
  });

  it('flags NaN and Infinity in attributes', () => {
    expect(codes(validateStatic(svg(`<path d="M 0 0 L NaN 4 Z" fill="red"/>`)))).toEqual(['nan-number']);
  });

  it('maps extraction warnings: unsupported paint is an error, the rest are warnings', () => {
    const f = validateStatic(svg(card), [
      { code: 'unsupported-fill:gradient', message: 'g', count: 2 },
      { code: 'skipped-text', message: 't', count: 3 },
    ]);
    expect(f).toEqual([
      expect.objectContaining({ code: 'extraction:unsupported-fill:gradient', severity: 'error' }),
      expect.objectContaining({ code: 'extraction:skipped-text', severity: 'warn' }),
    ]);
  });
});

describe('validateRaster', () => {
  it('flags an essentially empty render', () => {
    const f = validateRaster(svg('<rect x="0" y="0" width="1" height="1" fill="#000"/>'));
    expect(codes(f)).toEqual(['render-empty']);
    expect(f[0]!.severity).toBe('error');
  });

  it('accepts a full card and a centred icon with margins', () => {
    expect(validateRaster(svg(card))).toEqual([]);
    expect(validateRaster(svg('<rect x="30" y="30" width="40" height="40" fill="#000"/>'))).toEqual([]);
  });

  it('warns on the mask-drift signature: one edge band empty, the opposite painted', () => {
    const f = validateRaster(svg('<rect x="0" y="0" width="100" height="70" fill="#000"/>'));
    expect(f).toEqual([expect.objectContaining({ code: 'edge-band-drift', severity: 'warn' })]);
    expect(f[0]!.message).toContain('bottom');
  });

  it('warns about a tight frame only when the frame came from the content box', () => {
    expect(validateRaster(svg(card), { rule: 'plate' })).toEqual([]);
    expect(codes(validateRaster(svg(card), { rule: 'content' }))).toEqual(['tight-frame']);
  });
});

describe('validateSvg', () => {
  it('combines static and raster findings', () => {
    expect(validateSvg(svg(card))).toEqual([]);
    expect(codes(validateSvg(svg('<rect x="0" y="0" width="1" height="1"/>')))).toEqual([
      'render-empty',
      'shape-missing-fill',
    ]);
  });

  it('reports malformed XML as an error and does not crash', () => {
    const f = validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g></svg>');
    expect(f.some((x) => x.severity === 'error' && ['xml-invalid', 'render-failed'].includes(x.code))).toBe(
      true,
    );
  });
});

describe('validateSameFrame', () => {
  it('flags frames whose size differs from the first by more than the tolerance', () => {
    const f = validateSameFrame([
      { file: 'a.svg', viewBox: '0 0 100 100' },
      { file: 'b.svg', viewBox: '5 5 100.5 99.2' },
      { file: 'c.svg', viewBox: '0 0 100 130' },
    ]);
    expect(f).toEqual([
      expect.objectContaining({ code: 'frame-mismatch', file: 'c.svg', severity: 'error' }),
    ]);
  });

  it('is silent for a single file', () => {
    expect(validateSameFrame([{ file: 'a.svg', viewBox: '0 0 1 1' }])).toEqual([]);
  });
});
