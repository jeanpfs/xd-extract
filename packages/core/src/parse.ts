import type { AgcDocument, AgcNode, AgcPaint, AgcShape, AgcStyle, AgcTextRange, AgcTransform } from './agc';
import { type AgcColor, solidCss } from './color';
import { XdError } from './errors';
import { fontStyleOf } from './font';
import type {
  Geom,
  IrClipShape,
  IrGroup,
  IrNode,
  IrShape,
  IrText,
  IrTextLine,
  IrTextRun,
  Paint,
  Point,
  Shadow,
  Stroke,
} from './ir';
import { IDENTITY, type Matrix, round } from './matrix';
import { type Warning, WarningCollector } from './warnings';

export interface ParsedRoot {
  node: IrNode;
  warnings: Warning[];
}

interface Inherited {
  fill: Paint | null;
  stroke: Paint | null;
  strokeWidth: number | undefined;
}

const ROOT_INHERITED: Inherited = { fill: null, stroke: null, strokeWidth: undefined };

const transformOf = (t?: AgcTransform): Matrix => (t ? [t.a, t.b, t.c, t.d, t.tx, t.ty] : IDENTITY);

const isHidden = (n: AgcNode): boolean => n.visible === false || n.style?.opacity === 0;

/** undefined: not declared (inherit). null: explicitly none. */
type Declared = Paint | null | undefined;

function readPaint(
  p: AgcPaint | undefined,
  where: 'fill' | 'stroke',
  w: WarningCollector,
  name: string,
): Declared {
  if (!p) return undefined;
  if (p.type === 'none') return null;
  if (p.type === 'solid' && p.color) {
    const mode = p.color.mode;
    if (mode && mode !== 'RGB') {
      w.add(
        `unsupported-${where}:color-mode-${mode}`,
        `${where} uses colour mode ${mode}; only RGB is converted`,
        name,
      );
      return { kind: 'unsupported', reason: `color-mode-${mode}` };
    }
    return { kind: 'solid', css: solidCss(p.color) };
  }
  const reason = p.type ?? 'unknown';
  w.add(`unsupported-${where}:${reason}`, `${where} of type "${reason}" is not converted yet`, name);
  return { kind: 'unsupported', reason };
}

const FILTERS_MSG = 'a style.filters entry could not be converted';

/** Drop shadows become IR; every other filter, and any shadow we cannot read exactly, is reported. */
function readShadows(st: AgcStyle, name: string, w: WarningCollector): Shadow[] {
  const filters = st.filters;
  if (!filters || (Array.isArray(filters) && filters.length === 0)) return [];
  if (!Array.isArray(filters)) {
    w.add('unsupported-style:filters', FILTERS_MSG, name);
    return [];
  }
  const out: Shadow[] = [];
  for (const f of filters as Record<string, unknown>[]) {
    const type = typeof f?.type === 'string' ? f.type : undefined;
    if (type !== undefined && type !== 'dropShadow') {
      w.add(`unsupported-style:filters:${type}`, `filter "${type}" is not converted`, name);
      continue;
    }
    const list = (f?.params as { dropShadows?: unknown } | undefined)?.dropShadows;
    const parsed = Array.isArray(list) ? list.map(readShadow) : [];
    if (!parsed.length || parsed.some((s) => !s)) {
      w.add('unsupported-style:filters', FILTERS_MSG, name);
      continue;
    }
    // Only `global: true` has been observed (the shadow of the rendered node as a whole).
    if (f.global !== true) {
      w.add(
        'unsupported-style:filters:dropShadow-local',
        'drop shadow without global: true is not converted',
        name,
      );
      continue;
    }
    out.push(...(parsed as Shadow[]));
  }
  return out;
}

function readShadow(raw: unknown): Shadow | null {
  const s = raw as { dx?: unknown; dy?: unknown; r?: unknown; color?: AgcColor } | null;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!s || !isNum(s.dx) || !isNum(s.dy) || !isNum(s.r) || s.r < 0) return null;
  const c = s.color;
  if (!c || (c.mode && c.mode !== 'RGB')) return null;
  const a = c.alpha;
  if (a !== undefined && a !== null && !isNum(a)) return null;
  return { dx: s.dx, dy: s.dy, r: s.r, color: solidCss({ ...c, alpha: undefined }), opacity: a ?? 1 };
}

function noteStyle(st: AgcStyle, name: string, w: WarningCollector): void {
  if (st.clipPath)
    w.add('unsupported-style:clipPath', 'style.clipPath (repeat-grid mask) is not converted', name);
}

const warnAlign = (align: string, name: string, w: WarningCollector): void =>
  w.add(`stroke-align-ignored:${align}`, `stroke align "${align}" is rendered centred`, name);

/** Every subpath is closed: inside/outside only means something for those. */
const isClosed = (g: Geom): boolean => {
  if (g.tag === 'rect' || g.tag === 'ellipse') return true;
  if (g.tag === 'line') return false;
  const moves = (g.d.match(/[Mm]/g) ?? []).length;
  return moves > 0 && moves === (g.d.match(/[Zz]/g) ?? []).length;
};

const pairs = (d: string): Point[] => {
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] as number, nums[i + 1] as number]);
  return pts;
};

function pathGeom(d: string, evenodd: boolean, name: string, w: WarningCollector): Geom {
  const letters = d.replace(/(\d)e([-+]?\d)/gi, '$1$2').match(/[A-Za-z]/g) ?? [];
  if (letters.some((ch) => !'MLCZ'.includes(ch))) {
    w.add(
      'path-bbox-approximate',
      'path uses commands other than absolute M/L/C/Z; frame bbox is approximate',
      name,
    );
  }
  return { tag: 'path', d, evenodd, pts: pairs(d) };
}

type Radii = [number, number, number, number];

function cornerRadii(r: number | number[] | undefined, width: number, height: number): Radii | undefined {
  if (r === undefined) return undefined;
  const four = typeof r === 'number' ? [r, r, r, r] : r.length === 4 ? r : undefined;
  if (!four || four.every((v) => !v)) return undefined;
  const k = Math.min(width, height) / 2;
  return four.map((v) => Math.min(v, k)) as Radii;
}

function roundedRectPath(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: Radii): string {
  const f = round;
  return [
    `M ${f(x + tl)} ${f(y)}`,
    `L ${f(x + w - tr)} ${f(y)}`,
    `A ${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}`,
    `L ${f(x + w)} ${f(y + h - br)}`,
    `A ${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}`,
    `L ${f(x + bl)} ${f(y + h)}`,
    `A ${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}`,
    `L ${f(x)} ${f(y + tl)}`,
    `A ${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}`,
    'Z',
  ].join(' ');
}

function readGeom(s: AgcShape | undefined, name: string, w: WarningCollector): Geom | null {
  if (!s) return null;
  switch (s.type) {
    case 'path':
      return pathGeom(s.path ?? '', s.winding === 'evenodd', name, w);
    case 'compound':
      return pathGeom(s.path ?? '', false, name, w);
    case 'rect': {
      const x = s.x ?? 0;
      const y = s.y ?? 0;
      const width = s.width ?? 0;
      const height = s.height ?? 0;
      const pts: Point[] = [
        [x, y],
        [x + width, y],
        [x, y + height],
        [x + width, y + height],
      ];
      const radii = cornerRadii(s.r, width, height);
      if (!radii) return { tag: 'rect', x, y, width, height, pts };
      if (radii.every((v) => v === radii[0])) return { tag: 'rect', x, y, width, height, rx: radii[0], pts };
      return { tag: 'path', d: roundedRectPath(x, y, width, height, radii), evenodd: false, pts };
    }
    case 'line': {
      const [x1, y1, x2, y2] = [s.x1 ?? 0, s.y1 ?? 0, s.x2 ?? 0, s.y2 ?? 0];
      return {
        tag: 'line',
        x1,
        y1,
        x2,
        y2,
        pts: [
          [x1, y1],
          [x2, y2],
        ],
      };
    }
    case 'circle':
    case 'ellipse': {
      const radius = typeof s.r === 'number' ? s.r : 0;
      const [cx, cy, rx, ry] = [s.cx ?? 0, s.cy ?? 0, s.rx ?? radius, s.ry ?? radius];
      return {
        tag: 'ellipse',
        cx,
        cy,
        rx,
        ry,
        pts: [
          [cx - rx, cy - ry],
          [cx + rx, cy + ry],
        ],
      };
    }
    default:
      w.add(
        `unsupported-shape:${s.type ?? 'unknown'}`,
        `shape type "${s.type ?? 'unknown'}" is not converted`,
        name,
      );
      return null;
  }
}

function strokeExtras(s: AgcPaint | undefined): Partial<Stroke> {
  if (!s) return {};
  const out: Partial<Stroke> = {};
  const cap = s.cap || s.lineCap;
  if (cap) out.cap = cap;
  const join = s.join || s.lineJoin;
  if (join) out.join = join;
  if (s.miterLimit !== undefined) out.miterLimit = s.miterLimit;
  if (s.dash?.length) out.dash = s.dash;
  return out;
}

function parseShape(n: AgcNode, inh: Inherited, w: WarningCollector): IrShape | null {
  const name = n.name ?? '';
  const geom = readGeom(n.shape, name, w);
  if (!geom) return null;
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const shadows = readShadows(st, name, w);
  const declaredFill = readPaint(st.fill, 'fill', w, name);
  const declaredStroke = readPaint(st.stroke, 'stroke', w, name);
  const ownFill = declaredFill != null;
  let fill: Paint | null = declaredFill === undefined ? inh.fill : declaredFill;
  let strokePaint: Paint | null = declaredStroke === undefined ? inh.stroke : declaredStroke;
  let width = st.stroke?.width !== undefined ? st.stroke.width : inh.strokeWidth;
  // XD keeps a line node's colour in `fill`; an SVG <line> paints nothing without a stroke.
  if (geom.tag === 'line' && !strokePaint && fill) {
    strokePaint = fill;
    fill = null;
    if (width === undefined) width = 1;
  }
  const stroke: Stroke | null = strokePaint
    ? { paint: strokePaint, width, ...strokeExtras(st.stroke) }
    : null;
  // Alignment only matters when something is stroked. Closed shapes honour inside/outside (see emit);
  // anything else is drawn centred and says so.
  const align = st.stroke?.align;
  if (stroke && align && align !== 'center') {
    if ((align === 'inside' || align === 'outside') && isClosed(geom)) stroke.align = align;
    else warnAlign(align, name, w);
  }
  return {
    kind: 'shape',
    id: n.id ?? '',
    name,
    transform: transformOf(n.transform),
    geom,
    fill,
    ownFill,
    stroke,
    opacity: st.opacity ?? 1,
    shadows,
  };
}

function parseGroup(n: AgcNode, inh: Inherited, w: WarningCollector): IrGroup {
  const name = n.name ?? '';
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const shadows = readShadows(st, name, w);
  const f = readPaint(st.fill, 'fill', w, name);
  const s = readPaint(st.stroke, 'stroke', w, name);
  // A group stroke is only inherited as paint and width; its alignment is not.
  const groupAlign = st.stroke?.align;
  if (s && groupAlign && groupAlign !== 'center') warnAlign(groupAlign, name, w);
  // A group-level "none" does not clear what children inherit (matches the prototype).
  const next: Inherited = {
    fill: f ? f : inh.fill,
    stroke: s ? s : inh.stroke,
    strokeWidth: st.stroke?.width !== undefined ? st.stroke.width : inh.strokeWidth,
  };

  let clip: IrGroup['clip'] = null;
  const ux = n.meta?.ux;
  const resources = ux?.clipPathResources?.children;
  if (ux?.isMaskGroup && resources?.length) {
    const shapes: IrClipShape[] = [];
    for (const c of resources) {
      const g = readGeom(c.shape, c.name ?? name, w);
      if (g) shapes.push({ name: c.name ?? '', transform: transformOf(c.transform), geom: g });
    }
    if (shapes.length) clip = { maskName: name, shapes };
  }

  const children: IrNode[] = [];
  for (const c of n.group?.children ?? []) {
    const parsed = parseNode(c, next, w, false);
    if (parsed) children.push(parsed);
  }
  return {
    kind: 'group',
    id: n.id ?? '',
    name,
    transform: transformOf(n.transform),
    opacity: st.opacity ?? 1,
    shadows,
    clip,
    children,
  };
}

/** Width guess per character, in em, for text whose width XD does not store (left-aligned). */
const EM_WIDTH = 0.6;
const ASCENT = 0.8;
const DESCENT = 0.25;

/** `value` is ARGB in an unsigned 32-bit integer. */
function argbCss(value: number): string {
  const a = (value >>> 24) & 255;
  const r = (value >>> 16) & 255;
  const g = (value >>> 8) & 255;
  const b = value & 255;
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${round(a / 255)})`;
}

function parseText(n: AgcNode, w: WarningCollector): IrText | null {
  const name = n.name ?? '';
  const t = n.text;
  const raw = t?.rawText;
  if (!t || typeof raw !== 'string' || !Array.isArray(t.paragraphs)) {
    w.add('skipped-text', 'text node has no readable layout and is skipped', name);
    return null;
  }
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const shadows = readShadows(st, name, w);

  if (t.frame?.type && t.frame.type !== 'positioned') {
    w.add(
      `unsupported-text:frame-${t.frame.type}`,
      `text frame "${t.frame.type}" was never observed; the line layout is used as is`,
      name,
    );
  }
  const strokeType = st.stroke?.type;
  if (strokeType && strokeType !== 'none') {
    w.add('unsupported-stroke:text', 'a stroke on text is not converted', name);
  }

  // Style per character range. Without ranged styles, the node's own font and fill apply to everything.
  const nodeFill = readPaint(st.fill, 'fill', w, name);
  const nodeFillCss = nodeFill?.kind === 'solid' ? nodeFill.css : null;
  const ranges: (AgcTextRange & { end: number })[] = [];
  let at = 0;
  for (const r of n.meta?.ux?.rangedStyles ?? []) {
    at += r.length ?? 0;
    ranges.push({ ...r, end: at });
  }
  if (!ranges.length) {
    ranges.push({
      end: Number.POSITIVE_INFINITY,
      fontFamily: st.font?.family,
      fontStyle: st.font?.style,
      fontSize: st.font?.size,
      charSpacing: 0,
    });
  }
  const rangeAt = (i: number) =>
    ranges.find((r) => i < r.end) ?? (ranges[ranges.length - 1] as (typeof ranges)[number]);

  // Layout warnings are only real if the node survives: whitespace-only text is dropped silently.
  const pending: [string, string, string | undefined][] = [];
  const later = (code: string, message: string, example?: string) => pending.push([code, message, example]);
  const known = new Set<string>();
  const runOf = (text: string, r: AgcTextRange): IrTextRun => {
    const family = r.fontFamily ?? st.font?.family ?? 'sans-serif';
    const size = r.fontSize ?? st.font?.size ?? 16;
    const { weight, italic } = fontStyleOf(r.fontStyle ?? st.font?.style);
    if (weight === undefined) {
      later(
        'text-font-style-unknown',
        `font style "${r.fontStyle}" is not a known weight; 400 is used`,
        name,
      );
    }
    if (!known.has(family)) {
      known.add(family);
      later(
        `text-font-not-embedded:${family}`,
        `font "${family}" is not embedded: the SVG renders with whatever the viewer has`,
        name,
      );
    }
    if (r.charSpacing) {
      later(
        'text-letter-spacing-unverified',
        'charSpacing is read as 1/1000 em, which was never observed on a non-zero value',
        name,
      );
    }
    const fill = r.fill?.value !== undefined ? argbCss(r.fill.value) : nodeFillCss;
    return {
      text,
      family,
      weight: weight ?? 400,
      italic,
      size,
      letterSpacing: round(((r.charSpacing ?? 0) / 1000) * size),
      fill,
    };
  };

  const lines: IrTextLine[] = [];
  for (const p of t.paragraphs) {
    for (const line of p.lines ?? []) {
      const segs = line.filter((s) => typeof s.from === 'number' && typeof s.to === 'number');
      if (!segs.length) continue;
      const runs: IrTextRun[] = [];
      for (const s of segs) {
        let from = s.from as number;
        const to = Math.min(s.to as number, raw.length);
        while (from < to) {
          const r = rangeAt(from);
          // past the last range (text longer than the styles cover) the last style keeps going
          const stop = r.end > from ? Math.min(to, r.end) : to;
          runs.push(runOf(raw.slice(from, stop), r));
          from = stop;
        }
      }
      if (runs.length) lines.push({ x: segs[0]?.x ?? 0, y: segs[0]?.y ?? 0, runs });
    }
  }
  if (!lines.some((l) => l.runs.some((r) => r.text.trim() !== ''))) return null; // paints nothing
  for (const [code, message, example] of pending) w.add(code, message, example);

  const alignRaw = st.textAttributes?.paragraphAlign;
  let align: IrText['align'] = 'left';
  if (alignRaw === 'center' || alignRaw === 'right') align = alignRaw;
  else if (alignRaw && alignRaw !== 'left') {
    w.add(
      `text-align-unsupported:${alignRaw}`,
      `paragraph alignment "${alignRaw}" is drawn left-aligned`,
      name,
    );
  }

  // Box for the frame. A centred or right-aligned line stores its own width in x, so it is exact;
  // a left-aligned line has no stored width and is estimated.
  const pts: Point[] = [];
  let guessed = false;
  for (const l of lines) {
    const size = Math.max(...l.runs.map((r) => r.size));
    const chars = l.runs.reduce((sum, r) => sum + [...r.text].length, 0);
    const estimate = l.runs.reduce((sum, r) => sum + [...r.text].length * r.size * EM_WIDTH, 0);
    let x0: number;
    let x1: number;
    if (align === 'center' && l.x < 0) {
      x0 = l.x;
      x1 = -l.x;
    } else if (align === 'right' && l.x < 0) {
      x0 = l.x;
      x1 = 0;
    } else {
      guessed = guessed || chars > 0;
      x0 = align === 'left' ? l.x : align === 'center' ? -estimate / 2 : -estimate;
      x1 = x0 + estimate;
    }
    pts.push(
      [x0, l.y - size * ASCENT],
      [x1, l.y - size * ASCENT],
      [x1, l.y + size * DESCENT],
      [x0, l.y + size * DESCENT],
    );
  }
  if (guessed) {
    w.add(
      'text-bbox-approximate',
      'a text line width is estimated (0.6 em per character); the frame may be off',
      name,
    );
  }

  return {
    kind: 'text',
    id: n.id ?? '',
    name,
    transform: transformOf(n.transform),
    opacity: st.opacity ?? 1,
    shadows,
    align,
    lines,
    pts,
  };
}

function parseNode(n: AgcNode, inh: Inherited, w: WarningCollector, isRoot: boolean): IrNode | null {
  // Hidden descendants never paint, so they must not affect frames or warnings.
  // A hidden ROOT is kept: carousel slides are toggled by root opacity.
  if (!isRoot && isHidden(n)) return null;
  const name = n.name ?? '';
  if (n.type === 'group') return parseGroup(n, inh, w);
  if (n.type === 'shape') return parseShape(n, inh, w);
  if (n.type === 'text') return parseText(n, w);
  w.add(
    `unsupported-node:${n.type ?? 'unknown'}`,
    `node type "${n.type ?? 'unknown'}" is not converted`,
    name,
  );
  return null;
}

/** Parses one AGC document into one IR root per top-level node, each with its own warnings. */
export function parseAgc(agc: AgcDocument): ParsedRoot[] {
  if (!agc || !Array.isArray(agc.children))
    throw new XdError('InvalidAgc', 'AGC document has no children array');
  const first = agc.children[0];
  const rawRoots = first?.type === 'artboard' ? (first.artboard?.children ?? []) : agc.children;
  const out: ParsedRoot[] = [];
  for (const raw of rawRoots) {
    const w = new WarningCollector();
    if (agc.version && !/^1\./.test(agc.version)) {
      w.add(
        `agc-version-untested:${agc.version}`,
        `AGC version ${agc.version} was never tested; only 1.x files were observed`,
      );
    }
    const node = parseNode(raw, ROOT_INHERITED, w, true);
    if (node) out.push({ node, warnings: w.list() });
  }
  return out;
}
