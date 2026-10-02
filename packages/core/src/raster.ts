import { Resvg } from '@resvg/resvg-js';

export interface Raster {
  width: number;
  height: number;
  /** One alpha byte per pixel. */
  alpha: Uint8Array;
}

/** System fonts are skipped: text is never part of the output, so scanning them only costs time. */
export function rasterize(svg: string, width = 256): Raster {
  const img = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  }).render();
  const px = img.pixels;
  const alpha = new Uint8Array(img.width * img.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3] as number;
  return { width: img.width, height: img.height, alpha };
}

const PAINTED = 8;

/** Fraction of painted pixels in the `thickness`-pixel band along one edge. */
export function bandFraction(
  r: Raster,
  edge: 'top' | 'bottom' | 'left' | 'right',
  thickness: number,
): number {
  const { width: w, height: h, alpha } = r;
  let painted = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inBand =
        edge === 'top'
          ? y < thickness
          : edge === 'bottom'
            ? y >= h - thickness
            : edge === 'left'
              ? x < thickness
              : x >= w - thickness;
      if (!inBand) continue;
      total += 1;
      if ((alpha[y * w + x] as number) > PAINTED) painted += 1;
    }
  }
  return total ? painted / total : 0;
}

export function paintedRatio(r: Raster): number {
  let painted = 0;
  for (const a of r.alpha) if (a > PAINTED) painted += 1;
  return r.alpha.length ? painted / r.alpha.length : 0;
}
