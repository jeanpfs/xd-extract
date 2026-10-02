import { agcDoc, group, rect, solid } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { XdError } from '../src/errors';
import { collectPaintFacts, measureFrame } from '../src/frame';
import { parseAgc } from '../src/parse';

const rootOf = (...children: Parameters<typeof group>[1]) =>
  parseAgc(agcDoc([group('Root', children)]))[0]!.node;
const fill = { fill: solid(10, 20, 30) };

describe('measureFrame', () => {
  it('uses the plate when it covers at least half of the painted content', () => {
    const f = measureFrame(
      rootOf(rect('card', 0, 0, 100, 100, fill), rect('inner', 10, 10, 20, 20, { fill: solid(1, 1, 1) })),
    );
    expect(f.rule).toBe('plate');
    expect(f.box).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 });
  });

  it('falls back to the content box when the largest fill is just a glyph', () => {
    const f = measureFrame(rootOf(rect('dot', 0, 0, 10, 10, fill), rect('bar', 0, 50, 100, 10, fill)));
    expect(f.rule).toBe('content');
    expect(f.box).toEqual({ x0: 0, y0: 0, x1: 100, y1: 60 });
  });

  it('adds half the stroke width on every side of stroke-only shapes', () => {
    const stroked = rect('s', 10, 10, 20, 20, {
      stroke: { type: 'solid', color: solid(0, 0, 0).color, width: 4 },
    });
    const f = measureFrame(rootOf(stroked));
    expect(f.rule).toBe('content');
    expect(f.box).toEqual({ x0: 8, y0: 8, x1: 32, y1: 32 });
  });

  it('ignores hidden inner groups', () => {
    const hiddenBig = group('slide', [rect('huge', 0, 0, 1000, 1000, fill)], { style: { opacity: 0 } });
    const f = measureFrame(rootOf(rect('card', 0, 0, 50, 50, fill), hiddenBig));
    expect(f.box).toEqual({ x0: 0, y0: 0, x1: 50, y1: 50 });
  });

  it('counts an unsupported (gradient) fill as painted so it can be the plate', () => {
    const f = measureFrame(rootOf(rect('card', 0, 0, 80, 80, { fill: { type: 'gradient' } })));
    expect(f.box).toEqual({ x0: 0, y0: 0, x1: 80, y1: 80 });
  });

  it('throws NoPaintedGeometry when nothing paints', () => {
    const invisible = rect('n', 0, 0, 10, 10, { fill: { type: 'none' } });
    try {
      measureFrame(rootOf(invisible));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(XdError);
      expect((e as XdError).code).toBe('NoPaintedGeometry');
    }
  });

  it('throws NoPaintedGeometry for zero-area geometry', () => {
    expect(() => measureFrame(rootOf(rect('z', 5, 5, 0, 0, fill)))).toThrowError(XdError);
  });
});

describe('collectPaintFacts', () => {
  it('sums fill area per solid colour and counts shapes', () => {
    const facts = collectPaintFacts(
      rootOf(
        rect('a', 0, 0, 10, 10, { fill: solid(255, 0, 0) }),
        rect('b', 0, 0, 5, 5, { fill: solid(0, 0, 255) }),
        rect('c', 0, 0, 10, 10, { fill: solid(255, 0, 0) }),
      ),
    );
    expect(facts.shapes).toBe(3);
    expect(facts.fills.get('rgb(255,0,0)')).toBe(200);
    expect(facts.fills.get('rgb(0,0,255)')).toBe(25);
  });
});
