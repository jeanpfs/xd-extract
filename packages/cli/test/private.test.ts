import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertRoot, parseDocument, resolveNode } from '@xd-extract/core';
import { loadFixtureDocument, loadXdFile } from '@xd-extract/sources';
import { describe, expect, it } from 'vitest';

/**
 * LOCAL ONLY. XD_PRIVATE_FIXTURE_DIR holds one `.xd` (or a `document.json`) plus `expected.json`:
 *   [{ "artboard": "...", "node": "...", "rule": "plate", "frame": { "w": 328, "h": 320 },
 *      "minShapes": 10, "maxShapes": 400 }]
 * Test titles never contain names from the private file. A failure message can: do not paste it publicly.
 * The SVG output is never written to disk or committed.
 */
interface Expected {
  artboard?: string;
  node: string;
  rule?: 'plate' | 'content';
  frame?: { w: number; h: number };
  minShapes?: number;
  maxShapes?: number;
}

const dir = process.env.XD_PRIVATE_FIXTURE_DIR;

async function load(root: string) {
  const xd = readdirSync(root).find((f) => f.endsWith('.xd'));
  const doc = xd ? await loadXdFile(join(root, xd)) : await loadFixtureDocument(join(root, 'document.json'));
  if (!existsSync(join(root, 'expected.json')))
    throw new Error('XD_PRIVATE_FIXTURE_DIR has no expected.json');
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Expected[];
  return { doc, artboards: parseDocument(doc), expected };
}

// Loaded at module level so a missing variable skips cleanly instead of failing during collection.
const loaded = dir ? await load(dir) : undefined;

describe.skipIf(!loaded)('private fixture (local only)', () => {
  const { doc, artboards, expected } = loaded ?? {
    doc: undefined,
    artboards: [],
    expected: [] as Expected[],
  };

  it.each(expected.map((e, i) => ({ e, n: i + 1 })))('case $n', ({ e, n }) => {
    const match = resolveNode(artboards, e.node, e.artboard);
    const { svg, report } = convertRoot(match.artboard.name, match.root, doc?.source ?? null);
    if (e.rule) expect(report.rule, `case ${n} rule`).toBe(e.rule);
    if (e.frame) {
      expect(Math.abs(report.frame.w - e.frame.w), `case ${n} width`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(report.frame.h - e.frame.h), `case ${n} height`).toBeLessThanOrEqual(1.5);
    }
    const shapes = (svg.match(/<(path|rect|line|ellipse)\b/g) ?? []).length;
    if (e.minShapes !== undefined) expect(shapes, `case ${n} min shapes`).toBeGreaterThanOrEqual(e.minShapes);
    if (e.maxShapes !== undefined) expect(shapes, `case ${n} max shapes`).toBeLessThanOrEqual(e.maxShapes);
  });
});
