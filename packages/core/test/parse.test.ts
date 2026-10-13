import { agcDoc, circle, group, rect, solid, withTransform } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { XdError } from '../src/errors';
import type { IrGroup, IrShape } from '../src/ir';
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
