import { agcDoc, circle, group, rect, solid, withTransform } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { convertRoot } from '../src/convert';
import { parseAgc } from '../src/parse';

const convert = (...roots: Parameters<typeof agcDoc>[0]) => {
  const parsed = parseAgc(agcDoc(roots));
  return convertRoot('Artboard', parsed[0]!, null);
};
const card = (extra = {}) => rect('card', 0, 0, 100, 100, { fill: solid(255, 156, 41), ...extra });

describe('emitSvg basics', () => {
  it('emits a viewBox from the frame and keeps document order as paint order', () => {
    const { svg, report } = convert(
      group('Root', [card(), circle('dot', 50, 50, 10, { fill: solid(0, 0, 0) })]),
    );
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('width="100"');
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('<ellipse'));
    expect(report.frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(report.rule).toBe('plate');
  });

  it('puts fill="none" on stroke-only shapes so SVG does not paint them black', () => {
    const stroked = rect('s', 10, 10, 20, 20, {
      stroke: { type: 'solid', color: solid(0, 0, 0).color, width: 2 },
    });
    const { svg } = convert(group('Root', [card(), stroked]));
    expect(svg).toMatch(/<rect[^>]*x="10"[^>]*fill="none"[^>]*stroke="rgb\(0,0,0\)"[^>]*stroke-width="2"/);
  });

  it('maps a line colour in fill to stroke', () => {
    const line = {
      type: 'shape',
      name: 'L',
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      shape: { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      style: { fill: solid(5, 6, 7) },
    };
    const { svg } = convert(group('Root', [card(), line]));
    expect(svg).toMatch(/<line[^>]*fill="none"[^>]*stroke="rgb\(5,6,7\)"[^>]*stroke-width="1"/);
  });

  it('emits rgba() for translucent fills, fill-rule for evenodd paths and rx for rounded rects', () => {
    const r = rect('r', 0, 0, 100, 100, { fill: solid(1, 2, 3, 0.5) });
    (r.shape as { r?: number[] }).r = [8, 8, 8, 8];
    const p = {
      type: 'shape',
      name: 'p',
      shape: { type: 'path', path: 'M 0 0 L 10 0 L 10 10 Z', winding: 'evenodd' },
      style: { fill: solid(9, 9, 9) },
    };
    const { svg } = convert(group('Root', [r, p]));
    expect(svg).toContain('fill="rgba(1,2,3,0.5)"');
    expect(svg).toContain('rx="8"');
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('copies nested group transforms as matrix()', () => {
    const inner = withTransform(group('inner', [card()]), { tx: 5, ty: 6 });
    const { svg } = convert(group('Root', [inner]));
    expect(svg).toContain('<g transform="matrix(1 0 0 1 5 6)">');
  });
});

describe('opacity rules', () => {
  it('ignores opacity 0 on the exported root but drops it on inner groups', () => {
    const hiddenInner = group('slide', [rect('x', 0, 0, 500, 500, { fill: solid(0, 0, 0) })], {
      style: { opacity: 0 },
    });
    const { svg } = convert(group('Root', [card(), hiddenInner], { style: { opacity: 0 } }));
    expect(svg).toContain('<rect');
    expect(svg).not.toContain('width="500"');
    expect(svg).not.toContain('opacity="0"');
  });

  it('emits opacity for inner groups and shapes below 1, never for the root', () => {
    const half = group('half', [card()], { style: { opacity: 0.5 } });
    const { svg } = convert(group('Root', [half], { style: { opacity: 0.3 } }));
    expect(svg).toContain('<g opacity="0.5">');
    expect(svg).not.toContain('opacity="0.3"');
  });
});

describe('mask groups', () => {
  const maskGroup = (maskRect: ReturnType<typeof rect>, over = {}) =>
    group('Masked', [card()], {
      meta: { ux: { isMaskGroup: true, clipPathResources: { children: [maskRect] } } },
      ...over,
    });

  it('emits a clipPath with shapes only and references it', () => {
    const { svg, report } = convert(group('Root', [maskGroup(rect('m', 0, 0, 100, 100))]));
    expect(svg).toMatch(/<defs><clipPath id="clip-1"><rect[^>]*\/><\/clipPath><\/defs>/);
    expect(svg).toContain('clip-path="url(#clip-1)"');
    expect(svg).not.toMatch(/<clipPath[^>]*><g/);
    expect(report.clips).toBe(1);
    expect(report.snaps).toEqual([]);
  });

  it('snaps a card-sized mask whose origin drifted onto the frame and records the snap', () => {
    // The drift lives in the mask's own transform (ty = -29), so the snap cancels it exactly.
    const drifted = withTransform(rect('maskRect', 0, 0, 100, 100), { ty: -29 });
    const { svg, report } = convert(group('Root', [maskGroup(drifted)]));
    expect(report.snaps).toEqual([{ clip: 'maskRect', mask: 'Masked', dx: 0, dy: 29 }]);
    // translate(0,29) * translate(0,-29) is the identity, so the clip rect needs no transform.
    expect(svg).toMatch(/<clipPath id="clip-1"><rect[^>]*\/><\/clipPath>/);
    expect(svg).not.toMatch(/<clipPath[^>]*><rect[^>]*transform/);
  });

  it('converts the world-space snap into the mask local space under a scaled group', () => {
    const half = { ...rect('card', 0, 0, 50, 50, { fill: solid(255, 156, 41) }) };
    const masked = withTransform(
      group('Masked', [half], {
        meta: {
          ux: {
            isMaskGroup: true,
            clipPathResources: { children: [withTransform(rect('maskRect', 0, 0, 50, 50), { ty: -14.5 })] },
          },
        },
      }),
      { a: 2, d: 2 },
    );
    const { svg, report } = convert(group('Root', [masked]));
    expect(report.frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(report.snaps).toEqual([{ clip: 'maskRect', mask: 'Masked', dx: 0, dy: 29 }]);
    // local delta is 14.5, which cancels the mask's own -14.5 offset exactly
    expect(svg).toMatch(/<clipPath id="clip-1"><rect[^>]*\/><\/clipPath>/);
    expect(svg).not.toMatch(/<clipPath[^>]*><rect[^>]*transform/);
  });

  it('does not snap a mask whose size differs from the frame', () => {
    const smaller = rect('maskRect', 0, -29, 60, 60);
    const { report } = convert(group('Root', [maskGroup(smaller)]));
    expect(report.snaps).toEqual([]);
  });
});

describe('report', () => {
  it('carries the warnings of the exported root only, plus the source', () => {
    const dirty = group('dirty', [card({ fill: { type: 'gradient' } })]);
    const clean = group('clean', [card()]);
    const parsed = parseAgc(agcDoc([clean, dirty]));
    const cleanReport = convertRoot('A', parsed[0]!, { kind: 'fixture', ref: 'x' }).report;
    const dirtyReport = convertRoot('A', parsed[1]!, null).report;
    expect(cleanReport.warnings).toEqual([]);
    expect(cleanReport.source).toEqual({ kind: 'fixture', ref: 'x' });
    expect(dirtyReport.warnings.map((w) => w.code)).toEqual(['unsupported-fill:gradient']);
    expect(cleanReport.artboard).toBe('A');
    expect(cleanReport.node).toBe('clean');
  });
});
