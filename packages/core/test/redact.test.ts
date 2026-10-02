import { describe, expect, it } from 'vitest';
import type { AgcDocument } from '../src/agc';
import { convertRoot } from '../src/convert';
import type { XdDocument } from '../src/document';
import { parseAgc } from '../src/parse';
import { redactDocument } from '../src/redact';

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
    ]);
    for (const [key, value] of leaves(red.artboards[0]!.agc)) {
      const ok = KEEP.has(key) || key === 'path' || /^(id-\d+|[a-z]+-\d+|x)$/.test(value);
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

  it('still parses and converts to the same SVG as the original', () => {
    const before = convertRoot('a', parseAgc(doc.artboards[0]!.agc)[0]!);
    const after = convertRoot('a', parseAgc(red.artboards[0]!.agc)[0]!);
    expect(after.svg).toBe(before.svg);
  });
});
