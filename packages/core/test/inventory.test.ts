import { agcDoc, group, rect, solid } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document';
import { findEntries, inventory } from '../src/inventory';

const doc = {
  source: { kind: 'fixture' as const, ref: 't' },
  artboards: [
    {
      id: 'ab1',
      name: 'Home',
      agc: agcDoc([
        group('orange-art', [
          rect('big', 0, 0, 100, 100, { fill: solid(255, 156, 41) }),
          rect('small', 0, 0, 10, 10, { fill: solid(0, 0, 255) }),
        ]),
        group('blue-art', [rect('b', 20, 30, 40, 50, { fill: solid(10, 20, 250) })]),
        group('gradient-art', [rect('g', 0, 0, 5, 5, { fill: { type: 'gradient' } })]),
      ]),
    },
  ],
};
const entries = inventory(parseDocument(doc));

describe('inventory', () => {
  it('describes each top-level node with bbox, dominant colour, shape count and warning codes', () => {
    const orange = entries.find((e) => e.name === 'orange-art')!;
    expect(orange).toMatchObject({
      artboard: 'Home',
      artboardId: 'ab1',
      kind: 'group',
      bbox: { x: 0, y: 0, w: 100, h: 100 },
      dominantColor: 'rgb(255,156,41)',
      shapes: 2,
      warnings: [],
    });
    expect(entries.find((e) => e.name === 'blue-art')!.bbox).toEqual({ x: 20, y: 30, w: 40, h: 50 });
    expect(entries.find((e) => e.name === 'gradient-art')!.warnings).toEqual(['unsupported-fill:gradient']);
    expect(entries.find((e) => e.name === 'gradient-art')!.dominantColor).toBeNull();
  });
});

describe('findEntries', () => {
  it('searches by case-insensitive name substring', () => {
    expect(findEntries(entries, 'ORANGE').map((e) => e.name)).toEqual(['orange-art']);
    expect(findEntries(entries, 'zzz')).toEqual([]);
  });

  it('searches by colour, closest first, within a tolerance', () => {
    expect(findEntries(entries, '#ff9c29').map((e) => e.name)).toEqual(['orange-art']);
    expect(findEntries(entries, 'rgb(255, 150, 40)').map((e) => e.name)).toEqual(['orange-art']);
    expect(findEntries(entries, '#0000ff').map((e) => e.name)).toEqual(['blue-art']);
  });
});
