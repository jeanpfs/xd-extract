import type { AgcDocument, AgcNode, AgcPaint, AgcShape, AgcStyle, AgcTransform } from './agc';
import { solidCss } from './color';
import { XdError } from './errors';
import type { Geom, IrClipShape, IrGroup, IrNode, IrShape, Paint, Point, Stroke } from './ir';
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

function noteStyle(st: AgcStyle, name: string, w: WarningCollector): void {
  const filters = st.filters;
  if (filters && (!Array.isArray(filters) || filters.length > 0)) {
    w.add('unsupported-style:filters', 'shadows and blur (style.filters) are not converted yet', name);
  }
  if (st.clipPath)
    w.add('unsupported-style:clipPath', 'style.clipPath (repeat-grid mask) is not converted', name);
  const align = st.stroke?.align;
  if (align && align !== 'center') {
    w.add(`stroke-align-ignored:${align}`, `stroke align "${align}" is rendered centred`, name);
  }
}

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
  };
}

function parseGroup(n: AgcNode, inh: Inherited, w: WarningCollector): IrGroup {
  const name = n.name ?? '';
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const f = readPaint(st.fill, 'fill', w, name);
  const s = readPaint(st.stroke, 'stroke', w, name);
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
    clip,
    children,
  };
}

function parseNode(n: AgcNode, inh: Inherited, w: WarningCollector, isRoot: boolean): IrNode | null {
  // Hidden descendants never paint, so they must not affect frames or warnings.
  // A hidden ROOT is kept: carousel slides are toggled by root opacity.
  if (!isRoot && isHidden(n)) return null;
  const name = n.name ?? '';
  if (n.type === 'group') return parseGroup(n, inh, w);
  if (n.type === 'shape') return parseShape(n, inh, w);
  if (n.type === 'text') {
    w.add('skipped-text', 'text nodes are skipped (text is not implemented)', name);
    return null;
  }
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
