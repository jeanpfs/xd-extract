import { agcDoc, argb, circle, group, rect, solid, text, withTransform } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { XdError } from '../src/errors';
import type { IrGroup, IrShape, IrText } from '../src/ir';
import { parseAgc } from '../src/parse';

const only = (roots: ReturnType<typeof parseAgc>) => {
  expect(roots).toHaveLength(1);
  return roots[0]!;
};

describe('parseAgc roots', () => {
  it('reads artboard roots from children[0].artboard.children', () => {
    const roots = parseAgc(agcDoc([group('A', [rect('r', 0, 0, 1, 1, { fill: solid(1, 2, 3) })])]));
    expect(roots.map((r) => r.node.name)).toEqual(['A']);
  });

  it('reads pasteboard roots straight from children', () => {
    const roots = parseAgc({ version: '1.5.0', children: [group('P', [])] });
    expect(roots.map((r) => r.node.name)).toEqual(['P']);
  });

  it('rejects a document without children', () => {
    expect(() => parseAgc({ version: '1.5.0' })).toThrowError(XdError);
  });

  it('warns on an untested AGC version', () => {
    const doc = agcDoc([rect('r', 0, 0, 1, 1, { fill: solid(1, 2, 3) })]);
    doc.version = '2.0.0';
    expect(only(parseAgc(doc)).warnings.map((w) => w.code)).toContain('agc-version-untested:2.0.0');
  });
});

describe('style resolution', () => {
  it('inherits fill and stroke width from the group, but a child "none" clears fill', () => {
    const doc = agcDoc([
      group(
        'G',
        [
          rect('inherits', 0, 0, 10, 10),
          rect('cleared', 0, 0, 10, 10, {
            fill: { type: 'none' },
            stroke: { type: 'solid', color: solid(0, 0, 0).color },
          }),
        ],
        { style: { fill: solid(9, 8, 7), stroke: { type: 'solid', color: solid(1, 1, 1).color, width: 4 } } },
      ),
    ]);
    const g = only(parseAgc(doc)).node as IrGroup;
    const [inherits, cleared] = g.children as IrShape[];
    expect(inherits!.fill).toEqual({ kind: 'solid', css: 'rgb(9,8,7)' });
    expect(inherits!.ownFill).toBe(false);
    expect(inherits!.stroke?.width).toBe(4);
    expect(cleared!.fill).toBeNull();
    expect(cleared!.stroke?.width).toBe(4);
  });

  it('moves a line colour from fill to stroke and defaults the width to 1', () => {
    const line = {
      type: 'shape',
      name: 'L',
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      shape: { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      style: { fill: solid(5, 6, 7) },
    };
    const s = only(parseAgc(agcDoc([line]))).node as IrShape;
    expect(s.fill).toBeNull();
    expect(s.stroke).toEqual({ paint: { kind: 'solid', css: 'rgb(5,6,7)' }, width: 1 });
  });

  it('copies cap, join, miterLimit and dash from the shape own stroke', () => {
    const r = rect('r', 0, 0, 5, 5, {
      stroke: {
        type: 'solid',
        color: solid(0, 0, 0).color,
        width: 2,
        cap: 'round',
        join: 'bevel',
        miterLimit: 4,
        dash: [3, 1],
      },
    });
    const s = only(parseAgc(agcDoc([r]))).node as IrShape;
    expect(s.stroke).toMatchObject({ width: 2, cap: 'round', join: 'bevel', miterLimit: 4, dash: [3, 1] });
  });
});

describe('unsupported content is reported, never silent', () => {
  it('flags gradient and pattern fills and keeps them as unsupported paint', () => {
    const doc = agcDoc([
      group('G', [
        rect('g', 0, 0, 5, 5, { fill: { type: 'gradient' } }),
        rect('p', 0, 0, 5, 5, { fill: { type: 'pattern' } }),
      ]),
    ]);
    const { node, warnings } = only(parseAgc(doc));
    expect((node as IrGroup).children.map((c) => (c as IrShape).fill)).toEqual([
      { kind: 'unsupported', reason: 'gradient' },
      { kind: 'unsupported', reason: 'pattern' },
    ]);
    expect(warnings.map((w) => w.code).sort()).toEqual([
      'unsupported-fill:gradient',
      'unsupported-fill:pattern',
    ]);
  });

  it('skips text with a counted warning and flags unknown node and shape types', () => {
    const doc = agcDoc([
      group('G', [
        { type: 'text', name: 't1' },
        { type: 'text', name: 't2' },
        { type: 'weird', name: 'w' },
        { type: 'shape', name: 's', shape: { type: 'star' } },
      ]),
    ]);
    const { node, warnings } = only(parseAgc(doc));
    expect((node as IrGroup).children).toHaveLength(0);
    const byCode = Object.fromEntries(warnings.map((w) => [w.code, w.count]));
    expect(byCode).toEqual({ 'skipped-text': 2, 'unsupported-node:weird': 1, 'unsupported-shape:star': 1 });
  });

  it('flags filters, style.clipPath and non-centre stroke alignment', () => {
    const r = rect('r', 0, 0, 5, 5, {
      fill: solid(1, 1, 1),
      filters: [{ type: 'dropShadow' }],
      clipPath: { ref: 'x' },
      stroke: { type: 'solid', color: solid(0, 0, 0).color, width: 1, align: 'inside' },
    });
    const codes = only(parseAgc(agcDoc([r])))
      .warnings.map((w) => w.code)
      .sort();
    expect(codes).toEqual(['unsupported-style:clipPath', 'unsupported-style:filters']);
  });

  describe('shadows', () => {
    const drop = (over = {}) => ({
      type: 'dropShadow',
      global: true,
      params: {
        dropShadows: [
          { dx: 1, dy: 3, r: 3, color: { mode: 'RGB', value: { r: 0, g: 0, b: 0 }, alpha: 0.25 } },
        ],
      },
      ...over,
    });

    it('reads a global drop shadow into the IR without a warning', () => {
      const { node, warnings } = only(
        parseAgc(agcDoc([rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1), filters: [drop()] })])),
      );
      expect(warnings).toEqual([]);
      expect((node as IrShape).shadows).toEqual([{ dx: 1, dy: 3, r: 3, color: 'rgb(0,0,0)', opacity: 0.25 }]);
    });

    it('reads shadows on groups and keeps several in order', () => {
      const two = drop({
        params: {
          dropShadows: [
            { dx: 0, dy: 1, r: 2, color: { mode: 'RGB', value: { r: 1, g: 2, b: 3 } } },
            { dx: 4, dy: 5, r: 6, color: { mode: 'RGB', value: { r: 9, g: 9, b: 9 }, alpha: 0.5 } },
          ],
        },
      });
      const g = group('G', [rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) })], { style: { filters: [two] } });
      const { node, warnings } = only(parseAgc(agcDoc([g])));
      expect(warnings).toEqual([]);
      expect((node as IrGroup).shadows.map((x) => [x.dx, x.opacity])).toEqual([
        [0, 1],
        [4, 0.5],
      ]);
    });

    it('reports what it cannot convert, with the filter type in the code', () => {
      const codesFor = (filters: unknown[]) =>
        only(parseAgc(agcDoc([rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1), filters })]))).warnings.map(
          (w) => w.code,
        );
      expect(codesFor([{ type: 'innerShadow' }])).toEqual(['unsupported-style:filters:innerShadow']);
      expect(codesFor([drop({ global: false })])).toEqual(['unsupported-style:filters:dropShadow-local']);
      expect(codesFor([{ type: 'dropShadow' }])).toEqual(['unsupported-style:filters']);
      const cmyk = drop({
        params: { dropShadows: [{ dx: 0, dy: 0, r: 1, color: { mode: 'CMYK', value: {} } }] },
      });
      expect(codesFor([cmyk])).toEqual(['unsupported-style:filters']);
    });
  });

  describe('stroke alignment', () => {
    const black = solid(0, 0, 0).color;
    const stroked = (align: string, shape = rect('r', 0, 0, 10, 10)) => {
      shape.style = { ...shape.style, stroke: { type: 'solid', color: black, width: 2, align } };
      return only(parseAgc(agcDoc([shape])));
    };

    it('keeps inside and outside on closed shapes, without a warning', () => {
      for (const align of ['inside', 'outside'] as const) {
        const { node, warnings } = stroked(align);
        expect(warnings).toEqual([]);
        expect((node as IrShape).stroke?.align).toBe(align);
      }
    });

    it('does not warn when there is no stroke to align (XD stores align on stroke: none)', () => {
      const r = rect('r', 0, 0, 10, 10, { fill: solid(1, 1, 1), stroke: { type: 'none', align: 'inside' } });
      expect(only(parseAgc(agcDoc([r]))).warnings).toEqual([]);
    });

    it('still warns where alignment cannot be applied: lines, open paths, unknown values', () => {
      const line = {
        ...rect('l', 0, 0, 0, 0),
        shape: { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      };
      expect(stroked('inside', line).warnings.map((w) => w.code)).toEqual(['stroke-align-ignored:inside']);
      const open = { ...rect('o', 0, 0, 0, 0), shape: { type: 'path', path: 'M0 0L10 0L10 10' } };
      expect(stroked('outside', open).warnings.map((w) => w.code)).toEqual(['stroke-align-ignored:outside']);
      expect(stroked('weird').warnings.map((w) => w.code)).toEqual(['stroke-align-ignored:weird']);
      expect((stroked('weird').node as IrShape).stroke?.align).toBeUndefined();
    });
  });

  it('keeps warnings scoped to the root they came from', () => {
    const doc = agcDoc([
      group('clean', [rect('a', 0, 0, 5, 5, { fill: solid(1, 1, 1) })]),
      group('dirty', [rect('b', 0, 0, 5, 5, { fill: { type: 'gradient' } })]),
    ]);
    const roots = parseAgc(doc);
    expect(roots.find((r) => r.node.name === 'clean')!.warnings).toEqual([]);
    expect(roots.find((r) => r.node.name === 'dirty')!.warnings).toHaveLength(1);
  });
});

describe('hidden nodes', () => {
  it('drops hidden non-root nodes (opacity 0 or visible:false) without warnings', () => {
    const doc = agcDoc([
      group('G', [
        group('slide', [rect('a', 0, 0, 5, 5, { fill: { type: 'gradient' } })], { style: { opacity: 0 } }),
        { ...rect('b', 0, 0, 5, 5, { fill: solid(1, 1, 1) }), visible: false },
        rect('keep', 0, 0, 5, 5, { fill: solid(1, 1, 1) }),
      ]),
    ]);
    const { node, warnings } = only(parseAgc(doc));
    expect((node as IrGroup).children.map((c) => c.name)).toEqual(['keep']);
    expect(warnings).toEqual([]);
  });

  it('keeps a hidden ROOT (carousel slides are toggled by root opacity)', () => {
    const doc = agcDoc([
      group('slide', [rect('a', 0, 0, 5, 5, { fill: solid(1, 1, 1) })], { style: { opacity: 0 } }),
    ]);
    const { node } = only(parseAgc(doc));
    expect((node as IrGroup).children).toHaveLength(1);
  });
});

describe('geometry', () => {
  it('maps circle to ellipse, line and path (winding evenodd)', () => {
    const doc = agcDoc([
      group('G', [
        circle('c', 10, 20, 5, { fill: solid(1, 1, 1) }),
        {
          type: 'shape',
          name: 'p',
          shape: { type: 'path', path: 'M 0 0 L 10 0 L 10 10 Z', winding: 'evenodd' },
          style: { fill: solid(1, 1, 1) },
        },
      ]),
    ]);
    const [c, p] = ((only(parseAgc(doc)).node as IrGroup).children as IrShape[]).map((s) => s.geom);
    expect(c).toMatchObject({ tag: 'ellipse', cx: 10, cy: 20, rx: 5, ry: 5 });
    expect(p).toMatchObject({ tag: 'path', evenodd: true });
    expect(p!.pts).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('maps compound shapes to their resolved path', () => {
    const compound = {
      type: 'shape',
      name: 'cmp',
      shape: { type: 'compound', path: 'M 0 0 L 4 0 L 4 4 Z', children: [], operation: 'add' },
      style: { fill: solid(1, 1, 1) },
    };
    const s = only(parseAgc(agcDoc([compound]))).node as IrShape;
    expect(s.geom).toMatchObject({ tag: 'path', d: 'M 0 0 L 4 0 L 4 4 Z', evenodd: false });
  });

  it('uses rx for equal corner radii and a path for unequal ones', () => {
    const equal = rect('eq', 0, 0, 100, 50, { fill: solid(1, 1, 1) });
    (equal.shape as { r?: number[] }).r = [8, 8, 8, 8];
    const unequal = rect('ne', 0, 0, 100, 50, { fill: solid(1, 1, 1) });
    (unequal.shape as { r?: number[] }).r = [10, 0, 10, 0];
    const [a, b] = parseAgc(agcDoc([equal, unequal])).map((r) => (r.node as IrShape).geom);
    expect(a).toMatchObject({ tag: 'rect', rx: 8 });
    expect(b!.tag).toBe('path');
    expect((b as { d: string }).d).toContain('A 10 10 0 0 1');
    expect(b!.pts).toEqual([
      [0, 0],
      [100, 0],
      [0, 50],
      [100, 50],
    ]);
  });

  it('clamps corner radii to half the shorter side', () => {
    const r = rect('big', 0, 0, 20, 10, { fill: solid(1, 1, 1) });
    (r.shape as { r?: number[] }).r = [99, 99, 99, 99];
    const s = only(parseAgc(agcDoc([r]))).node as IrShape;
    expect(s.geom).toMatchObject({ tag: 'rect', rx: 5 });
  });

  it('warns when a path uses commands other than absolute M L C Z', () => {
    const p = {
      type: 'shape',
      name: 'p',
      shape: { type: 'path', path: 'M 0 0 H 10 V 10 Z' },
      style: { fill: solid(1, 1, 1) },
    };
    expect(only(parseAgc(agcDoc([p]))).warnings.map((w) => w.code)).toContain('path-bbox-approximate');
  });

  it('does not treat exponent notation as a path command', () => {
    const p = {
      type: 'shape',
      name: 'p',
      shape: { type: 'path', path: 'M 1e-5 0 L 10 0 L 10 10 Z' },
      style: { fill: solid(1, 1, 1) },
    };
    expect(only(parseAgc(agcDoc([p]))).warnings).toEqual([]);
  });

  it('keeps node transforms', () => {
    const r = withTransform(rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) }), { tx: 7, ty: 9 });
    expect((only(parseAgc(agcDoc([r]))).node as IrShape).transform).toEqual([1, 0, 0, 1, 7, 9]);
  });
});

describe('mask groups', () => {
  it('turns clipPathResources into clip shapes and keeps the mask name', () => {
    const mask = group('M', [rect('card', 0, 0, 100, 100, { fill: solid(1, 1, 1) })], {
      meta: {
        ux: { isMaskGroup: true, clipPathResources: { children: [rect('maskRect', 0, -29, 100, 100)] } },
      },
    });
    const g = only(parseAgc(agcDoc([group('Root', [mask])]))).node as IrGroup;
    const m = g.children[0] as IrGroup;
    expect(m.clip?.maskName).toBe('M');
    expect(m.clip?.shapes).toHaveLength(1);
    expect(m.clip?.shapes[0]?.name).toBe('maskRect');
  });
});

describe('text', () => {
  const parse = (...nodes: Parameters<typeof agcDoc>[0]) => only(parseAgc(agcDoc(nodes)));
  const t = (r: ReturnType<typeof parse>) => r.node as IrText;
  const codes = (r: ReturnType<typeof parse>) => r.warnings.map((w) => w.code).sort();

  it('reads a one-line node: run text, font, weight, size, fill and the baseline origin', () => {
    const r = parse(
      text('T', 'About Us', { x: 373, y: 5529, size: 20, fontStyle: 'Medium', fill: [252, 253, 255] }),
    );
    expect(t(r).kind).toBe('text');
    expect(t(r).transform).toEqual([1, 0, 0, 1, 373, 5529]);
    expect(t(r).align).toBe('left');
    expect(t(r).lines).toEqual([
      {
        x: 0,
        y: 0,
        runs: [
          {
            text: 'About Us',
            family: 'Poppins',
            weight: 500,
            italic: false,
            size: 20,
            letterSpacing: 0,
            fill: 'rgb(252,253,255)',
          },
        ],
      },
    ]);
  });

  it('keeps XD line wrapping: one line per paragraph, newline characters are not text', () => {
    const r = parse(text('T', 'Download\nBrochure', { lineHeight: 29 }));
    expect(t(r).lines.map((l) => [l.y, l.runs.map((x) => x.text).join('')])).toEqual([
      [0, 'Download'],
      [29, 'Brochure'],
    ]);
  });

  it('splits a segment where the style range changes', () => {
    const r = parse(
      text('T', 'Hello World', {
        ranges: [
          {
            length: 6,
            fontFamily: 'Poppins',
            fontStyle: 'SemiBold',
            fontSize: 20,
            charSpacing: 0,
            fill: { value: argb([1, 2, 3]) },
          },
          {
            length: 5,
            fontFamily: 'Poppins',
            fontStyle: 'Regular',
            fontSize: 14,
            charSpacing: 0,
            fill: { value: argb([9, 9, 9]) },
          },
        ],
      }),
    );
    const runs = t(r).lines[0]!.runs;
    expect(runs.map((x) => [x.text, x.weight, x.size, x.fill])).toEqual([
      ['Hello ', 600, 20, 'rgb(1,2,3)'],
      ['World', 400, 14, 'rgb(9,9,9)'],
    ]);
  });

  it('keeps the last style when the ranges cover less text than the layout does', () => {
    const r = parse(
      text('T', 'abcdef', {
        ranges: [
          {
            length: 2,
            fontFamily: 'F',
            fontStyle: 'Bold',
            fontSize: 10,
            charSpacing: 0,
            fill: { value: argb([1, 1, 1]) },
          },
        ],
      }),
    );
    expect(t(r).lines[0]!.runs.map((x) => [x.text, x.weight])).toEqual([
      ['ab', 700],
      ['cdef', 700],
    ]);
  });

  it('folds the ARGB alpha of a range into the fill', () => {
    const r = parse(
      text('T', 'a', {
        ranges: [
          {
            length: 1,
            fontFamily: 'F',
            fontStyle: 'Regular',
            fontSize: 10,
            charSpacing: 0,
            fill: { value: argb([255, 0, 0], 128) },
          },
        ],
      }),
    );
    expect(t(r).lines[0]!.runs[0]!.fill).toBe('rgba(255,0,0,0.502)');
  });

  it('maps font styles to weight and italic, and reports one it does not know', () => {
    const w = (fontStyle: string) => t(parse(text('T', 'a', { fontStyle }))).lines[0]!.runs[0]!;
    expect(w('Bold Italic')).toMatchObject({ weight: 700, italic: true });
    expect(w('Light')).toMatchObject({ weight: 300, italic: false });
    expect(w('ExtraBold')).toMatchObject({ weight: 800 });
    expect(w('Italic')).toMatchObject({ weight: 400, italic: true });
    const odd = parse(text('T', 'a', { fontStyle: 'Wacky' }));
    expect(t(odd).lines[0]!.runs[0]!.weight).toBe(400);
    expect(codes(odd)).toContain('text-font-style-unknown');
  });

  it('reads centre and right alignment and reports others', () => {
    expect(t(parse(text('T', 'abcd', { align: 'center', xs: [-20] }))).align).toBe('center');
    expect(t(parse(text('T', 'abcd', { align: 'right', xs: [-40] }))).align).toBe('right');
    const j = parse(text('T', 'abcd', { align: 'justify' }));
    expect(t(j).align).toBe('left');
    expect(codes(j)).toContain('text-align-unsupported:justify');
  });

  it('says the font is not embedded, once per family and node', () => {
    const r = parse(
      group('G', [
        text('a', 'one', { family: 'Poppins' }),
        text('b', 'two', { family: 'Poppins' }),
        text('c', 'three', { family: 'Lora' }),
      ]),
    );
    const f = r.warnings.filter((x) => x.code.startsWith('text-font-not-embedded'));
    expect(f.map((x) => [x.code, x.count])).toEqual([
      ['text-font-not-embedded:Poppins', 2],
      ['text-font-not-embedded:Lora', 1],
    ]);
  });

  it('flags the estimated box only when a width had to be guessed', () => {
    expect(codes(parse(text('T', 'abcd')))).toContain('text-bbox-approximate');
    expect(codes(parse(text('T', 'abcd', { align: 'center', xs: [-20] })))).not.toContain(
      'text-bbox-approximate',
    );
  });

  it('drops whitespace-only text without a warning, since it paints nothing', () => {
    const r = parse(group('G', [text('T', '  \n '), rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) })]));
    expect((r.node as IrGroup).children).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('still skips, and says so, a text node with no readable layout', () => {
    const r = parse(
      group('G', [{ type: 'text', name: 'bare' }, rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) })]),
    );
    expect(codes(r)).toEqual(['skipped-text']);
  });

  it('reports a non-positioned frame but still converts it', () => {
    const r = parse(text('T', 'abc', { frame: 'area' }));
    expect(t(r).lines).toHaveLength(1);
    expect(codes(r)).toContain('unsupported-text:frame-area');
  });

  it('reports a text stroke and a gradient fill as missing art', () => {
    const stroke = { type: 'solid', color: solid(0, 0, 0).color, width: 1 };
    expect(codes(parse(text('T', 'abc', { style: { stroke } })))).toContain('unsupported-stroke:text');
    const noRange = text('T', 'abc', { style: { fill: { type: 'gradient' } } });
    noRange.meta = { ux: {} };
    const r = parse(noRange);
    expect(codes(r)).toContain('unsupported-fill:gradient');
    expect(t(r).lines[0]!.runs[0]!.fill).toBeNull();
  });

  it('reads a shadow on a text node', () => {
    const shadow = {
      type: 'dropShadow',
      global: true,
      params: {
        dropShadows: [
          { dx: 1, dy: 3, r: 3, color: { mode: 'RGB', value: { r: 0, g: 0, b: 0 }, alpha: 0.16 } },
        ],
      },
    };
    expect(t(parse(text('T', 'abc', { style: { filters: [shadow] } }))).shadows).toHaveLength(1);
  });
});
