import type { Box } from './frame';
import type { Shadow } from './ir';

/**
 * The alpha below which a shadow is not worth a frame margin: about 6 % black on white is hard to see,
 * and a frame that chases a fainter tail leaves an apparently empty edge (the raster check calls a
 * pixel painted from 8/255, so the last pixel of a tail at that level reads as empty).
 */
export const VISIBLE_ALPHA = 16 / 255;

/**
 * How far outside its offset box a shadow is still visible. The edge of a Gaussian blur of sigma
 * r / 2 falls off as opacity * (1 - cdf(d / sigma)); this is the distance where that drops below
 * VISIBLE_ALPHA. A faint shadow has no visible reach, so it does not enlarge the frame.
 */
export function visibleReach(s: Pick<Shadow, 'r' | 'opacity'>): number {
  if (s.r <= 0 || s.opacity <= VISIBLE_ALPHA) return 0;
  const q = VISIBLE_ALPHA / s.opacity; // upper-tail probability at the visible edge
  if (q >= 0.5) return 0;
  // Abramowitz & Stegun 26.2.23: upper-tail quantile of the standard normal, error < 4.5e-4
  const t = Math.sqrt(-2 * Math.log(q));
  const z =
    t -
    (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return (s.r / 2) * z;
}

/**
 * The box a node's shadows cover, in the node's own coordinates: each shadow is the source box moved
 * by (dx, dy) and grown by `reach(shadow)` on every side.
 */
export function shadowBox(source: Box, shadows: Shadow[], reach: (s: Shadow) => number): Box {
  let b = source;
  for (const s of shadows) {
    const m = reach(s);
    b = {
      x0: Math.min(b.x0, source.x0 + s.dx - m),
      y0: Math.min(b.y0, source.y0 + s.dy - m),
      x1: Math.max(b.x1, source.x1 + s.dx + m),
      y1: Math.max(b.y1, source.y1 + s.dy + m),
    };
  }
  return b;
}
