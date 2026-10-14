import {
  agcDoc,
  argb,
  circle,
  gradientFill,
  group,
  patternFill,
  pngBase64,
  polygon,
  rect,
  resourcesDoc,
  solid,
  stripesPng,
  syncRef,
  text,
  withTransform,
} from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document';
import { XdError } from '../src/errors';
import type { IrGroup, IrShape, IrText, Paint } from '../src/ir';
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

    it('ignores a disabled effect: XD keeps filters with visible: false', () => {
      const off = drop({ visible: false });
      const r = only(
        parseAgc(
          agcDoc([
            rect('r', 0, 0, 5, 5, {
              fill: solid(1, 1, 1),
              filters: [off, { type: 'uxdesign#blur', visible: false }],
            }),
          ]),
        ),
      );
      expect(r.warnings).toEqual([]);
      expect((r.node as IrShape).shadows).toEqual([]);
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
        anchorX: 0,
        anchor: 'start',
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
    const r = parse(text('T', 'abc', { frame: 'weird' }));
    expect(t(r).lines).toHaveLength(1);
    expect(codes(r)).toContain('unsupported-text:frame-weird');
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

  it('anchors area and autoHeight text by the frame, since their x is an offset inside it', () => {
    // centred in a 200 wide frame, line 41.5 wide: x = (200 - 41.5) / 2
    const area = parse(text('T', 'abcd', { align: 'center', xs: [79.25], frame: 'area', frameWidth: 200 }));
    expect(t(area).lines[0]).toMatchObject({ anchor: 'middle', anchorX: 100 });
    const right = parse(text('T', 'abcd', { align: 'right', xs: [81.5], frame: 'area', frameWidth: 168 }));
    expect(t(right).lines[0]).toMatchObject({ anchor: 'end', anchorX: 168 });
    // autoHeight stores negative offsets like a positioned text
    const auto = parse(
      text('T', 'abcd', { align: 'center', xs: [-94], frame: 'autoHeight', frameWidth: 457 }),
    );
    expect(t(auto).lines[0]).toMatchObject({ anchor: 'middle', anchorX: 0 });
    // no frame width to anchor on: stay where XD put the line
    const bare = parse(text('T', 'abcd', { align: 'center', xs: [30], frame: 'area' }));
    expect(t(bare).lines[0]).toMatchObject({ anchor: 'start', anchorX: 30 });
  });

  it('knows the exact width of area text from its offset and the frame', () => {
    const r = parse(text('T', 'abcd', { align: 'center', xs: [79.25], frame: 'area', frameWidth: 200 }));
    expect(codes(r)).not.toContain('text-bbox-approximate');
    expect(t(r).pts[0]![0]).toBeCloseTo(79.25);
    expect(t(r).pts[1]![0]).toBeCloseTo(120.75);
  });

  it('applies textTransform and carries underline and strikethrough', () => {
    const range = (over: object) => ({
      length: 5,
      fontFamily: 'F',
      fontStyle: 'Regular',
      fontSize: 10,
      charSpacing: 0,
      fill: { value: argb([1, 1, 1]) },
      ...over,
    });
    const run = (over: object) =>
      t(parse(text('T', 'hello world', { ranges: [range({ length: 11, ...over })] }))).lines[0]!.runs[0]!;
    expect(run({ textTransform: 'uppercase' }).text).toBe('HELLO WORLD');
    expect(run({ textTransform: 'lowercase' }).text).toBe('hello world');
    expect(run({ textTransform: 'titlecase' }).text).toBe('Hello World');
    expect(run({ textTransform: 'none' }).text).toBe('hello world');
    expect(run({ underline: true }).decoration).toBe('underline');
    expect(run({ strikethrough: true }).decoration).toBe('line-through');
    expect(run({ underline: true, strikethrough: true }).decoration).toBe('underline line-through');
    expect(run({ underline: false }).decoration).toBeUndefined();
    const sup = parse(text('T', 'x', { ranges: [range({ length: 1, textScript: 'superscript' })] }));
    expect(codes(sup)).toContain('text-script-unsupported:superscript');
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

describe('polygon', () => {
  const tri = polygon(
    'tri',
    [
      [37.5, 0],
      [75, 63],
      [0, 63],
    ],
    { fill: solid(1, 2, 3) },
  );

  it('becomes a closed path through its points', () => {
    const r = only(parseAgc(agcDoc([tri])));
    const g = (r.node as IrShape).geom;
    expect(g.tag).toBe('path');
    expect(g.tag === 'path' && g.d).toBe('M 37.5 0 L 75 63 L 0 63 Z');
    expect(g.pts).toEqual([
      [37.5, 0],
      [75, 63],
      [0, 63],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('takes inside stroke alignment like any closed shape', () => {
    const stroked = polygon(
      'tri',
      [
        [0, 0],
        [10, 0],
        [5, 8],
      ],
      {
        stroke: { type: 'solid', color: solid(0, 0, 0).color, width: 2, align: 'inside' },
      },
    );
    const r = only(parseAgc(agcDoc([stroked])));
    expect((r.node as IrShape).stroke?.align).toBe('inside');
    expect(r.warnings).toEqual([]);
  });

  it('reports a polygon with fewer than three usable points instead of drawing nothing', () => {
    const r = parseAgc(
      agcDoc([
        group('G', [
          polygon('bad', [
            [0, 0],
            [1, 1],
          ]),
          rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) }),
        ]),
      ]),
    );
    expect(only(r).warnings.map((w) => w.code)).toEqual(['unsupported-shape:polygon']);
  });
});

describe('symbol instances (syncRef)', () => {
  const master = () =>
    group('Btn', [
      rect('bg', 0, 0, 50, 20, { fill: solid(1, 2, 3) }),
      rect('dot', 5, 5, 4, 4, { fill: solid(9, 9, 9) }),
    ]);
  const names = (n: IrGroup) => n.children.map((c) => c.name);

  it('takes its content from the node whose id it names, and keeps its own position', () => {
    const inst = syncRef('id-Btn', { transform: { a: 1, b: 0, c: 0, d: 1, tx: 200, ty: 0 } });
    const roots = parseAgc(agcDoc([master(), inst]));
    const copy = roots[1]!;
    expect(copy.warnings).toEqual([]);
    expect(copy.node.kind).toBe('group');
    expect(copy.node.name).toBe('Btn');
    expect(copy.node.transform).toEqual([1, 0, 0, 1, 200, 0]);
    expect(names(copy.node as IrGroup)).toEqual(['bg', 'dot']);
  });

  it('uses the source transform when the instance does not carry one', () => {
    const m = withTransform(master(), { tx: 40, ty: 7 });
    const roots = parseAgc(agcDoc([m, syncRef('id-Btn')]));
    expect(roots[1]!.node.transform).toEqual([1, 0, 0, 1, 40, 7]);
  });

  it('applies the overrides it lists: unchanged children are placeholders, others are full nodes', () => {
    const inst = syncRef('id-Btn', {
      group: { children: [syncRef('id-bg'), rect('dot2', 20, 5, 4, 4, { fill: solid(5, 5, 5) })] },
    });
    const copy = parseAgc(agcDoc([master(), inst]))[1]!;
    expect(names(copy.node as IrGroup)).toEqual(['bg', 'dot2']);
    expect(copy.warnings).toEqual([]);
  });

  it('finds the source in another artboard', () => {
    const doc = {
      source: { kind: 'fixture' as const, ref: 't' },
      artboards: [
        { id: 'a', name: 'Home', agc: agcDoc([group('Page', [syncRef('id-Btn')])]) },
        { id: 'b', name: 'Masters', agc: agcDoc([master()]) },
      ],
    };
    const home = parseDocument(doc)[0]!.roots[0]!;
    expect(home.warnings).toEqual([]);
    expect(names((home.node as IrGroup).children[0] as IrGroup)).toEqual(['bg', 'dot']);
  });

  it('keeps reporting what it cannot resolve: an unknown source, or a loop', () => {
    const missing = parseAgc(agcDoc([syncRef('nope')]));
    expect(missing).toHaveLength(0);
    const inGroup = only(
      parseAgc(agcDoc([group('G', [syncRef('nope'), rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1) })])])),
    );
    expect(inGroup.warnings.map((w) => w.code)).toEqual(['unsupported-node:syncRef']);
    const loop = group('Loop', [syncRef('id-Loop')]);
    const r = only(parseAgc(agcDoc([loop])));
    expect(r.warnings.map((w) => w.code)).toEqual(['unsupported-node:syncRef']);
  });
});

describe('blend modes', () => {
  const shape = (blendMode?: string) =>
    rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1), ...(blendMode ? { blendMode } : {}) });
  const parsed = (blendMode?: string) => only(parseAgc(agcDoc([shape(blendMode)])));

  it('keeps a CSS blend mode and notes that the backdrop is only what is exported', () => {
    const r = parsed('multiply');
    expect((r.node as IrShape).blend).toBe('multiply');
    expect(r.warnings.map((w) => w.code)).toEqual(['blend-mode-backdrop']);
  });

  it('knows every mode XD writes', () => {
    for (const m of [
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
      'color-dodge',
      'color-burn',
      'hard-light',
      'soft-light',
      'difference',
      'exclusion',
      'hue',
      'saturation',
      'color',
      'luminosity',
    ]) {
      expect((parsed(m).node as IrShape).blend, m).toBe(m);
    }
  });

  it('draws normal and pass-through as nothing special, without a warning', () => {
    for (const m of ['normal', 'pass-through']) {
      const r = parsed(m);
      expect((r.node as IrShape).blend, m).toBeUndefined();
      expect(r.warnings, m).toEqual([]);
    }
  });

  it('reports a mode it does not know and draws it normally', () => {
    const r = parsed('weird-mode');
    expect((r.node as IrShape).blend).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toEqual(['unsupported-style:blendMode:weird-mode']);
  });

  it('reads it on groups and text too', () => {
    const g = group('G', [shape()], { style: { blendMode: 'screen' } });
    expect((only(parseAgc(agcDoc([g]))).node as IrGroup).blend).toBe('screen');
    const t = text('T', 'abc', { style: { blendMode: 'overlay' } });
    expect((only(parseAgc(agcDoc([t]))).node as IrText).blend).toBe('overlay');
  });
});

describe('gradients', () => {
  const red = [255, 0, 0] as [number, number, number];
  const blue = [0, 0, 255] as [number, number, number];
  const filled = (fill: ReturnType<typeof gradientFill>, w = 40, h = 20) => rect('r', 0, 0, w, h, { fill });
  const paintOf = (n: ReturnType<typeof filled>, doc?: ReturnType<typeof resourcesDoc>) => {
    const artboard = agcDoc([n]);
    const root = doc
      ? parseDocument({
          source: { kind: 'fixture', ref: 't' },
          artboards: [{ id: 'a', name: 'A', agc: artboard }],
          resources: doc,
        })[0]!.roots[0]!
      : only(parseAgc(artboard));
    return { root, fill: (root.node as IrShape).fill as Paint };
  };

  it('reads an inline linear gradient with its stops and bounding-box geometry', () => {
    const { root, fill } = paintOf(
      filled(
        gradientFill(
          'linear',
          [
            [0, red],
            [1, blue],
          ],
          { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
        ),
      ),
    );
    expect(root.warnings).toEqual([]);
    expect(fill).toEqual({
      kind: 'gradient',
      def: {
        type: 'linear',
        units: 'objectBoundingBox',
        x1: 0,
        y1: 0.5,
        x2: 1,
        y2: 0.5,
        stops: [
          { offset: 0, color: 'rgb(255,0,0)', opacity: 1 },
          { offset: 1, color: 'rgb(0,0,255)', opacity: 1 },
        ],
      },
    });
  });

  it('takes the stops of a shared gradient from the resources document by ref', () => {
    const doc = resourcesDoc({
      g1: {
        type: 'linear',
        stops: [
          [0, red],
          [0.4, blue],
          [1, red],
        ],
      },
    });
    const { root, fill } = paintOf(filled(gradientFill('linear', [], {}, { ref: 'g1' })), doc);
    expect(root.warnings).toEqual([]);
    expect(fill.kind === 'gradient' && fill.def.stops.map((s) => s.offset)).toEqual([0, 0.4, 1]);
  });

  it('reports a ref it cannot find, as missing art', () => {
    const { root, fill } = paintOf(filled(gradientFill('linear', [], {}, { ref: 'nope' })));
    expect(fill.kind).toBe('unsupported');
    expect(root.warnings.map((w) => w.code)).toEqual(['unsupported-fill:gradient']);
  });

  it('keeps the alpha of a stop', () => {
    const { fill } = paintOf(
      filled(
        gradientFill('linear', [
          [0, red, 0.25],
          [1, blue],
        ]),
      ),
    );
    expect(fill.kind === 'gradient' && fill.def.stops.map((s) => s.opacity)).toEqual([0.25, 1]);
  });

  it('reads a radial gradient, with and without its own transform', () => {
    const plain = paintOf(
      filled(
        gradientFill('radial', [
          [0, red],
          [1, blue],
        ]),
      ),
    ).fill;
    expect(plain).toMatchObject({
      kind: 'gradient',
      def: { type: 'radial', cx: 0.5, cy: 0.5, fx: 0.5, fy: 0.5, r: 0.5 },
    });
    const t = { a: 0.68, b: 0.73, c: -0.3, d: 0.28, tx: 0.31, ty: -0.005 };
    const moved = paintOf(
      filled(
        gradientFill(
          'radial',
          [
            [0, red],
            [1, blue],
          ],
          { transform: t },
        ),
      ),
    ).fill;
    expect(moved.kind === 'gradient' && moved.def.type === 'radial' && moved.def.transform).toEqual([
      0.68, 0.73, -0.3, 0.28, 0.31, -0.005,
    ]);
  });

  it('keeps userSpaceOnUse as written', () => {
    const { fill } = paintOf(
      filled(
        gradientFill(
          'linear',
          [
            [0, red],
            [1, blue],
          ],
          { units: 'userSpaceOnUse', x1: 0, y1: 0, x2: 40, y2: 0 },
        ),
      ),
    );
    expect(fill).toMatchObject({ kind: 'gradient', def: { units: 'userSpaceOnUse', x2: 40 } });
  });

  it('reports a type SVG cannot draw (angular) with its own code', () => {
    const { root, fill } = paintOf(
      filled(
        gradientFill('angular', [
          [0, red],
          [1, blue],
        ]),
      ),
    );
    expect(fill.kind).toBe('unsupported');
    expect(root.warnings.map((w) => w.code)).toEqual(['unsupported-fill:gradient-angular']);
  });

  it('reports malformed gradients instead of drawing the wrong thing', () => {
    const codes = (f: ReturnType<typeof gradientFill>) => paintOf(filled(f)).root.warnings.map((w) => w.code);
    expect(codes(gradientFill('linear', []))).toEqual(['unsupported-fill:gradient']);
    expect(
      codes(
        gradientFill(
          'linear',
          [
            [0, red],
            [1, blue],
          ],
          { x2: undefined },
        ),
      ),
    ).toEqual(['unsupported-fill:gradient']);
    const cmyk = gradientFill('linear', [
      [0, red],
      [1, blue],
    ]);
    (cmyk.gradient!.meta!.ux!.gradientResources!.stops![0]!.color as { mode: string }).mode = 'CMYK';
    expect(codes(cmyk)).toEqual(['unsupported-fill:color-mode-CMYK']);
  });

  it('turns a single stop into a plain colour', () => {
    const { fill, root } = paintOf(filled(gradientFill('linear', [[0, red, 0.5]])));
    expect(fill).toEqual({ kind: 'solid', css: 'rgba(255,0,0,0.5)' });
    expect(root.warnings).toEqual([]);
  });

  it('falls back to the first stop where the bounding box has no area, and says so', () => {
    const { fill, root } = paintOf(
      filled(
        gradientFill('linear', [
          [0, red],
          [1, blue],
        ]),
        0,
        20,
      ),
    );
    expect(fill).toEqual({ kind: 'solid', css: 'rgb(255,0,0)' });
    expect(root.warnings.map((w) => w.code)).toEqual(['gradient-degenerate-bbox']);
  });

  it('does not need that fallback in user space', () => {
    const f = gradientFill(
      'linear',
      [
        [0, red],
        [1, blue],
      ],
      { units: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: 1 },
    );
    expect(paintOf(filled(f, 0, 20)).fill.kind).toBe('gradient');
  });

  it('is a plate candidate like a solid fill, and a group fill reaches its children', () => {
    const g = group('G', [rect('a', 0, 0, 5, 5)], {
      style: {
        fill: gradientFill('linear', [
          [0, red],
          [1, blue],
        ]),
      },
    });
    const child = (only(parseAgc(agcDoc([g]))).node as IrGroup).children[0] as IrShape;
    expect(child.fill?.kind).toBe('gradient');
    expect(child.ownFill).toBe(false);
    expect(
      paintOf(
        filled(
          gradientFill('linear', [
            [0, red],
            [1, blue],
          ]),
        ),
      ).root.node,
    ).toMatchObject({
      ownFill: true,
    });
  });

  it('works on a stroke too', () => {
    const stroke = {
      ...gradientFill('linear', [
        [0, red],
        [1, blue],
      ]),
      width: 2,
    };
    const r = only(parseAgc(agcDoc([rect('r', 0, 0, 10, 10, { stroke })])));
    expect((r.node as IrShape).stroke?.paint.kind).toBe('gradient');
    expect(r.warnings).toEqual([]);
  });

  it('still reports a gradient on text as missing art', () => {
    const t = text('T', 'abc', {
      style: {
        fill: gradientFill('linear', [
          [0, red],
          [1, blue],
        ]),
      },
    });
    t.meta = { ux: {} };
    expect(only(parseAgc(agcDoc([t]))).warnings.map((w) => w.code)).toContain('unsupported-fill:gradient');
  });
});

describe('image fills', () => {
  const png = stripesPng();
  const parseWith = (
    fill: ReturnType<typeof patternFill>,
    images: Record<string, string> = { u1: png },
    opts = {},
  ) => {
    const r = only(parseAgc(agcDoc([rect('r', 0, 0, 40, 40, { fill })]), { images, ...opts }));
    return { r, fill: (r.node as IrShape).fill as Paint };
  };
  const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

  it('reads the picture, its pixel size and cover as the default fit', () => {
    const { r, fill } = parseWith(patternFill('u1'));
    expect(codes(r)).toEqual([]);
    expect(fill).toEqual({
      kind: 'image',
      uid: 'u1',
      mime: 'image/png',
      base64: png,
      width: 20,
      height: 10,
      fit: 'cover',
    });
  });

  it('stretches for scaleBehavior fill', () => {
    expect((parseWith(patternFill('u1', { behavior: 'fill' })).fill as { fit: string }).fit).toBe('stretch');
  });

  it('draws an unknown scale behaviour as cover and says so', () => {
    const { r, fill } = parseWith(patternFill('u1', { behavior: 'tile' }));
    expect((fill as { fit: string }).fit).toBe('cover');
    expect(codes(r)).toEqual(['pattern-scale-unknown:tile']);
  });

  it('says a moved or zoomed fill is drawn at the default', () => {
    for (const ux of [{ scale: 2.7 }, { offsetX: 0.07 }, { offsetY: 0.7 }]) {
      expect(codes(parseWith(patternFill('u1', { ux })).r)).toEqual(['pattern-offset-ignored']);
    }
    expect(codes(parseWith(patternFill('u1', { ux: { scale: 1, offsetX: 0, offsetY: 0 } })).r)).toEqual([]);
  });

  it('reports bytes that are not in the document, as missing art', () => {
    const { r, fill } = parseWith(patternFill('u1'), {});
    expect(fill.kind).toBe('unsupported');
    expect(codes(r)).toEqual(['unsupported-fill:pattern']);
  });

  it('reports an image over the embed limit, and honours a raised limit', () => {
    const big = pngBase64(64, 64, (x, y) => [x * 4, y * 4, (x * y) % 256]);
    const { r } = parseWith(patternFill('u1'), { u1: big }, { maxEmbedBytes: 100 });
    expect(codes(r)).toEqual(['unsupported-fill:pattern-too-large']);
    expect(codes(parseWith(patternFill('u1'), { u1: big }, { maxEmbedBytes: 1_000_000 }).r)).toEqual([]);
  });

  it('reports bytes that are not a picture', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
    expect(codes(parseWith(patternFill('u1'), { u1: svg }).r)).toEqual(['unsupported-fill:pattern-format']);
  });

  it('reports a fill with no id or no size, and an image on a stroke or on text', () => {
    const noId = patternFill('u1');
    delete (noId.pattern!.meta!.ux as { uid?: string }).uid;
    expect(codes(parseWith(noId).r)).toEqual(['unsupported-fill:pattern']);
    expect(codes(parseWith(patternFill('u1', { w: 0 })).r)).toEqual(['unsupported-fill:pattern']);
    const stroked = only(
      parseAgc(agcDoc([rect('r', 0, 0, 5, 5, { stroke: { ...patternFill('u1'), width: 2 } })]), {
        images: { u1: png },
      }),
    );
    expect(codes(stroked)).toEqual(['unsupported-stroke:pattern']);
    const t = text('T', 'abc', { style: { fill: patternFill('u1') } });
    t.meta = { ux: {} };
    expect(codes(only(parseAgc(agcDoc([t]), { images: { u1: png } })))).toContain('unsupported-fill:pattern');
  });

  it('takes the bytes from the document, and is a plate candidate', () => {
    const doc = {
      source: { kind: 'fixture' as const, ref: 't' },
      artboards: [
        { id: 'a', name: 'A', agc: agcDoc([rect('r', 0, 0, 40, 40, { fill: patternFill('u1') })]) },
      ],
      images: { u1: png },
    };
    const root = parseDocument(doc)[0]!.roots[0]!;
    expect((root.node as IrShape).fill?.kind).toBe('image');
    expect((root.node as IrShape).ownFill).toBe(true);
    const tiny = parseDocument(doc, { maxEmbedBytes: 10 })[0]!.roots[0]!;
    expect(codes(tiny)).toEqual(['unsupported-fill:pattern-too-large']);
  });
});

describe('object blur', () => {
  const blur = (over: Record<string, unknown> = {}, params: Record<string, unknown> = {}) => ({
    type: 'uxdesign#blur',
    global: true,
    params: { blurAmount: 5, brightnessAmount: 15, fillOpacity: 0, backgroundEffect: false, ...params },
    ...over,
  });
  const parsed = (filters: unknown[]) =>
    only(parseAgc(agcDoc([rect('r', 0, 0, 5, 5, { fill: solid(1, 1, 1), filters })])));
  const codes = (r: ReturnType<typeof parsed>) => r.warnings.map((w) => w.code);

  it('reads an object blur as a Gaussian of that amount, without a warning', () => {
    const r = parsed([blur()]);
    expect((r.node as IrShape).blur).toBe(5);
    expect(codes(r)).toEqual([]);
  });

  it('ignores brightness and fill opacity, which only a background blur has', () => {
    expect((parsed([blur({}, { brightnessAmount: -50, fillOpacity: 1 })]).node as IrShape).blur).toBe(5);
  });

  it('reads it on groups and text', () => {
    const g = group('G', [rect('a', 0, 0, 5, 5, { fill: solid(1, 1, 1) })], { style: { filters: [blur()] } });
    expect((only(parseAgc(agcDoc([g]))).node as IrGroup).blur).toBe(5);
    const t = text('T', 'abc', { style: { filters: [blur()] } });
    expect((only(parseAgc(agcDoc([t]))).node as IrText).blur).toBe(5);
  });

  it('is nothing for a disabled blur or an amount of zero, and combines two as one Gaussian', () => {
    expect((parsed([blur({ visible: false })]).node as IrShape).blur).toBeUndefined();
    expect((parsed([blur({}, { blurAmount: 0 })]).node as IrShape).blur).toBeUndefined();
    expect(codes(parsed([blur({ visible: false }), blur({}, { blurAmount: 0 })]))).toEqual([]);
    // two Gaussians add in variance: sqrt(3^2 + 4^2) = 5
    expect(
      (parsed([blur({}, { blurAmount: 3 }), blur({}, { blurAmount: 4 })]).node as IrShape).blur,
    ).toBeCloseTo(5, 6);
  });

  it('reports a background blur, which needs the pixels behind the shape and cannot be drawn', () => {
    const r = parsed([blur({}, { backgroundEffect: true })]);
    expect((r.node as IrShape).blur).toBeUndefined();
    expect(codes(r)).toEqual(['unsupported-style:filters:uxdesign#blur-background']);
  });

  it('reports a blur it cannot read or one that is not global', () => {
    expect(codes(parsed([{ type: 'uxdesign#blur', global: true, params: {} }]))).toEqual([
      'unsupported-style:filters',
    ]);
    expect(codes(parsed([blur({ global: false })]))).toEqual([
      'unsupported-style:filters:uxdesign#blur-local',
    ]);
    expect(codes(parsed([blur({}, { blurAmount: -2 })]))).toEqual(['unsupported-style:filters']);
  });

  it('lives next to a drop shadow', () => {
    const shadow = {
      type: 'dropShadow',
      global: true,
      params: { dropShadows: [{ dx: 0, dy: 2, r: 2, color: { mode: 'RGB', value: { r: 0, g: 0, b: 0 } } }] },
    };
    const r = parsed([shadow, blur()]);
    expect((r.node as IrShape).shadows).toHaveLength(1);
    expect((r.node as IrShape).blur).toBe(5);
    expect(codes(r)).toEqual([]);
  });
});
