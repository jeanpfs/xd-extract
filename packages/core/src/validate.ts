import { DOMParser } from '@xmldom/xmldom';
import { bandFraction, paintedRatio, rasterize } from './raster';
import type { Warning } from './warnings';

export type Severity = 'error' | 'warn';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  file?: string;
}

interface XmlNode {
  nodeType: number;
  nodeName: string;
  childNodes: ArrayLike<XmlNode>;
  attributes?: ArrayLike<{ name: string; value: string }>;
  getAttribute?(name: string): string;
  hasAttribute?(name: string): boolean;
}

const SHAPES = new Set(['path', 'rect', 'line', 'ellipse', 'circle', 'polygon', 'polyline']);
const err = (code: string, message: string): Finding => ({ code, severity: 'error', message });
const warn = (code: string, message: string): Finding => ({ code, severity: 'warn', message });

/** Unsupported paint, shapes or nodes silently lose art, so they fail validation; the rest only warn. */
const FATAL_WARNING = /^unsupported-(fill|stroke|shape|node):/;

export function readViewBox(svg: string): string {
  return /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1] ?? '';
}

export function validateStatic(svg: string, warnings: Warning[] = []): Finding[] {
  const findings: Finding[] = [];
  const problems: string[] = [];
  let root: XmlNode | null = null;
  try {
    const doc = new DOMParser({
      onError: (level, msg) => {
        if (level !== 'warning') problems.push(String(msg));
      },
    }).parseFromString(svg, 'image/svg+xml');
    root = (doc as unknown as { documentElement: XmlNode | null }).documentElement;
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  if (problems.length || !root) {
    return [err('xml-invalid', `XML does not parse: ${problems[0] ?? 'no root element'}`)];
  }
  if (root.nodeName !== 'svg') return [err('not-svg', `root element is <${root.nodeName}>, expected <svg>`)];

  if (!root.getAttribute?.('viewBox')) findings.push(err('no-viewbox', 'the <svg> element has no viewBox'));

  let shapes = 0;
  let missingFill = 0;
  let linesWithoutStroke = 0;
  let groupInClip = 0;
  let badNumbers = 0;

  const walk = (el: XmlNode, inClip: boolean, fillSet: boolean, strokeSet: boolean): void => {
    for (let i = 0; i < (el.attributes?.length ?? 0); i++) {
      if (/NaN|Infinity/.test((el.attributes as ArrayLike<{ value: string }>)[i]?.value ?? ''))
        badNumbers += 1;
    }
    const nowFill = fillSet || !!el.hasAttribute?.('fill');
    const nowStroke = strokeSet || !!el.hasAttribute?.('stroke');
    if (SHAPES.has(el.nodeName) && !inClip) {
      shapes += 1;
      if (!el.hasAttribute?.('fill') && !fillSet) missingFill += 1;
      if (el.nodeName === 'line' && !el.hasAttribute?.('stroke') && !strokeSet) linesWithoutStroke += 1;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i] as XmlNode;
      if (c.nodeType !== 1) continue;
      if (el.nodeName === 'clipPath' && c.nodeName === 'g') groupInClip += 1;
      walk(c, inClip || c.nodeName === 'clipPath', nowFill, nowStroke);
    }
  };
  walk(root, false, false, false);

  if (shapes === 0) findings.push(err('empty-svg', 'the SVG contains no shapes'));
  if (missingFill)
    findings.push(
      err('shape-missing-fill', `${missingFill} shape(s) have no explicit fill and render black`),
    );
  if (groupInClip)
    findings.push(
      err('group-in-clippath', `${groupInClip} <g> element(s) inside a clipPath (shapes only are allowed)`),
    );
  if (linesWithoutStroke)
    findings.push(
      err('line-without-stroke', `${linesWithoutStroke} <line> element(s) have no stroke and paint nothing`),
    );
  if (badNumbers) findings.push(err('nan-number', `${badNumbers} attribute(s) contain NaN or Infinity`));

  for (const w of warnings) {
    const f = FATAL_WARNING.test(w.code) ? err : warn;
    findings.push(
      f(`extraction:${w.code}`, `${w.message} (${w.count}x${w.example ? `, e.g. "${w.example}"` : ''})`),
    );
  }
  return findings;
}

const EMPTY_BAND = 0.02;
const PAINTED_BAND = 0.5;
const EDGE_LINE = 0.25;
const EMPTY_RENDER = 0.002;
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;

export function validateRaster(svg: string, opts: { rule?: 'plate' | 'content' } = {}): Finding[] {
  let r: ReturnType<typeof rasterize>;
  try {
    r = rasterize(svg);
  } catch (e) {
    return [
      err('render-failed', `resvg could not render the SVG: ${e instanceof Error ? e.message : String(e)}`),
    ];
  }
  if (paintedRatio(r) < EMPTY_RENDER) return [err('render-empty', 'the render is empty or nearly empty')];

  const findings: Finding[] = [];
  const k = Math.max(1, Math.round(0.02 * Math.min(r.width, r.height)));
  const band = {
    top: bandFraction(r, 'top', k),
    bottom: bandFraction(r, 'bottom', k),
    left: bandFraction(r, 'left', k),
    right: bandFraction(r, 'right', k),
  };
  for (const edge of ['top', 'left'] as const) {
    const opp = OPPOSITE[edge];
    for (const [a, b] of [
      [edge, opp],
      [opp, edge],
    ] as const) {
      if (band[a] < EMPTY_BAND && band[b] > PAINTED_BAND) {
        findings.push(
          warn(
            'edge-band-drift',
            `the ${a} edge band is empty while the ${b} edge band is painted: possible mask drift or off-centre frame`,
          ),
        );
      }
    }
  }
  if (opts.rule === 'content') {
    const lines = (['top', 'bottom', 'left', 'right'] as const).map((e) => bandFraction(r, e, 1));
    if (lines.every((f) => f >= EDGE_LINE)) {
      findings.push(
        warn('tight-frame', 'content reaches all four edges of a content-box frame: strokes may be clipped'),
      );
    }
  }
  return findings;
}

export function validateSvg(
  svg: string,
  opts: { warnings?: Warning[]; rule?: 'plate' | 'content' } = {},
): Finding[] {
  const stat = validateStatic(svg, opts.warnings ?? []);
  if (stat.some((f) => f.code === 'xml-invalid' || f.code === 'not-svg')) return stat;
  return [...stat, ...validateRaster(svg, { rule: opts.rule })];
}

export function validateSameFrame(items: { file: string; viewBox: string }[], tolerance = 1.5): Finding[] {
  const dims = items.map((i) => {
    const p = i.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return { file: i.file, w: p[2] as number, h: p[3] as number };
  });
  const ref = dims.find((d) => Number.isFinite(d.w) && Number.isFinite(d.h));
  if (!ref) return [];
  return dims
    .filter(
      (d) =>
        d !== ref &&
        (!Number.isFinite(d.w) ||
          !Number.isFinite(d.h) ||
          Math.abs(d.w - ref.w) > tolerance ||
          Math.abs(d.h - ref.h) > tolerance),
    )
    .map((d) => ({
      code: 'frame-mismatch',
      severity: 'error' as const,
      file: d.file,
      message: `viewBox size ${d.w}x${d.h} differs from ${ref.file} (${ref.w}x${ref.h})`,
    }));
}
