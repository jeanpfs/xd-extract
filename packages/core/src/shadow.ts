import type { Box } from './frame';
import type { Shadow } from './ir';

/**
 * The box a node's shadows cover, in the node's own coordinates: each shadow is the source box moved by
 * (dx, dy) and grown by `k * r` on every side. The frame uses k = 1 (where a blur is visibly painted);
 * the filter region uses k = 1.5 (3 sigma, so the tail is not cut).
 */
export function shadowBox(source: Box, shadows: Shadow[], k: number): Box {
  let b = source;
  for (const s of shadows) {
    const m = s.r * k;
    b = {
      x0: Math.min(b.x0, source.x0 + s.dx - m),
      y0: Math.min(b.y0, source.y0 + s.dy - m),
      x1: Math.max(b.x1, source.x1 + s.dx + m),
      y1: Math.max(b.y1, source.y1 + s.dy + m),
    };
  }
  return b;
}
