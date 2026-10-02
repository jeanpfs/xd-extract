import { join } from 'node:path';
import {
  collectPaintFacts,
  convertRoot,
  type ParsedArtboard,
  parseDocument,
  validateStatic,
  XdError,
} from '@xd-extract/core';
import { loadFixtureDocument } from '@xd-extract/sources';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../../fixtures/public');
const NAMES = ['single'] as const;
const GOLDEN_MIN_SHAPES = 3;
const GOLDEN_MAX_SHAPES = 40;
const GOLDEN_COUNT = 8;

interface Case {
  slug: string;
  svg: string;
  warnings: string[];
}

function convertAll(artboards: ParsedArtboard[]): Case[] {
  const cases: Case[] = [];
  for (const a of artboards) {
    for (const r of a.roots) {
      try {
        const { svg, report } = convertRoot(a.name, r);
        cases.push({
          slug: `${a.name}-${r.node.name}`.replace(/[^a-z0-9-]/gi, '_'),
          svg,
          warnings: report.warnings.map((w) => w.code),
        });
      } catch (e) {
        if (!(e instanceof XdError && e.code === 'NoPaintedGeometry')) throw e;
      }
    }
  }
  return cases;
}

const loaded = await Promise.all(
  NAMES.map(async (name) => {
    const artboards = parseDocument(await loadFixtureDocument(join(ROOT, name, 'document.json')));
    const shapes = new Map<string, number>();
    for (const a of artboards)
      for (const r of a.roots)
        shapes.set(`${a.name}-${r.node.name}`.replace(/[^a-z0-9-]/gi, '_'), collectPaintFacts(r.node).shapes);
    const cases = convertAll(artboards);
    // Richest small roots first: a lone rectangle protects almost nothing.
    const golden = cases
      .filter((c) => {
        const n = shapes.get(c.slug) ?? 0;
        return n >= GOLDEN_MIN_SHAPES && n <= GOLDEN_MAX_SHAPES;
      })
      .sort((a, b) => (shapes.get(b.slug) ?? 0) - (shapes.get(a.slug) ?? 0))
      .slice(0, GOLDEN_COUNT);
    return { name, cases, golden };
  }),
);

describe.each(loaded)('public fixture $name', ({ name, cases, golden }) => {
  it('converts a meaningful number of roots', () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(golden.length).toBeGreaterThanOrEqual(3);
  });

  it('emits statically valid SVG for every convertible root', () => {
    for (const c of cases) expect(validateStatic(c.svg), c.slug).toEqual([]);
  });

  it.each(golden)('matches the golden SVG for $slug', async ({ slug, svg }) => {
    await expect(`${svg}\n`).toMatchFileSnapshot(`./golden/${name}/${slug}.svg`);
  });
});

describe('what the public fixture exercises', () => {
  it('reports every unsupported feature instead of dropping it silently', () => {
    // Gradient, filters and style.clipPath do not occur in single.xd; the synthetic tests cover them.
    const codes = new Set(loaded.flatMap((d) => d.cases.flatMap((c) => c.warnings)));
    for (const expected of ['skipped-text', 'unsupported-fill:pattern', 'stroke-align-ignored:inside']) {
      expect(codes, expected).toContain(expected);
    }
  });
});
