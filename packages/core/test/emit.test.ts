import { agcDoc, argb, circle, group, rect, solid, text, withTransform } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { convertRoot } from '../src/convert';
import { parseAgc } from '../src/parse';
import { rasterize } from '../src/raster';
import { validateRaster } from '../src/validate';

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

describe('a root that is a single shape', () => {
  // Real designs export background plates that sit far from the artboard origin, so the shape
  // node carries a large translate. The frame is measured in the shape's own coordinates, so
  // emit must not apply that translate again or the shape lands outside the viewBox.
  const plate = withTransform(rect('plate', 0, 0, 1920, 400, { fill: solid(239, 241, 242) }), {
    tx: -2020,
    ty: -124.5,
  });

  it('keeps the shape inside its viewBox, with no transform of its own', () => {
    const { svg, report } = convert(plate);
    expect(report.frame).toEqual({ x: 0, y: 0, w: 1920, h: 400 });
    expect(svg).not.toContain('transform=');
  });

  it('renders fully painted: no empty render and no edge band that looks like mask drift', () => {
    expect(validateRaster(convert(plate).svg)).toEqual([]);
  });

  it('does the same for a rounded root rect and a root path', () => {
    const pill = withTransform(
      rect(
        'pill',
        0,
        0,
        401,
        573,
        { fill: solid(249, 203, 23) },
        {
          shape: { type: 'rect', x: 0, y: 0, width: 401, height: 573, r: [200, 200, 200, 200] },
        },
      ),
      { tx: 8078, ty: 285 },
    );
    expect(convert(pill).svg).not.toContain('transform=');
    const path = {
      type: 'shape',
      name: 'p',
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 500, ty: -300 },
      shape: { type: 'path', path: 'M 0 0 L 100 0 L 100 50 L 0 50 Z' },
      style: { fill: solid(9, 9, 9) },
    };
    expect(convert(path).svg).not.toContain('transform=');
    expect(validateRaster(convert(path).svg)).toEqual([]);
  });

  it('still applies a shape transform when the shape is nested', () => {
    const nested = withTransform(rect('inner', 0, 0, 50, 50, { fill: solid(1, 2, 3) }), { tx: 10, ty: 20 });
    const { svg } = convert(group('Root', [card(), nested]));
    expect(svg).toContain('transform="matrix(1 0 0 1 10 20)"');
  });
});

describe('stroke alignment', () => {
  const black = solid(0, 0, 0).color;
  const aligned = (align: 'inside' | 'outside', extra = {}) =>
    rect('box', 10, 10, 40, 40, {
      stroke: { type: 'solid', color: black, width: 10, align },
      ...extra,
    });
  const alphaAt = (svg: string, w: number, x: number, y: number) =>
    rasterize(svg, w).alpha[y * w + x] as number;

  it('inside: the stroke is doubled and clipped to the shape, so only the inner half paints', () => {
    const { svg, report } = convert(group('Root', [aligned('inside')]));
    expect(report.frame).toEqual({ x: 10, y: 10, w: 40, h: 40 });
    expect(svg).toMatch(/<clipPath id="stroke-clip-1"><rect[^>]*x="10"[^>]*\/><\/clipPath>/);
    expect(svg).toMatch(/stroke-width="20"[^>]*clip-path="url\(#stroke-clip-1\)"/);
    // frame is 10..50 rendered at 40 px: the outer 10 px ring is painted, the centre is not
    expect(alphaAt(svg, 40, 2, 20)).toBeGreaterThan(200);
    expect(alphaAt(svg, 40, 8, 20)).toBeGreaterThan(200);
    expect(alphaAt(svg, 40, 12, 20)).toBe(0);
    expect(alphaAt(svg, 40, 20, 20)).toBe(0);
  });

  it('outside: the frame grows by the full width and the shape area is masked out of the stroke', () => {
    const { svg, report } = convert(group('Root', [aligned('outside')]));
    expect(report.frame).toEqual({ x: 0, y: 0, w: 60, h: 60 });
    expect(svg).toContain('<mask id="stroke-mask-1"');
    expect(svg).toMatch(/stroke-width="20"[^>]*mask="url\(#stroke-mask-1\)"/);
    expect(alphaAt(svg, 60, 5, 30)).toBeGreaterThan(200); // outside ring (0..10)
    expect(alphaAt(svg, 60, 15, 30)).toBe(0); // shape edge band is NOT stroked
    expect(alphaAt(svg, 60, 30, 30)).toBe(0);
  });

  it('keeps the fill under the stroke and applies transform and opacity once, on a wrapper', () => {
    const shape = withTransform(aligned('inside', { fill: solid(255, 0, 0), opacity: 0.5 }), {
      tx: 5,
      ty: 5,
    });
    const { svg } = convert(group('Root', [card(), shape]));
    const g = svg.match(/<g [^>]*opacity="0.5"[^>]*>(.*?)<\/g>/);
    expect(g?.[0]).toContain('transform="matrix(1 0 0 1 5 5)"');
    expect(g?.[1]).toMatch(/<rect[^>]*fill="rgb\(255,0,0\)"[^>]*\/><rect[^>]*fill="none"/);
    expect(g?.[1]).not.toContain('opacity');
  });

  it('uses the evenodd rule in the clip so holes stay unstroked on the wrong side', () => {
    const ring = {
      ...rect('ring', 0, 0, 0, 0),
      shape: { type: 'path', path: 'M0 0L20 0L20 20L0 20ZM5 5L15 5L15 15L5 15Z', winding: 'evenodd' },
      style: { stroke: { type: 'solid', color: black, width: 2, align: 'inside' } },
    };
    const { svg } = convert(group('Root', [card(), ring]));
    expect(svg).toMatch(/<clipPath[^>]*><path[^>]*clip-rule="evenodd"/);
  });
});

describe('drop shadows', () => {
  const shadow = (dx: number, dy: number, r: number, alpha = 0.5) => ({
    type: 'dropShadow',
    global: true,
    params: { dropShadows: [{ dx, dy, r, color: { mode: 'RGB', value: { r: 0, g: 0, b: 0 }, alpha } }] },
  });
  const boxed = (extra = {}) => rect('box', 10, 10, 40, 40, { fill: solid(255, 0, 0), ...extra });
  const alphaAt = (svg: string, w: number, x: number, y: number) =>
    rasterize(svg, w).alpha[y * w + x] as number;

  it('emits one filter per shadowed node and grows a content frame to the visible shadow', () => {
    const { svg, report } = convert(group('Root', [boxed({ filters: [shadow(0, 10, 4)] })]));
    // the filled shape is its own plate, and a plate includes its own shadow
    expect(report.rule).toBe('plate');
    expect(report.frame).toEqual({ x: 6, y: 10, w: 48, h: 54 });
    expect(svg).toMatch(/<filter id="shadow-1" filterUnits="userSpaceOnUse"[^>]*>/);
    expect(svg).toContain('<feGaussianBlur in="SourceAlpha" stdDeviation="2"');
    expect(svg).toContain('<feOffset dx="0" dy="10"');
    expect(svg).toMatch(/<feFlood flood-color="rgb\(0,0,0\)" flood-opacity="0.5"/);
    expect(svg).toMatch(/<g filter="url\(#shadow-1\)"><rect[^>]*fill="rgb\(255,0,0\)"/);
    // the filter region is never smaller than the visible shadow, or it would be cut
    const f = svg.match(/<filter [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
    const [x, y, w, h] = f.slice(1).map(Number) as [number, number, number, number];
    expect(x).toBeLessThanOrEqual(6);
    expect(y + h).toBeGreaterThanOrEqual(64);
    expect(x + w).toBeGreaterThanOrEqual(54);
  });

  it('paints the shadow under the shape and not beyond the offset', () => {
    // r = 0: no blur, so the shadow is a plain translated copy at 50 % alpha
    const { svg, report } = convert(group('Root', [boxed({ filters: [shadow(0, 10, 0)] })]));
    expect(report.frame).toEqual({ x: 10, y: 10, w: 40, h: 50 });
    expect(svg).not.toContain('feGaussianBlur');
    expect(alphaAt(svg, 40, 20, 20)).toBe(255); // shape
    const below = alphaAt(svg, 40, 20, 45); // y = 55: shadow only
    expect(below).toBeGreaterThan(110);
    expect(below).toBeLessThan(145);
  });

  it('grows a content frame to the visible shadow too', () => {
    const inherited = group('Root', [rect('box', 10, 10, 40, 40, { filters: [shadow(0, 10, 4)] })], {
      style: { fill: solid(255, 0, 0) },
    });
    const { report } = convert(inherited);
    expect(report.rule).toBe('content');
    expect(report.frame).toEqual({ x: 6, y: 10, w: 48, h: 54 });
  });

  it('keeps a plate frame: a shadow of another shape does not widen the background', () => {
    const small = rect('small', 70, 70, 20, 20, { fill: solid(0, 0, 255), filters: [shadow(0, 20, 4)] });
    const { report } = convert(group('Root', [card(), small]));
    expect(report.rule).toBe('plate');
    expect(report.frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('puts the filter outside the mask clip, so the group shadow follows the clipped art', () => {
    const masked = group('Masked', [rect('a', 0, 0, 30, 30, { fill: solid(1, 2, 3) })], {
      meta: {
        ux: {
          isMaskGroup: true,
          clipPathResources: { children: [rect('m', 0, 0, 20, 20)] },
        },
      },
      style: { filters: [shadow(2, 2, 2)] },
    });
    const { svg } = convert(group('Root', [card(), masked]));
    expect(svg).toMatch(/<g filter="url\(#shadow-1\)"><g clip-path="url\(#clip-1\)">/);
  });

  it('applies transform and opacity once, on the same wrapper as the filter', () => {
    const node = withTransform(boxed({ filters: [shadow(1, 1, 1)], opacity: 0.5 }), { tx: 3, ty: 4 });
    const { svg } = convert(group('Root', [card(), node]));
    expect(svg).toMatch(/<g transform="matrix\(1 0 0 1 3 4\)" opacity="0.5" filter="url\(#shadow-1\)"><rect/);
  });
});

describe('text', () => {
  it('emits one <text> at the baseline origin with a <tspan> per XD line', () => {
    const { svg } = convert(
      group('Root', [
        card(),
        text('T', 'Download\nBrochure', {
          x: 10,
          y: 40,
          fontStyle: 'Medium',
          fill: [255, 255, 255],
          lineHeight: 29,
        }),
      ]),
    );
    expect(svg).toContain('<text transform="matrix(1 0 0 1 10 40)" xml:space="preserve">');
    expect(svg).toContain(
      '<tspan x="0" y="0" font-family="Poppins, sans-serif" font-size="20" font-weight="500" fill="rgb(255,255,255)">Download</tspan>',
    );
    expect(svg).toContain('<tspan x="0" y="29" ');
    expect(svg).toContain('>Brochure</tspan></text>');
  });

  it('anchors centred and right text at the origin, so a fallback font stays centred', () => {
    const c = convert(group('Root', [card(), text('T', 'abcd', { align: 'center', xs: [-20] })])).svg;
    expect(c).toContain('text-anchor="middle"');
    expect(c).toContain('<tspan x="0" y="0"');
    const r = convert(group('Root', [card(), text('T', 'abcd', { align: 'right', xs: [-40] })])).svg;
    expect(r).toContain('text-anchor="end"');
  });

  it('flows later runs of a line without an x, and styles each run', () => {
    const { svg } = convert(
      group('Root', [
        card(),
        text('T', 'Hello World', {
          ranges: [
            {
              length: 6,
              fontFamily: 'Open Sans',
              fontStyle: 'Bold Italic',
              fontSize: 20,
              charSpacing: 0,
              fill: { value: argb([1, 2, 3]) },
            },
            {
              length: 5,
              fontFamily: 'Open Sans',
              fontStyle: 'Regular',
              fontSize: 14,
              charSpacing: 0,
              fill: { value: argb([9, 9, 9]) },
            },
          ],
        }),
      ]),
    );
    expect(svg).toMatch(
      /<tspan x="0" y="0" font-family="'Open Sans', sans-serif" font-size="20" font-weight="700" font-style="italic" fill="rgb\(1,2,3\)">Hello <\/tspan><tspan font-family="'Open Sans', sans-serif" font-size="14" font-weight="400" fill="rgb\(9,9,9\)">World<\/tspan>/,
    );
  });

  it('escapes markup and drops characters XML cannot carry', () => {
    const { svg } = convert(group('Root', [card(), text('T', 'a<b & c\u0001d')]));
    expect(svg).toContain('>a&lt;b &amp; cd</tspan>');
  });

  it('chooses a generic fallback by family', () => {
    const g = (family: string) => convert(group('Root', [card(), text('T', 'a', { family })])).svg;
    expect(g('Courier New')).toContain('font-family="\'Courier New\', monospace"');
    expect(g('Playfair Display')).toContain('serif"');
    expect(g('Poppins')).toContain('font-family="Poppins, sans-serif"');
  });

  it('gives a text-only root a frame from the layout: exact for centred text, estimated otherwise', () => {
    const centred = convert(text('T', 'abcd', { x: 100, y: 50, align: 'center', xs: [-20] }));
    // width = -2 * x = 40; ascent 0.8 * 20, descent 0.25 * 20 about the baseline
    expect(centred.report.frame).toEqual({ x: -20, y: -16, w: 40, h: 21 });
    const left = convert(group('Root', [text('T', 'Hi', { x: 10, y: 50, size: 20 })]));
    // 2 characters * 0.6 em estimate
    expect(left.report.frame).toEqual({ x: 10, y: 34, w: 24, h: 21 });
  });

  it('keeps a plate frame when text sits on a plate', () => {
    const { report } = convert(group('Root', [card(), text('T', 'Hello', { x: 10, y: 50 })]));
    expect(report.rule).toBe('plate');
    expect(report.frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('draws the shadow of a text node with a filter on the <text>', () => {
    const shadow = {
      type: 'dropShadow',
      global: true,
      params: {
        dropShadows: [
          { dx: 1, dy: 3, r: 3, color: { mode: 'RGB', value: { r: 0, g: 0, b: 0 }, alpha: 0.16 } },
        ],
      },
    };
    const { svg } = convert(
      group('Root', [card(), text('T', 'abc', { x: 10, y: 50, style: { filters: [shadow] } })]),
    );
    expect(svg).toMatch(/<text transform="[^"]*" xml:space="preserve" filter="url\(#shadow-1\)">/);
    expect(svg).toContain('<filter id="shadow-1"');
  });

  it('applies opacity to the <text>', () => {
    const { svg } = convert(group('Root', [card(), text('T', 'abc', { style: { opacity: 0.5 } })]));
    expect(svg).toMatch(/<text [^>]*opacity="0.5"/);
  });
});
