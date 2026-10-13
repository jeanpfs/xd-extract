import { boxOf, collectPaintFacts, type FrameResult } from './frame';
import type { Geom, IrGroup, IrNode, IrShape, Stroke } from './ir';
import { IDENTITY, isIdentity, type Matrix, matrixAttr, mul, round, translate } from './matrix';
import { shadowBox } from './shadow';

export interface Snap {
  clip: string;
  mask: string;
  dx: number;
  dy: number;
}

export interface EmitResult {
  svg: string;
  frame: { x: number; y: number; w: number; h: number };
  rule: 'plate' | 'content';
  snaps: Snap[];
  clips: number;
}

type Attrs = Record<string, string | number | undefined>;

const esc = (v: string | number) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const el = (tag: string, attrs: Attrs, children?: string): string => {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${esc(v as string | number)}"`)
    .join(' ');
  const open = `<${tag}${a ? ` ${a}` : ''}`;
  return children === undefined ? `${open}/>` : `${open}>${children}</${tag}>`;
};

function geomEl(g: Geom, forClip: boolean): { tag: string; attrs: Attrs } {
  switch (g.tag) {
    case 'path': {
      const attrs: Attrs = { d: g.d };
      if (g.evenodd) attrs[forClip ? 'clip-rule' : 'fill-rule'] = 'evenodd';
      return { tag: 'path', attrs };
    }
    case 'rect': {
      const attrs: Attrs = { x: round(g.x), y: round(g.y), width: round(g.width), height: round(g.height) };
      if (g.rx) attrs.rx = round(g.rx);
      return { tag: 'rect', attrs };
    }
    case 'line':
      return { tag: 'line', attrs: { x1: round(g.x1), y1: round(g.y1), x2: round(g.x2), y2: round(g.y2) } };
    case 'ellipse':
      return {
        tag: 'ellipse',
        attrs: { cx: round(g.cx), cy: round(g.cy), rx: round(g.rx), ry: round(g.ry) },
      };
  }
}

function strokeAttrs(out: Attrs, s: Stroke, widthFactor: number): void {
  out.stroke = (s.paint as { css: string }).css;
  if (s.width !== undefined || widthFactor !== 1) out['stroke-width'] = round((s.width ?? 1) * widthFactor);
  if (s.cap) out['stroke-linecap'] = s.cap;
  if (s.join) out['stroke-linejoin'] = s.join;
  if (s.miterLimit !== undefined && (s.join === 'miter' || !s.join))
    out['stroke-miterlimit'] = round(s.miterLimit);
  if (s.dash?.length) out['stroke-dasharray'] = s.dash.map(round).join(' ');
}

/** World-space delta -> the local space of a group whose accumulated matrix is `world`. */
function toLocal(world: Matrix, dx: number, dy: number): [number, number] | null {
  const [a, b, c, d] = world;
  const det = a * d - b * c;
  if (!det) return null;
  return [(d * dx - c * dy) / det, (-b * dx + a * dy) / det];
}

export function emitSvg(root: IrNode, frameResult: FrameResult): EmitResult {
  const frame = frameResult.box;
  const fw = frame.x1 - frame.x0;
  const fh = frame.y1 - frame.y0;
  const defs: string[] = [];
  const snaps: Snap[] = [];
  let clipSeq = 0;
  let alignSeq = 0;
  let shadowSeq = 0;

  const shapeSvg = (n: IrShape, isRoot: boolean): string => {
    const { tag, attrs } = geomEl(n.geom, false);
    const s = n.stroke;
    const solidStroke = s && s.paint.kind === 'solid' ? s : null;
    const aligned = solidStroke?.align ? solidStroke : null;
    // The frame is measured in the root's own coordinates (its transform is ignored), exactly as for a
    // root group, so a root shape must not apply its transform here or it lands outside the viewBox.
    const transform = !isRoot && !isIdentity(n.transform) ? matrixAttr(n.transform) : undefined;
    const opacity = !isRoot && n.opacity !== 1 ? round(n.opacity) : undefined;
    const filter = shadowRef(n);
    const out: Attrs = { ...attrs };
    // With a shadow or an aligned stroke the shape is wrapped, and the wrapper carries transform,
    // opacity and filter once; otherwise they stay on the element.
    const wrapped = !!filter || !!aligned;
    if (!wrapped) out.transform = transform;
    out.fill = n.fill?.kind === 'solid' ? n.fill.css : 'none'; // stroke-only paths must not inherit SVG's black
    if (solidStroke && !aligned) strokeAttrs(out, solidStroke, 1);
    if (!aligned) {
      if (!filter) return el(tag, { ...out, opacity });
      return el('g', { transform, opacity, filter }, el(tag, out));
    }

    // Inside/outside: draw the stroke twice as wide and keep only the wanted half. The fill element
    // and the stroke element share one wrapper, so transform and opacity apply once.
    const stroke = solidStroke as Stroke;
    const key = ++alignSeq;
    const sa: Attrs = { ...attrs, fill: 'none' };
    strokeAttrs(sa, stroke, 2);
    if (stroke.align === 'inside') {
      const c = geomEl(n.geom, true);
      const id = `stroke-clip-${key}`;
      defs.push(el('clipPath', { id }, el(c.tag, c.attrs)));
      sa['clip-path'] = `url(#${id})`;
    } else {
      const id = `stroke-mask-${key}`;
      const xs = n.geom.pts.map((p) => p[0]);
      const ys = n.geom.pts.map((p) => p[1]);
      const m = (stroke.width ?? 1) * Math.max(2, stroke.miterLimit ?? 4);
      const [x0, y0] = [Math.min(...xs) - m, Math.min(...ys) - m];
      const [w, h] = [Math.max(...xs) + m - x0, Math.max(...ys) + m - y0];
      const region = { x: round(x0), y: round(y0), width: round(w), height: round(h) };
      const hole = geomEl(n.geom, false);
      defs.push(
        el(
          'mask',
          { id, maskUnits: 'userSpaceOnUse', ...region },
          el('rect', { ...region, fill: '#fff' }) + el(hole.tag, { ...hole.attrs, fill: '#000' }),
        ),
      );
      sa.mask = `url(#${id})`;
    }
    const pair = el(tag, out) + el(tag, sa);
    return transform || opacity || filter ? el('g', { transform, opacity, filter }, pair) : pair;
  };

  /** Registers the shadow filter of a node and returns its `url(#id)`, or undefined when nothing paints. */
  const shadowRef = (n: IrNode): string | undefined => {
    if (!n.shadows.length) return undefined;
    const local = collectPaintFacts(n, false).content;
    if (!local) return undefined;
    const r = shadowBox(local, n.shadows, 1.5);
    const region = {
      x: round(r.x0 - 1),
      y: round(r.y0 - 1),
      width: round(r.x1 - r.x0 + 2),
      height: round(r.y1 - r.y0 + 2),
    };
    const id = `shadow-${++shadowSeq}`;
    const fx: string[] = [];
    const merge: string[] = [];
    n.shadows.forEach((s, i) => {
      const k = i + 1;
      let src = 'SourceAlpha';
      if (s.r > 0) {
        fx.push(el('feGaussianBlur', { in: src, stdDeviation: round(s.r / 2), result: `blur${k}` }));
        src = `blur${k}`;
      }
      fx.push(el('feOffset', { dx: round(s.dx), dy: round(s.dy), in: src, result: `off${k}` }));
      fx.push(
        el('feFlood', { 'flood-color': s.color, 'flood-opacity': round(s.opacity), result: `flood${k}` }),
      );
      fx.push(el('feComposite', { in: `flood${k}`, in2: `off${k}`, operator: 'in', result: `shadow${k}` }));
      merge.push(el('feMergeNode', { in: `shadow${k}` }));
    });
    merge.push(el('feMergeNode', { in: 'SourceGraphic' }));
    fx.push(el('feMerge', {}, merge.join('')));
    defs.push(
      el(
        'filter',
        { id, filterUnits: 'userSpaceOnUse', ...region, 'color-interpolation-filters': 'sRGB' },
        fx.join(''),
      ),
    );
    return `url(#${id})`;
  };

  const clipDef = (n: IrGroup, world2: Matrix): string => {
    const clip = n.clip as NonNullable<IrGroup['clip']>;
    const id = `clip-${++clipSeq}`;
    const body = clip.shapes
      .map((c) => {
        let cm = c.transform;
        const b = boxOf(mul(world2, cm), c.geom.pts);
        const sameSize = Math.abs(b.x1 - b.x0 - fw) < 1.5 && Math.abs(b.y1 - b.y0 - fh) < 1.5;
        const dx = frame.x0 - b.x0;
        const dy = frame.y0 - b.y0;
        if (sameSize && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
          const local = toLocal(world2, dx, dy);
          if (local) {
            cm = mul(translate(local[0], local[1]), cm);
            snaps.push({ clip: c.name, mask: clip.maskName, dx: round(dx), dy: round(dy) });
          }
        }
        const { tag, attrs } = geomEl(c.geom, true);
        const a: Attrs = { ...attrs };
        if (!isIdentity(cm)) a.transform = matrixAttr(cm);
        return el(tag, a);
      })
      .join('');
    defs.push(el('clipPath', { id }, body));
    return id;
  };

  const walk = (n: IrNode, world: Matrix, isRoot: boolean): string => {
    if (n.kind === 'shape') return shapeSvg(n, isRoot);
    const m = isRoot ? IDENTITY : n.transform;
    const world2 = mul(world, m);
    const attrs: Attrs = {};
    if (!isIdentity(m)) attrs.transform = matrixAttr(m);
    // Opacity 0 on the exported root is a carousel toggle: ignore it there, drop it inside (parse does).
    if (!isRoot && n.opacity !== 1) attrs.opacity = round(n.opacity);
    const filter = shadowRef(n);
    if (filter) attrs.filter = filter;
    let kids = n.children.map((c) => walk(c, world2, false)).join('');
    if (!kids) return '';
    if (n.clip) {
      // filter runs before clip-path on one element, which would clip the shadow; nest the clip instead
      const clipRef = `url(#${clipDef(n, world2)})`;
      if (filter) kids = el('g', { 'clip-path': clipRef }, kids);
      else attrs['clip-path'] = clipRef;
    }
    return Object.keys(attrs).length ? el('g', attrs, kids) : kids;
  };

  const body = walk(root, IDENTITY, true);
  const svg = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `${round(frame.x0)} ${round(frame.y0)} ${round(fw)} ${round(fh)}`,
      width: round(fw),
      height: round(fh),
    },
    (defs.length ? el('defs', {}, defs.join('')) : '') + body,
  );
  return {
    svg,
    frame: { x: round(frame.x0), y: round(frame.y0), w: round(fw), h: round(fh) },
    rule: frameResult.rule,
    snaps,
    clips: clipSeq,
  };
}
