import { describe, expect, it } from 'vitest';
import type { AgcDocument } from '../src/agc';
import { convertRoot } from '../src/convert';
import { parseDocument, type XdDocument } from '../src/document';
import { parseAgc } from '../src/parse';
import { dropRoots, redactDocument } from '../src/redact';

const T = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const agc = {
  version: '1.5.0',
  children: [
    {
      type: 'artboard',
      id: 'aaaa-bbbb-cccc',
      artboard: {
        children: [
          {
            type: 'group',
            name: 'Confidential Logo',
            id: 'g-secret-1',
            transform: T,
            meta: { ux: { nameL10N: 'SHAPE_GROUP', symbolId: 'sym-secret' } },
            group: {
              children: [
                {
                  type: 'shape',
                  name: 'Brand Mark',
                  id: 'p-secret-2',
                  transform: T,
                  shape: { type: 'path', path: 'M 0 0 L 10 0 L 10 10 Z', winding: 'evenodd' },
                  style: {
                    fill: { type: 'pattern', href: 'secret.png' },
                    stroke: {
                      type: 'solid',
                      width: 2,
                      align: 'inside',
                      color: { mode: 'RGB', value: { r: 1, g: 2, b: 3 } },
                    },
                  },
                },
                {
                  type: 'shape',
                  name: 'Card',
                  id: 'r-secret-3',
                  transform: T,
                  shape: { type: 'rect', x: 0, y: 0, width: 100, height: 100, r: [4, 4, 4, 4] },
                  style: { fill: { type: 'solid', color: { mode: 'RGB', value: { r: 9, g: 8, b: 7 } } } },
                },
                {
                  type: 'text',
                  name: 'Title',
                  id: 't-secret-4',
                  transform: T,
                  text: { rawText: 'password123', paragraphs: [{ lines: [[{ from: 0, to: 11 }]] }] },
                  style: { font: { family: 'Helvetica Secret', style: 'Bold' } },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as AgcDocument;

const doc: XdDocument = {
  source: { kind: 'xd-file', ref: 'client-secret.xd' },
  artboards: [
    {
      id: 'aaaa-bbbb-cccc',
      name: 'Secret Dashboard',
      aliases: ['artboard-aaaa-bbbb-cccc', 'Secret Dashboard'],
      agc,
    },
  ],
};

const leaves = (v: unknown, key = '', out: [string, string][] = []): [string, string][] => {
  if (typeof v === 'string') out.push([key, v]);
  else if (Array.isArray(v)) for (const x of v) leaves(x, key, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) leaves(x, k, out);
  return out;
};

describe('redactDocument', () => {
  const red = redactDocument(doc);
  const text = JSON.stringify(red);

  it('removes names, ids, text, fonts, hrefs, source and aliases', () => {
    for (const secret of [
      'Secret',
      'Confidential',
      'Brand Mark',
      'password123',
      'Helvetica',
      'secret.png',
      'aaaa-bbbb',
      'client-secret',
      'sym-secret',
      'g-secret',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(red.source).toEqual({ kind: 'fixture', ref: 'redacted' });
    expect(red.artboards[0]!.name).toBe('artboard-1');
    expect(red.artboards[0]!.aliases).toBeUndefined();
  });

  it('keeps only structural strings: enums, path data and replacement tokens', () => {
    const KEEP = new Set([
      'type',
      'mode',
      'align',
      'winding',
      'operation',
      'cap',
      'join',
      'lineCap',
      'lineJoin',
      'version',
      'nameL10N',
      'rule',
      'fontStyle',
      'paragraphAlign',
      'textTransform',
      'textScript',
      'blendMode',
      'units',
    ]);
    for (const [key, value] of leaves(red.artboards[0]!.agc)) {
      // rawText keeps its length and line breaks so the stored line layout still indexes into it
      const ok =
        KEEP.has(key) ||
        key === 'path' ||
        (key === 'rawText' && /^[x\n]+$/.test(value)) ||
        /^(id-\d+|[a-z]+-\d+|x)$/.test(value);
      expect(ok, `${key}=${value}`).toBe(true);
    }
  });

  it('keeps geometry: path data and numbers', () => {
    expect(text).toContain('M 0 0 L 10 0 L 10 10 Z');
    expect(text).toContain('"width":100');
    expect(text).toContain('"winding":"evenodd"');
  });

  it('is deterministic and replaces equal ids with equal tokens', () => {
    expect(redactDocument(doc)).toEqual(red);
  });

  it('still parses and converts to the same geometry as the original', () => {
    const noText = (svg: string) => svg.replace(/<text\b[\s\S]*?<\/text>/g, '');
    const before = convertRoot('a', parseAgc(doc.artboards[0]!.agc)[0]!);
    const after = convertRoot('a', parseAgc(red.artboards[0]!.agc)[0]!);
    expect(noText(after.svg)).toBe(noText(before.svg));
  });

  it('keeps the length of text, so the laid-out lines still fit, but not its content or font', () => {
    const after = convertRoot('a', parseAgc(red.artboards[0]!.agc)[0]!).svg;
    expect(after).toContain('>xxxxxxxxxxx</tspan>');
    expect(after).not.toContain('password123');
    expect(after).not.toContain('Helvetica');
  });
});

describe('dropRoots', () => {
  const root = (name: string) => ({
    type: 'group',
    name,
    id: `id-${name}`,
    transform: T,
    group: { children: [] },
  });
  const mk = (): XdDocument => ({
    source: { kind: 'fixture', ref: 'x' },
    artboards: [
      {
        id: 'a1',
        name: 'Home',
        agc: {
          version: '1.5.0',
          children: [{ type: 'artboard', artboard: { children: [root('Logo'), root('Card')] } }],
        } as unknown as AgcDocument,
      },
      {
        id: 'a2',
        name: 'Cart',
        agc: {
          version: '1.5.0',
          children: [{ type: 'artboard', artboard: { children: [root('Logo')] } }],
        } as unknown as AgcDocument,
      },
      {
        id: 'pasteboard',
        name: 'pasteboard',
        agc: { version: '1.5.0', children: [root('Logo'), root('Loose')] } as unknown as AgcDocument,
      },
    ],
  });
  const names = (d: XdDocument) => d.artboards.map((a) => parseAgc(a.agc).map((r) => r.node.name));

  it('removes top-level roots by name in every artboard and in the pasteboard, and counts them', () => {
    const out = dropRoots(mk(), ['Logo']);
    expect(out.dropped).toEqual({ Logo: 3 });
    expect(names(out.doc)).toEqual([['Card'], [], ['Loose']]);
  });

  it('reports a name that matched nothing as 0, so callers can reject typos', () => {
    expect(dropRoots(mk(), ['Nope']).dropped).toEqual({ Nope: 0 });
  });

  it('does not mutate the input document', () => {
    const input = mk();
    const before = JSON.stringify(input);
    dropRoots(input, ['Logo', 'Card']);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('redactDocument resources', () => {
  const master = {
    type: 'group',
    name: 'Secret Button',
    id: 'master-uuid',
    meta: { ux: { symbolId: 'sym-uuid' } },
    group: {
      children: [
        {
          type: 'shape',
          name: 'bg',
          id: 'child-uuid',
          shape: { type: 'rect', x: 0, y: 0, width: 5, height: 5 },
        },
      ],
    },
  };
  const solid = { mode: 'RGB', value: { r: 1, g: 2, b: 3 } };
  const input: XdDocument = {
    source: { kind: 'xd-file', ref: 'secret.xd' },
    artboards: [
      {
        id: 'ab-uuid',
        name: 'Secret page',
        agc: {
          version: '1.5.0',
          children: [
            {
              type: 'artboard',
              artboard: {
                children: [
                  { type: 'syncRef', syncSourceGuid: 'master-uuid', guid: 'inst-uuid', transform: T },
                  {
                    type: 'shape',
                    name: 'g',
                    id: 'g-uuid',
                    transform: T,
                    shape: { type: 'rect', x: 0, y: 0, width: 5, height: 5 },
                    style: {
                      fill: {
                        type: 'gradient',
                        gradient: {
                          ref: 'grad-uuid',
                          x1: 0,
                          y1: 0,
                          x2: 1,
                          y2: 0,
                          units: 'objectBoundingBox',
                        },
                      } as never,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    resources: {
      version: '1.5.0',
      children: [],
      resources: {
        meta: {
          ux: {
            symbols: [master],
            documentLibrary: { elements: [{ name: 'Brand colours' }] },
            colorSwatches: [solid],
          },
        },
        gradients: {
          'grad-uuid': {
            type: 'linear',
            stops: [
              { offset: 0, color: solid },
              { offset: 1, color: solid },
            ],
          },
        },
      },
    } as unknown as XdDocument['resources'],
  };
  const red = redactDocument(input);
  const text = JSON.stringify(red);

  it('keeps symbol masters and gradients, and nothing else from the resources document', () => {
    expect(red.resources?.resources?.meta?.ux?.symbols).toHaveLength(1);
    expect(Object.keys(red.resources?.resources?.gradients ?? {})).toHaveLength(1);
    for (const secret of [
      'Secret Button',
      'Brand colours',
      'master-uuid',
      'sym-uuid',
      'grad-uuid',
      'Secret page',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('documentLibrary');
    expect(text).not.toContain('colorSwatches');
  });

  it('maps a reference and the id it names to the same token', () => {
    const at = (v: unknown, ...path: (string | number)[]): unknown =>
      path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], v);
    const page = at(red.artboards[0]!.agc, 'children', 0, 'artboard', 'children');
    const masterId = at(red.resources, 'resources', 'meta', 'ux', 'symbols', 0, 'id');
    expect(at(page, 0, 'syncSourceGuid')).toBe(masterId);
    const ref = at(page, 1, 'style', 'fill', 'gradient', 'ref');
    expect(Object.keys(red.resources?.resources?.gradients ?? {})).toEqual([ref]);
  });

  it('resolves the instance to the master after redaction', () => {
    const doc = parseDocument(red);
    expect(doc[0]!.roots).toHaveLength(2);
    expect(doc[0]!.roots[0]!.node.kind).toBe('group');
    expect(doc[0]!.roots[0]!.warnings).toEqual([]);
  });

  it('writes no resources key when the input had none', () => {
    expect(redactDocument({ ...input, resources: undefined }).resources).toBeUndefined();
  });
});
