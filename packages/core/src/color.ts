import { round } from './matrix';

export interface AgcColor {
  mode?: string;
  value?: { r?: number; g?: number; b?: number };
  alpha?: number | null;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** AGC keeps alpha beside the colour; fold it into rgba() so translucency survives. */
export function solidCss(c: AgcColor): string {
  const v = c.value ?? {};
  const r = Math.round(v.r ?? 0);
  const g = Math.round(v.g ?? 0);
  const b = Math.round(v.b ?? 0);
  const a = c.alpha;
  return a === undefined || a === null || a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${round(a)})`;
}

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = Number.parseInt(m[1] as string, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = (m[1] as string).split('').map((ch) => Number.parseInt(ch + ch, 16));
    return { r: r as number, g: g as number, b: b as number };
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}

export const colorDistance = (a: Rgb, b: Rgb): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
