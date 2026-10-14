import type {
  AgcDocument,
  AgcGradient,
  AgcGradientResource,
  AgcNode,
  AgcPaint,
  AgcPattern,
  AgcShape,
  AgcStyle,
  AgcTextRange,
  AgcTransform,
} from './agc';
import { type AgcColor, solidCss } from './color';
import { XdError } from './errors';
import { fontStyleOf } from './font';
import { base64ByteLength, DEFAULT_MAX_EMBED_BYTES, sniffImage, type XdImages } from './image';
import type {
  Geom,
  GradientStop,
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
import { estimateWidth } from './metrics';
import { buildSyncIndex, expandSync, type SyncIndex } from './sync';
import { type Warning, WarningCollector } from './warnings';

/** Collects warnings for one root and carries the shared gradients its fills may refer to. */
class Scope extends WarningCollector {
  constructor(
    readonly gradients: Record<string, AgcGradientResource> = {},
    readonly images: XdImages = {},
    readonly maxEmbedBytes: number = DEFAULT_MAX_EMBED_BYTES,
  ) {
    super();
  }
}

/** What a parse can look things up in: other nodes (symbols), shared gradients, image bytes. */
export interface ParseOptions {
  index?: SyncIndex;
  gradients?: Record<string, AgcGradientResource>;
  images?: XdImages;
  /** Largest image embedded in an SVG, in bytes (default 2 MiB). */
  maxEmbedBytes?: number;
}

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

function readPaint(p: AgcPaint | undefined, where: 'fill' | 'stroke', w: Scope, name: string): Declared {
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
  if (p.type === 'gradient') return readGradient(p.gradient, where, w, name);
  if (p.type === 'pattern') return readPattern(p.pattern, where, w, name);
  const reason = p.type ?? 'unknown';
  w.add(`unsupported-${where}:${reason}`, `${where} of type "${reason}" is not converted yet`, name);
  return { kind: 'unsupported', reason };
}

/** An image fill. The bytes come from the document (`xd` files carry them, share links serve them). */
function readPattern(p: AgcPattern | undefined, where: 'fill' | 'stroke', w: Scope, name: string): Paint {
  const bad = (reason: string, message: string): Paint => {
    w.add(`unsupported-${where}:${reason}`, message, name);
    return { kind: 'unsupported', reason };
  };
  if (where === 'stroke') return bad('pattern', 'an image on a stroke is not converted');
  const ux = p?.meta?.ux;
  const uid = ux?.uid;
  if (!p || typeof uid !== 'string') return bad('pattern', 'image fill without an image id');
  const base64 = w.images[uid];
  if (base64 === undefined)
    return bad('pattern', 'the image bytes are not in the document (not read, or not fetched)');
  const bytes = base64ByteLength(base64);
  if (bytes > w.maxEmbedBytes) {
    return bad(
      'pattern-too-large',
      `the image is ${bytes} bytes; the embed limit is ${w.maxEmbedBytes} (--max-embed-bytes)`,
    );
  }
  const mime = sniffImage(base64);
  if (!mime) return bad('pattern-format', 'the image is not a PNG, JPEG, GIF or WebP');
  const { width, height } = p;
  if (typeof width !== 'number' || typeof height !== 'number' || !(width > 0) || !(height > 0)) {
    return bad('pattern', 'image fill without a size');
  }
  // `cover` is XD's default fill (scaled to cover the shape, cropped); `fill` stretches.
  const behavior = ux?.scaleBehavior ?? 'cover';
  if (behavior !== 'cover' && behavior !== 'fill') {
    w.add(`pattern-scale-unknown:${behavior}`, `image scale behaviour "${behavior}" is drawn as cover`, name);
  }
  if ((ux?.scale !== undefined && ux.scale !== 1) || ux?.offsetX || ux?.offsetY) {
    w.add(
      'pattern-offset-ignored',
      'a moved or zoomed image fill (offset, scale) is drawn centred at the default scale',
      name,
    );
  }
  return { kind: 'image', uid, mime, base64, width, height, fit: behavior === 'fill' ? 'stretch' : 'cover' };
}

/**
 * XD writes a gradient as geometry plus a stops resource: inline (`meta.ux.gradientResources`) or shared
 * in the resources document under `ref`. Linear and radial map to SVG as they are; angular cannot.
 */
function readGradient(g: AgcGradient | undefined, where: 'fill' | 'stroke', w: Scope, name: string): Paint {
  const bad = (reason: string, message: string): Paint => {
    w.add(`unsupported-${where}:${reason}`, message, name);
    return { kind: 'unsupported', reason };
  };
  if (!g) return bad('gradient', `${where} gradient has no data`);
  const res = g.ref !== undefined ? w.gradients[g.ref] : g.meta?.ux?.gradientResources;
  if (!res) {
    return bad(
      'gradient',
      g.ref !== undefined
        ? `gradient "${g.ref}" is not in the resources document`
        : `${where} gradient has no stops`,
    );
  }
  if (res.type !== 'linear' && res.type !== 'radial') {
    const type = res.type ?? 'unknown';
    return bad(`gradient-${type}`, `${type} gradients have no SVG equivalent`);
  }
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const stops: GradientStop[] = [];
  for (const st of res.stops ?? []) {
    const c = st.color;
    if (!c || !num(st.offset)) return bad('gradient', 'gradient has a stop without offset or colour');
    if (c.mode && c.mode !== 'RGB') {
      return bad(`color-mode-${c.mode}`, `${where} uses colour mode ${c.mode}; only RGB is converted`);
    }
    stops.push({ offset: st.offset, color: solidCss({ ...c, alpha: undefined }), opacity: c.alpha ?? 1 });
  }
  if (!stops.length) return bad('gradient', 'gradient has no stops');
  const first = res.stops?.[0]?.color;
  if (stops.length === 1 && first) return { kind: 'solid', css: solidCss(first) };
  if (g.units !== undefined && g.units !== 'objectBoundingBox' && g.units !== 'userSpaceOnUse') {
    return bad('gradient', `gradient units "${g.units}" are not known`);
  }
  const units = g.units === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox';
  if (res.type === 'linear') {
    const { x1, y1, x2, y2 } = g;
    if (!num(x1) || !num(y1) || !num(x2) || !num(y2))
      return bad('gradient', 'linear gradient without geometry');
    return { kind: 'gradient', def: { type: 'linear', units, x1, y1, x2, y2, stops } };
  }
  const { cx, cy, r } = g;
  if (!num(cx) || !num(cy) || !num(r)) return bad('gradient', 'radial gradient without geometry');
  const t = g.transform;
  return {
    kind: 'gradient',
    def: {
      type: 'radial',
      units,
      cx,
      cy,
      fx: num(g.fx) ? g.fx : cx,
      fy: num(g.fy) ? g.fy : cy,
      r,
      ...(t ? { transform: transformOf(t) } : {}),
      stops,
    },
  };
}

/** Bounding-box units mean nothing for a shape with no width or height: SVG would draw nothing. */
function flattenDegenerate(p: Paint | null, geom: Geom, w: Scope, name: string): Paint | null {
  if (p?.kind !== 'gradient' || p.def.units !== 'objectBoundingBox') return p;
  const xs = geom.pts.map((q) => q[0]);
  const ys = geom.pts.map((q) => q[1]);
  if (Math.max(...xs) - Math.min(...xs) > 0 && Math.max(...ys) - Math.min(...ys) > 0) return p;
  w.add(
    'gradient-degenerate-bbox',
    'a gradient on a shape with no width or height is drawn as its first stop colour',
    name,
  );
  const s = p.def.stops[0] as GradientStop;
  return {
    kind: 'solid',
    css: s.opacity < 1 ? s.color.replace('rgb(', 'rgba(').replace(')', `,${round(s.opacity)})`) : s.color,
  };
}

/** CSS blend modes XD writes with the same name; `normal` and a group's `pass-through` draw as usual. */
const BLEND_MODES = new Set([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

function readBlend(st: AgcStyle, name: string, w: Scope): string | undefined {
  const mode = st.blendMode;
  if (!mode || mode === 'normal' || mode === 'pass-through') return undefined;
  if (!BLEND_MODES.has(mode)) {
    w.add(`unsupported-style:blendMode:${mode}`, `blend mode "${mode}" is drawn as normal`, name);
    return undefined;
  }
  w.add(
    'blend-mode-backdrop',
    'a blend mode blends with what is in the SVG only; layers below the export are not part of its backdrop',
    name,
  );
  return mode;
}

const FILTERS_MSG = 'a style.filters entry could not be converted';

/** What the filters of a node become: shadows and an object blur. Everything else is reported. */
interface Effects {
  shadows: Shadow[];
  blur?: number;
}

/** Drop shadows and object blur become IR; every other filter, and any we cannot read exactly, is reported. */
function readEffects(st: AgcStyle, name: string, w: Scope): Effects {
  const filters = st.filters;
  if (!filters || (Array.isArray(filters) && filters.length === 0)) return { shadows: [] };
  if (!Array.isArray(filters)) {
    w.add('unsupported-style:filters', FILTERS_MSG, name);
    return { shadows: [] };
  }
  const shadows: Shadow[] = [];
  let variance = 0;
  for (const f of filters as Record<string, unknown>[]) {
    // XD keeps a disabled effect in the file with visible: false; it paints nothing.
    if (f?.visible === false) continue;
    const type = typeof f?.type === 'string' ? f.type : undefined;
    if (type === 'uxdesign#blur') {
      const p = f.params as { blurAmount?: unknown; backgroundEffect?: unknown } | undefined;
      const amount = p?.blurAmount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        w.add('unsupported-style:filters', FILTERS_MSG, name);
      } else if (p?.backgroundEffect === true) {
        // A background blur blurs what is behind the shape; an SVG cannot read those pixels.
        w.add(
          'unsupported-style:filters:uxdesign#blur-background',
          'a background blur needs the pixels behind the shape, which an SVG cannot read',
          name,
        );
      } else if (f.global !== true) {
        w.add(
          'unsupported-style:filters:uxdesign#blur-local',
          'blur without global: true is not converted',
          name,
        );
      } else {
        // XD's blur amount is taken as the Gaussian's standard deviation; two blurs add in variance.
        variance += amount * amount;
      }
      continue;
    }
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
    shadows.push(...(parsed as Shadow[]));
  }
  return { shadows, ...(variance > 0 ? { blur: Math.sqrt(variance) } : {}) };
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

function noteStyle(st: AgcStyle, name: string, w: Scope): void {
  if (st.clipPath)
    w.add('unsupported-style:clipPath', 'style.clipPath (repeat-grid mask) is not converted', name);
}

const warnAlign = (align: string, name: string, w: Scope): void =>
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

function pathGeom(d: string, evenodd: boolean, name: string, w: Scope): Geom {
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

function readGeom(s: AgcShape | undefined, name: string, w: Scope): Geom | null {
  if (!s) return null;
  switch (s.type) {
    case 'path':
      return pathGeom(s.path ?? '', s.winding === 'evenodd', name, w);
    case 'compound':
      return pathGeom(s.path ?? '', false, name, w);
    case 'polygon': {
      const pts: Point[] = (s.points ?? []).map((p) => [p.x, p.y]);
      if (pts.length < 3 || pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
        w.add('unsupported-shape:polygon', 'polygon without three usable points is not converted', name);
        return null;
      }
      const d = `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`).join(' ')} Z`;
      return { tag: 'path', d, evenodd: false, pts };
    }
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

function parseShape(n: AgcNode, inh: Inherited, w: Scope): IrShape | null {
  const name = n.name ?? '';
  const geom = readGeom(n.shape, name, w);
  if (!geom) return null;
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const { shadows, blur: objectBlur } = readEffects(st, name, w);
  const blend = readBlend(st, name, w);
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
  fill = flattenDegenerate(fill, geom, w, name);
  strokePaint = flattenDegenerate(strokePaint, geom, w, name);
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
    ...(objectBlur ? { blur: objectBlur } : {}),
    ...(blend ? { blend } : {}),
  };
}

function parseGroup(n: AgcNode, inh: Inherited, w: Scope): IrGroup {
  const name = n.name ?? '';
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const { shadows, blur: objectBlur } = readEffects(st, name, w);
  const blend = readBlend(st, name, w);
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
    ...(objectBlur ? { blur: objectBlur } : {}),
    ...(blend ? { blend } : {}),
    clip,
    children,
  };
}

const ASCENT = 0.8;
const DESCENT = 0.25;

function applyTransform(text: string, how: string | undefined): string {
  if (how === 'uppercase') return text.toUpperCase();
  if (how === 'lowercase') return text.toLowerCase();
  if (how === 'titlecase')
    return text.replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toUpperCase());
  return text;
}

/** `value` is ARGB in an unsigned 32-bit integer. */
function argbCss(value: number): string {
  const a = (value >>> 24) & 255;
  const r = (value >>> 16) & 255;
  const g = (value >>> 8) & 255;
  const b = value & 255;
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${round(a / 255)})`;
}

function parseText(n: AgcNode, w: Scope): IrText | null {
  const name = n.name ?? '';
  const t = n.text;
  const raw = t?.rawText;
  if (!t || typeof raw !== 'string' || !Array.isArray(t.paragraphs)) {
    w.add('skipped-text', 'text node has no readable layout and is skipped', name);
    return null;
  }
  const st = n.style ?? {};
  noteStyle(st, name, w);
  const { shadows, blur: objectBlur } = readEffects(st, name, w);
  const blend = readBlend(st, name, w);

  const frameType = t.frame?.type;
  if (frameType && frameType !== 'positioned' && frameType !== 'area' && frameType !== 'autoHeight') {
    w.add(
      `unsupported-text:frame-${frameType}`,
      `text frame "${frameType}" was never observed; the line layout is used as is`,
      name,
    );
  }
  const frameWidth = typeof t.frame?.width === 'number' ? t.frame.width : undefined;
  const strokeType = st.stroke?.type;
  if (strokeType && strokeType !== 'none') {
    w.add('unsupported-stroke:text', 'a stroke on text is not converted', name);
  }

  // Style per character range. Without ranged styles, the node's own font and fill apply to everything.
  const nodeFill = readPaint(st.fill, 'fill', w, name);
  if (nodeFill?.kind === 'gradient' || nodeFill?.kind === 'image') {
    const what = nodeFill.kind === 'image' ? 'pattern' : 'gradient';
    w.add(`unsupported-fill:${what}`, `a ${what} fill on text is not converted`, name);
  }
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
    if (r.textScript && r.textScript !== 'none') {
      later(
        `text-script-unsupported:${r.textScript}`,
        `text script "${r.textScript}" is drawn at normal size`,
        name,
      );
    }
    const decoration = [r.underline ? 'underline' : '', r.strikethrough ? 'line-through' : '']
      .filter(Boolean)
      .join(' ');
    return {
      ...(decoration ? { decoration } : {}),
      text: applyTransform(text, r.textTransform),
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
      if (runs.length)
        lines.push({ x: segs[0]?.x ?? 0, y: segs[0]?.y ?? 0, anchorX: 0, anchor: 'start', runs });
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

  // Where each line sits, and its box for the frame.
  //  - positioned / autoHeight: a centred or right-aligned line stores x as a negative offset from the
  //    origin, so it is anchored at 0 and its width is -2x (centre) or -x (right): exact.
  //  - area: x is the offset inside the frame, so the line is anchored at the frame's centre or right
  //    edge, and the width is frame - 2x (centre) or frame - x (right): exact.
  //  - left-aligned, or no frame width to anchor on: the width is not stored and is estimated.
  const pts: Point[] = [];
  let guessed = false;
  for (const l of lines) {
    const size = Math.max(...l.runs.map((r) => r.size));
    const chars = l.runs.reduce((sum, r) => sum + [...r.text].length, 0);
    const estimate = l.runs.reduce(
      (sum, r) => sum + estimateWidth(r.text, r.size, r.weight, r.letterSpacing),
      0,
    );
    let x0: number;
    let x1: number;
    if (align !== 'left' && l.x < 0) {
      l.anchorX = 0;
      l.anchor = align === 'center' ? 'middle' : 'end';
      x0 = l.x;
      x1 = align === 'center' ? -l.x : 0;
    } else if (align !== 'left' && frameWidth !== undefined) {
      l.anchorX = align === 'center' ? frameWidth / 2 : frameWidth;
      l.anchor = align === 'center' ? 'middle' : 'end';
      x0 = l.x;
      x1 = align === 'center' ? frameWidth - l.x : frameWidth;
    } else {
      l.anchorX = l.x;
      l.anchor = 'start';
      guessed = guessed || chars > 0;
      x0 = l.x;
      // area text wraps inside its frame, so a line is never wider than the frame
      x1 =
        frameWidth !== undefined && l.x < frameWidth ? Math.min(l.x + estimate, frameWidth) : l.x + estimate;
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
      'a text line width is estimated from generic sans-serif metrics; the frame may be off',
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
    ...(objectBlur ? { blur: objectBlur } : {}),
    ...(blend ? { blend } : {}),
    align,
    lines,
    pts,
  };
}

function parseNode(n: AgcNode, inh: Inherited, w: Scope, isRoot: boolean): IrNode | null {
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
export function parseAgc(agc: AgcDocument, opts: ParseOptions = {}): ParsedRoot[] {
  const index = opts.index ?? buildSyncIndex([agc]);
  if (!agc || !Array.isArray(agc.children))
    throw new XdError('InvalidAgc', 'AGC document has no children array');
  const first = agc.children[0];
  const rawRoots = first?.type === 'artboard' ? (first.artboard?.children ?? []) : agc.children;
  const out: ParsedRoot[] = [];
  for (const raw of rawRoots) {
    const w = new Scope(opts.gradients, opts.images, opts.maxEmbedBytes);
    if (agc.version && !/^1\./.test(agc.version)) {
      w.add(
        `agc-version-untested:${agc.version}`,
        `AGC version ${agc.version} was never tested; only 1.x files were observed`,
      );
    }
    const node = parseNode(expandSync(raw, index), ROOT_INHERITED, w, true);
    if (node) out.push({ node, warnings: w.list() });
  }
  return out;
}
