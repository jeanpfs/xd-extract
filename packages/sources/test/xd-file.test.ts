import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgc } from '@xd-extract/core';
import { agcDoc, buildManifest, group, rect, solid } from '@xd-extract/testkit';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadFixtureDocument, loadXdFile } from '../src';

const MIMETYPE = 'application/vnd.adobe.sparkler.project+dcxucf';
const json = (v: unknown) => strToU8(JSON.stringify(v));
const splashAgc = agcDoc([group('Logo', [rect('r', 0, 0, 10, 10, { fill: solid(1, 2, 3) })])]);

function buildXd(over: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}) {
  return zipSync({
    mimetype: [strToU8(MIMETYPE), { level: 0 }],
    manifest: json(
      buildManifest([
        { id: 'a1', name: 'Splash', bounds: { x: 0, y: 0, width: 360, height: 640 } },
        { id: 'a2', name: 'Missing AGC' },
      ]),
    ),
    'artwork/pasteboard/graphics/graphicContent.agc': json({ version: '1.5.0', children: [] }),
    'artwork/artboard-a1/graphics/graphicContent.agc': json(splashAgc),
    'resources/ignored.png': strToU8('not read'),
    ...over,
  });
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xd-extract-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = async (name: string, data: Uint8Array | string) => {
  const p = join(dir, name);
  await writeFile(p, data);
  return p;
};

describe('loadXdFile', () => {
  it('reads artboard names, ids, bounds and AGCs through the manifest', async () => {
    const doc = await loadXdFile(await write('demo.xd', buildXd()));
    expect(doc.source).toEqual({ kind: 'xd-file', ref: 'demo.xd' });
    expect(doc.artboards.map((a) => [a.id, a.name])).toEqual([
      ['pasteboard', 'pasteboard'],
      ['a1', 'Splash'],
    ]);
    const splash = doc.artboards[1]!;
    expect(splash.bounds).toEqual({ x: 0, y: 0, width: 360, height: 640 });
    expect(splash.aliases).toContain('artboard-a1');
    expect(parseAgc(splash.agc).map((r) => r.node.name)).toEqual(['Logo']);
  });

  it('skips manifest artboards whose AGC is not in the archive', async () => {
    const doc = await loadXdFile(await write('skip.xd', buildXd()));
    expect(doc.artboards.map((a) => a.name)).not.toContain('Missing AGC');
  });

  it.each([
    ['not a zip', () => strToU8('hello'), 'zip'],
    ['no mimetype', () => zipSync({ manifest: json(buildManifest([])) }), 'mimetype'],
    [
      'wrong mimetype',
      () => zipSync({ mimetype: strToU8('text/plain'), manifest: json(buildManifest([])) }),
      'mimetype',
    ],
    ['no manifest', () => zipSync({ mimetype: strToU8(MIMETYPE) }), 'manifest'],
  ])('rejects %s with NotAnXdFile', async (_name, make, hint) => {
    const p = await write(`bad-${hint}.xd`, make());
    await expect(loadXdFile(p)).rejects.toMatchObject({
      code: 'NotAnXdFile',
      message: expect.stringContaining(hint),
    });
  });

  it('rejects a missing file with NotAnXdFile', async () => {
    await expect(loadXdFile(join(dir, 'nope.xd'))).rejects.toMatchObject({ code: 'NotAnXdFile' });
  });

  it('rejects an artboard AGC that is not JSON with InvalidAgc', async () => {
    const p = await write(
      'badagc.xd',
      buildXd({ 'artwork/artboard-a1/graphics/graphicContent.agc': strToU8('{oops') }),
    );
    await expect(loadXdFile(p)).rejects.toMatchObject({ code: 'InvalidAgc' });
  });
});

describe('loadFixtureDocument', () => {
  it('reads a document.json and defaults the source ref to the parent directory name', async () => {
    const p = await write(
      'document.json',
      JSON.stringify({ artboards: [{ id: 'x', name: 'artboard-1', agc: splashAgc }] }),
    );
    const doc = await loadFixtureDocument(p);
    expect(doc.artboards).toHaveLength(1);
    expect(doc.source.kind).toBe('fixture');
  });

  it('rejects a file without an artboards array with InvalidAgc', async () => {
    const p = await write('wrong.json', JSON.stringify({ hello: 1 }));
    await expect(loadFixtureDocument(p)).rejects.toMatchObject({ code: 'InvalidAgc' });
  });
});
