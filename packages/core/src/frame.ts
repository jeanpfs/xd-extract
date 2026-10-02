import { XdError } from './errors';
import type { IrNode, Point } from './ir';
import { apply, IDENTITY, type Matrix, mul } from './matrix';

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
export function collectPaintFacts(root: IrNode): PaintFacts {
  const facts: PaintFacts = { plate: null, content: null, fills: new Map(), shapes: 0 };
  const rec = (n: IrNode, world: Matrix, isRoot: boolean): void => {
    const w2 = isRoot ? IDENTITY : mul(world, n.transform);
    if (n.kind === 'shape') {
      const raw = boxOf(w2, n.geom.pts);
      facts.shapes += 1;
      if (n.ownFill && (!facts.plate || area(raw) > area(facts.plate))) facts.plate = raw;
      if (n.fill || n.stroke) {
        const half = n.stroke ? (n.stroke.width ?? 1) / 2 : 0;
        facts.content = union(
          facts.content,
          half ? { x0: raw.x0 - half, y0: raw.y0 - half, x1: raw.x1 + half, y1: raw.y1 + half } : raw,
        );
      }
      if (n.fill?.kind === 'solid')
        facts.fills.set(n.fill.css, (facts.fills.get(n.fill.css) ?? 0) + area(raw));
      return;
    }
    for (const c of n.children) rec(c, w2, false);
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
