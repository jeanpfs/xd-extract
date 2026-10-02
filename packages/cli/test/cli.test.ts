import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_CODES, EXIT_VALIDATION_FAILED } from '@xd-extract/core';
import { agcDoc, buildManifest, circle, group, rect, solid } from '@xd-extract/testkit';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/main';

const MIMETYPE = 'application/vnd.adobe.sparkler.project+dcxucf';
const agc = agcDoc([
  group('Card', [
    rect('card', 0, 0, 100, 100, { fill: solid(255, 156, 41) }),
    circle('dot', 50, 50, 10, { fill: solid(0, 0, 0) }),
  ]),
  group('Gradient', [rect('g', 0, 0, 40, 40, { fill: { type: 'gradient' } })]),
  group('Label', [{ type: 'text', name: 'Title' }, rect('bg', 0, 0, 60, 20, { fill: solid(9, 9, 9) })]),
]);

let dir: string;
let xd: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'xd-cli-'));
  xd = join(dir, 'demo.xd');
  const j = (v: unknown) => strToU8(JSON.stringify(v));
  writeFileSync(
    xd,
    zipSync({
      mimetype: [strToU8(MIMETYPE), { level: 0 }],
      manifest: j(buildManifest([{ id: 'a1', name: 'Home' }])),
      'artwork/pasteboard/graphics/graphicContent.agc': j({ version: '1.5.0', children: [] }),
      'artwork/artboard-a1/graphics/graphicContent.agc': j(agc),
    }),
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const xdc = async (...args: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join(''), err: err.join('') };
};

describe('usage', () => {
  it('prints help with exit 0, and fails with exit 2 on missing or unknown input', async () => {
    const help = await xdc('--help');
    expect(help.code).toBe(0);
    expect(help.out).toContain('xd inventory');
    expect((await xdc()).code).toBe(EXIT_CODES.Usage);
    expect((await xdc('bogus')).code).toBe(EXIT_CODES.Usage);
    expect((await xdc('inventory')).code).toBe(EXIT_CODES.Usage);
    expect((await xdc('inventory', xd, '--bogus')).code).toBe(EXIT_CODES.Usage);
    expect((await xdc('inventory', xd, '--browser')).code).toBe(EXIT_CODES.Usage);
  });
});

describe('inventory', () => {
  it('lists top-level nodes as JSON with warnings', async () => {
    const r = await xdc('inventory', xd, '--json');
    expect(r.code).toBe(0);
    const entries = JSON.parse(r.out) as { name: string; warnings: string[] }[];
    expect(entries.map((e) => e.name)).toEqual(['Card', 'Gradient', 'Label']);
    expect(entries.find((e) => e.name === 'Label')!.warnings).toEqual(['skipped-text']);
  });

  it('prints a readable table by default and finds by colour', async () => {
    const table = await xdc('inventory', xd);
    expect(table.out).toContain('Home');
    expect(table.out).toContain('Card');
    const byColour = JSON.parse((await xdc('inventory', xd, '--find', '#ff9c29', '--json')).out) as {
      name: string;
    }[];
    expect(byColour.map((e) => e.name)).toEqual(['Card']);
  });

  it('writes an HTML preview with the SVGs inline', async () => {
    const file = join(dir, 'preview.html');
    const r = await xdc('inventory', xd, '--preview', file);
    expect(r.code).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain('<svg');
  });

  it('fails with TargetNotFound for an unknown artboard', async () => {
    expect((await xdc('inventory', xd, '--artboard', 'Nope')).code).toBe(EXIT_CODES.TargetNotFound);
  });
});

describe('extract', () => {
  it('writes the SVG and a sidecar report', async () => {
    const out = join(dir, 'out', 'card.svg');
    const r = await xdc('extract', xd, '--node', 'Card', '-o', out);
    expect(r.code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 100 100"');
    const report = JSON.parse(readFileSync(`${out}.report.json`, 'utf8'));
    expect(report).toMatchObject({
      node: 'Card',
      artboard: 'Home',
      rule: 'plate',
      source: { kind: 'xd-file', ref: 'demo.xd' },
    });
  });

  it('reports TargetNotFound with the available names', async () => {
    const r = await xdc('extract', xd, '--node', 'Nope', '-o', join(dir, 'x.svg'));
    expect(r.code).toBe(EXIT_CODES.TargetNotFound);
    expect(r.err).toContain('TargetNotFound');
    expect(r.err).toContain('Card, Gradient, Label');
    expect(existsSync(join(dir, 'x.svg'))).toBe(false);
  });

  it('extracts several nodes from a map file', async () => {
    const map = join(dir, 'map.json');
    writeFileSync(
      map,
      JSON.stringify([
        { file: 'a.svg', node: 'Card' },
        { file: 'b.svg', node: 'Label' },
      ]),
    );
    const r = await xdc('extract', xd, '--map', map, '-d', join(dir, 'mapped'));
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'mapped', 'a.svg'))).toBe(true);
    expect(existsSync(join(dir, 'mapped', 'b.svg'))).toBe(true);
  });

  it('does not write anything when one job of a map fails', async () => {
    const map = join(dir, 'bad-map.json');
    writeFileSync(
      map,
      JSON.stringify([
        { file: 'ok.svg', node: 'Card' },
        { file: 'no.svg', node: 'Nope' },
      ]),
    );
    const r = await xdc('extract', xd, '--map', map, '-d', join(dir, 'atomic'));
    expect(r.code).toBe(EXIT_CODES.TargetNotFound);
    expect(existsSync(join(dir, 'atomic', 'ok.svg'))).toBe(false);
  });

  it('needs --node and -o, or --map', async () => {
    expect((await xdc('extract', xd)).code).toBe(EXIT_CODES.Usage);
  });
});

describe('validate', () => {
  const svg = (name: string) => join(dir, 'val', `${name}.svg`);
  beforeAll(async () => {
    for (const node of ['Card', 'Gradient', 'Label'])
      await xdc('extract', xd, '--node', node, '-o', svg(node));
  });

  it('passes a clean extraction', async () => {
    const r = await xdc('validate', svg('Card'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 error(s)');
  });

  it('fails an extraction that dropped a gradient, using the sidecar report', async () => {
    const r = await xdc('validate', svg('Gradient'));
    expect(r.code).toBe(EXIT_VALIDATION_FAILED);
    expect(r.out).toContain('extraction:unsupported-fill:gradient');
  });

  it('only warns about skipped text', async () => {
    const r = await xdc('validate', svg('Label'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('extraction:skipped-text');
  });

  it('flags a set whose frames differ with --expect-same-frame', async () => {
    const r = await xdc('validate', svg('Card'), svg('Label'), '--expect-same-frame');
    expect(r.code).toBe(EXIT_VALIDATION_FAILED);
    expect(r.out).toContain('frame-mismatch');
  });

  it('exits 2 for an unreadable file', async () => {
    expect((await xdc('validate', join(dir, 'missing.svg'))).code).toBe(EXIT_CODES.Usage);
  });
});

describe('redact', () => {
  it('writes an anonymised document.json that the other commands accept', async () => {
    const out = join(dir, 'red');
    const r = await xdc('redact', xd, '-o', out);
    expect(r.code).toBe(0);
    expect(r.out).toContain('geometry is kept');
    const inv = await xdc('inventory', join(out, 'document.json'), '--json');
    const names = (JSON.parse(inv.out) as { name: string }[]).map((e) => e.name);
    expect(names).toHaveLength(3);
    expect(names).not.toContain('Card');
    expect(readFileSync(join(out, 'document.json'), 'utf8')).not.toContain('Card');
  });
});
