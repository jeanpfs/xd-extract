import type { Box } from './frame';
import type { Shadow } from './ir';

/**
 * The alpha below which a shadow is not worth a frame margin: about 6 % black on white is hard to see,
 * and a frame that chases a fainter tail leaves an apparently empty edge (the raster check calls a
 * pixel painted from 8/255, so the last pixel of a tail at that level reads as empty).
 */
export const VISIBLE_ALPHA = 16 / 255;

/** Upper-tail quantile of the standard normal (Abramowitz & Stegun 26.2.23, error < 4.5e-4). */
function upperQuantile(q: number): number {
  const t = Math.sqrt(-2 * Math.log(q));
  return (
    t -
    (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)
  );
}

/**
 * How far outside its offset box a shadow is still visible. The edge of a Gaussian blur of sigma
 * r / 2 falls off as opacity * (1 - cdf(d / sigma)); this is the distance where that drops below
 * VISIBLE_ALPHA. A faint shadow has no visible reach, so it does not enlarge the frame.
 */
export function visibleReach(s: Pick<Shadow, 'r' | 'opacity'>): number {
  if (s.r <= 0 || s.opacity <= VISIBLE_ALPHA) return 0;
  const q = VISIBLE_ALPHA / s.opacity; // upper-tail probability at the visible edge
  if (q >= 0.5) return 0;
  return (s.r / 2) * upperQuantile(q);
}

/** How far a blurred edge still shows: the step edge of a Gaussian falls below VISIBLE_ALPHA there. */
export function visibleBlurReach(sigma: number): number {
  return sigma > 0 ? sigma * upperQuantile(VISIBLE_ALPHA) : 0;
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

/**
 * Everything a node's effects cover: the object blurred (grown by `blurReach`), and the shadows of that
 * blurred object (moved and grown by `reach`).
 */
export function effectsBox(
  source: Box,
  effects: { shadows: Shadow[]; blur?: number },
  reach: (s: Shadow) => number,
  blurReach: (sigma: number) => number,
): Box {
  const m = effects.blur ? blurReach(effects.blur) : 0;
  const blurred = { x0: source.x0 - m, y0: source.y0 - m, x1: source.x1 + m, y1: source.y1 + m };
  return shadowBox(blurred, effects.shadows, reach);
}
