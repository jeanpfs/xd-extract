import { buildManifest } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { parseImages, parseManifest, parseResources } from '../src/manifest';

describe('parseManifest', () => {
  const manifest = buildManifest([
    { id: '767d4d20-3989', name: 'Splash', version: '1', bounds: { x: -477, y: 0, width: 360, height: 640 } },
    { id: '2b51a0ff-31d6', name: 'Artboard – 1' },
  ]);

  it('lists the pasteboard and every artboard that has a graphicContent.agc', () => {
    const list = parseManifest(manifest);
    expect(list.map((a) => [a.id, a.name, a.dir])).toEqual([
      ['pasteboard', 'pasteboard', 'pasteboard'],
      ['767d4d20-3989', 'Splash', 'artboard-767d4d20-3989'],
      ['2b51a0ff-31d6', 'Artboard – 1', 'artboard-2b51a0ff-31d6'],
    ]);
  });

  it('carries bounds, the AGC component id and its version when present', () => {
    const splash = parseManifest(manifest)[1]!;
    expect(splash.bounds).toEqual({ x: -477, y: 0, width: 360, height: 640 });
    expect(splash.agc).toEqual({ componentId: 'cmp-767d4d20-3989', version: '1' });
    expect(parseManifest(manifest)[2]!.agc).toEqual({ componentId: 'cmp-2b51a0ff-31d6' });
  });

  it('exposes every string of the subtree as aliases so a share-URL id can be matched', () => {
    const splash = parseManifest(manifest)[1]!;
    expect(splash.aliases).toContain('artboard-767d4d20-3989');
    expect(splash.aliases).toContain('Splash');
  });

  it('returns [] for a raster-only manifest (no artboard has an AGC)', () => {
    const rasterOnly = {
      id: 'x',
      children: [
        {
          id: 'a',
          name: 'artwork',
          path: 'artwork',
          children: [{ id: 'p', name: 'pasteboard', path: 'pasteboard' }],
        },
        { id: 'i', name: 'interactions', path: 'interactions' },
      ],
    };
    expect(parseManifest(rasterOnly)).toEqual([]);
  });

  it('returns [] when the manifest has no artwork directory', () => {
    expect(parseManifest({ children: [] })).toEqual([]);
    expect(parseManifest(null)).toEqual([]);
  });
});

describe('parseResources', () => {
  it('finds the document-wide resources AGC, with its version', () => {
    const m = buildManifest([{ id: 'a', name: 'A' }], {}, { resources: { version: '4' } });
    expect(parseResources(m)).toEqual({ componentId: 'cmp-resources', version: '4' });
    expect(parseResources(buildManifest([{ id: 'a', name: 'A' }], {}, { resources: {} }))).toEqual({
      componentId: 'cmp-resources',
    });
  });

  it('is null when the manifest has none, and does not take it for an artboard', () => {
    const m = buildManifest([{ id: 'a', name: 'A' }]);
    expect(parseResources(m)).toBeNull();
    expect(parseResources(null)).toBeNull();
    const withRes = buildManifest([{ id: 'a', name: 'A' }], {}, { resources: {} });
    expect(parseManifest(withRes).map((a) => a.id)).toEqual(['pasteboard', 'a']);
  });
});

describe('parseImages', () => {
  it('lists the image components by the uid pattern fills use', () => {
    const m = buildManifest(
      [{ id: 'a', name: 'A' }],
      {},
      { images: [{ uid: 'u1' }, { uid: 'u2', type: 'image/jpeg', version: '3' }] },
    );
    expect([...parseImages(m)]).toEqual([
      ['u1', { componentId: 'img-u1', type: 'image/png' }],
      ['u2', { componentId: 'img-u2', type: 'image/jpeg', version: '3' }],
    ]);
  });

  it('ignores components that are not images, and manifests with none', () => {
    const m = buildManifest(
      [{ id: 'a', name: 'A' }],
      {},
      { images: [{ uid: 'u1', type: 'application/json' }] },
    );
    expect(parseImages(m).size).toBe(0);
    expect(parseImages(buildManifest([{ id: 'a', name: 'A' }])).size).toBe(0);
    expect(parseImages(null).size).toBe(0);
  });
});
