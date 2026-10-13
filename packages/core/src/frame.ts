import { XdError } from './errors';
import type { IrNode, Point } from './ir';
import { apply, IDENTITY, type Matrix, mul } from './matrix';
import { shadowBox } from './shadow';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const area = (b: Box): number => (b.x1 - b.x0) * (b.y1 - b.y0);

export function boxOf(m: Matrix, pts: Point[]): Box {
  let b: Box = {
    x0: Number.POSITIVE_INFINITY,
    y0: Number.POSITIVE_INFINITY,
    x1: Number.NEGATIVE_INFINITY,
    y1: Number.NEGATIVE_INFINITY,
  };
  for (const [px, py] of pts) {
    const [x, y] = apply(m, px, py);
    b = { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) };
  }
  return b;
}

const union = (a: Box | null, b: Box): Box =>
  a
    ? {
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
      }
    : b;

export interface PaintFacts {
  /** Largest box among shapes that declare their own fill. */
  plate: Box | null;
  /** Union of painted boxes, expanded by half the stroke width. */
  content: Box | null;
  /** Solid fill colour (css) -> summed raw bbox area. */
  fills: Map<string, number>;
  shapes: number;
}

/**
 * One traversal shared by frame measurement and inventory. The exported root's own
 * transform is ignored (coordinates stay in artboard space), like the prototype.
 */
export function collectPaintFacts(root: IrNode, rootShadows = true): PaintFacts {
  const facts: PaintFacts = { plate: null, content: null, fills: new Map(), shapes: 0 };
  // The node being measured as `root` with rootShadows=false is the one whose shadows we compute.
  const ownShadows = (n: IrNode): boolean => n.shadows.length > 0 && !(n === root && !rootShadows);
  // The node's own shadows are what this computes, so they are excluded from its source box.
  const shadowWorld = (n: IrNode, world: Matrix): Box | null => {
    const local = collectPaintFacts(n, false).content;
    if (!local) return null;
    const s = shadowBox(local, n.shadows, 1);
    const corners: Point[] = [
      [s.x0, s.y0],
      [s.x1, s.y0],
      [s.x1, s.y1],
      [s.x0, s.y1],
    ];
    return boxOf(world, corners);
  };
  // A shadow paints outside the node, so it widens a content frame (a plate frame ignores `content`).
  const addShadows = (n: IrNode, world: Matrix): void => {
    if (!ownShadows(n)) return;
    const b = shadowWorld(n, world);
    if (b) facts.content = union(facts.content, b);
  };
  let plateArea = 0;
  const rec = (n: IrNode, world: Matrix, isRoot: boolean): void => {
    const w2 = isRoot ? IDENTITY : mul(world, n.transform);
    if (n.kind === 'shape') {
      const raw = boxOf(w2, n.geom.pts);
      facts.shapes += 1;
      if (n.ownFill && (!facts.plate || area(raw) > plateArea)) {
        plateArea = area(raw);
        // the plate's own shadow belongs to it; shadows of other shapes never widen a plate frame
        facts.plate = ownShadows(n) ? union(raw, shadowWorld(n, w2) ?? raw) : raw;
      }
      if (n.fill || n.stroke) {
        const sw = n.stroke ? (n.stroke.width ?? 1) : 0;
        // inside strokes stay within the shape; outside ones extend by the full width
        const half = n.stroke?.align === 'inside' ? 0 : n.stroke?.align === 'outside' ? sw : sw / 2;
        facts.content = union(
          facts.content,
          half ? { x0: raw.x0 - half, y0: raw.y0 - half, x1: raw.x1 + half, y1: raw.y1 + half } : raw,
        );
      }
      if (n.fill?.kind === 'solid')
        facts.fills.set(n.fill.css, (facts.fills.get(n.fill.css) ?? 0) + area(raw));
      addShadows(n, w2);
      return;
    }
    if (n.kind === 'text') {
      // text widens the content box only: it is never a background plate nor a dominant fill
      facts.content = union(facts.content, boxOf(w2, n.pts));
      addShadows(n, w2);
      return;
    }
    for (const c of n.children) rec(c, w2, false);
    addShadows(n, w2);
  };
  rec(root, IDENTITY, true);
  return facts;
}

export interface FrameResult {
  box: Box;
  rule: 'plate' | 'content';
}

/** Plate if it covers >= 50% of the painted content, else the content box. */
export function measureFrame(root: IrNode): FrameResult {
  const { plate, content } = collectPaintFacts(root);
  if (!plate && !content)
    throw new XdError('NoPaintedGeometry', `no painted geometry found in "${root.name}"`);
  const contentArea = content ? area(content) : 0;
  const plateArea = plate ? area(plate) : 0;
  if (contentArea <= 0 && plateArea <= 0) {
    throw new XdError('NoPaintedGeometry', `only zero-area geometry found in "${root.name}"`);
  }
  if (plate && contentArea > 0 && plateArea >= 0.5 * contentArea) return { box: plate, rule: 'plate' };
  if (content && contentArea > 0) return { box: content, rule: 'content' };
  return { box: plate as Box, rule: 'plate' };
}
