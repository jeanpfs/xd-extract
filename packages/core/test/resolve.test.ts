import { agcDoc, group, rect, solid } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/document';
import type { XdError } from '../src/errors';
import { resolveNode, selectArtboards } from '../src/resolve';

const body = [rect('r', 0, 0, 10, 10, { fill: solid(1, 2, 3) })];
const doc = {
  source: { kind: 'fixture' as const, ref: 't' },
  artboards: [
    {
      id: 'aaaa1111-0000',
      name: 'Home',
      aliases: ['artboard-aaaa1111-0000'],
      agc: agcDoc([group('icon', body), group('logo', body)]),
    },
    {
      id: 'bbbb2222-0000',
      name: 'Cart',
      aliases: ['artboard-bbbb2222-0000'],
      agc: agcDoc([group('icon', body)]),
    },
  ],
};
const parsed = parseDocument(doc);

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as XdError).code;
  }
  return undefined;
};

describe('selectArtboards', () => {
  it('matches by exact name, then id, then any alias containing the key', () => {
    expect(selectArtboards(parsed, 'Cart').map((a) => a.id)).toEqual(['bbbb2222-0000']);
    expect(selectArtboards(parsed, 'aaaa1111-0000').map((a) => a.name)).toEqual(['Home']);
    // the id found in a share URL can live inside a path-like alias of a differently named screen
    expect(selectArtboards(parsed, 'bbbb2222-00').map((a) => a.name)).toEqual(['Cart']);
  });

  it('does not alias-match very short keys', () => {
    expect(selectArtboards(parsed, 'art')).toEqual([]);
  });
});

describe('resolveNode', () => {
  it('finds a unique node by name', () => {
    const m = resolveNode(parsed, 'logo');
    expect(m.artboard.name).toBe('Home');
    expect(m.root.node.name).toBe('logo');
  });

  it('reports an ambiguous name across artboards, listing candidates', () => {
    expect(code(() => resolveNode(parsed, 'icon'))).toBe('AmbiguousTarget');
    expect(() => resolveNode(parsed, 'icon')).toThrowError(/Home\/icon.*Cart\/icon/s);
  });

  it('disambiguates with an artboard key', () => {
    expect(resolveNode(parsed, 'icon', 'Cart').artboard.name).toBe('Cart');
  });

  it('selects by id: prefix', () => {
    expect(resolveNode(parsed, 'id:id-logo').root.node.name).toBe('logo');
  });

  it('lists the available top-level names when nothing matches', () => {
    expect(code(() => resolveNode(parsed, 'nope'))).toBe('TargetNotFound');
    expect(() => resolveNode(parsed, 'nope')).toThrowError(/icon, logo, icon/);
  });

  it('fails with TargetNotFound for an unknown artboard key', () => {
    expect(code(() => resolveNode(parsed, 'icon', 'Missing'))).toBe('TargetNotFound');
  });
});
