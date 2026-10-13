import type { AgcDocument, AgcNode, AgcStyle, AgcTextRange, AgcTransform } from '../packages/core/src/agc';

const T0: AgcTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export const solid = (r: number, g: number, b: number, alpha?: number) => ({
  type: 'solid',
  color: { mode: 'RGB', value: { r, g, b }, ...(alpha === undefined ? {} : { alpha }) },
});

export const rect = (
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: AgcStyle = {},
  extra: Partial<AgcNode> = {},
): AgcNode => ({
  type: 'shape',
  name,
  id: `id-${name}`,
  transform: { ...T0 },
  shape: { type: 'rect', x, y, width, height },
  style,
  ...extra,
});

export const circle = (name: string, cx: number, cy: number, r: number, style: AgcStyle = {}): AgcNode => ({
  type: 'shape',
  name,
  id: `id-${name}`,
  transform: { ...T0 },
  shape: { type: 'circle', cx, cy, r },
  style,
});

export const group = (name: string, children: AgcNode[], over: Partial<AgcNode> = {}): AgcNode => ({
  type: 'group',
  name,
  id: `id-${name}`,
  transform: { ...T0 },
  group: { children },
  ...over,
});

export const withTransform = (node: AgcNode, t: Partial<AgcTransform>): AgcNode => ({
  ...node,
  transform: { ...T0, ...t },
});

/** A real artboard AGC wraps its roots in children[0].artboard.children. */
export const agcDoc = (roots: AgcNode[]): AgcDocument => ({
  version: '1.5.0',
  children: [{ type: 'artboard', artboard: { children: roots } }],
});

export interface TextOpts {
  x?: number;
  y?: number;
  size?: number;
  family?: string;
  fontStyle?: string;
  /** rgb of the node fill (also used for the ranged fill unless `ranges` is given). */
  fill?: [number, number, number];
  align?: string;
  /** Layout x of each line (center/right text stores negative offsets). */
  xs?: number[];
  lineHeight?: number;
  ranges?: AgcTextRange[];
  frame?: string;
  frameWidth?: number;
  style?: AgcStyle;
}

const argb = ([r, g, b]: [number, number, number], a = 255) => ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;

/** A positioned text node the way XD stores it: one paragraph per line, one segment per line. */
export const text = (name: string, raw: string, o: TextOpts = {}): AgcNode => {
  const size = o.size ?? 20;
  const lh = o.lineHeight ?? Math.round(size * 1.45);
  const fill = o.fill ?? [0, 0, 0];
  const ranges = o.ranges ?? [
    {
      length: raw.length,
      fontFamily: o.family ?? 'Poppins',
      fontStyle: o.fontStyle ?? 'Regular',
      fontSize: size,
      charSpacing: 0,
      fill: { value: argb(fill) },
    },
  ];
  let at = 0;
  const paragraphs = raw.split('\n').map((line, i) => {
    const seg = { y: i * lh, from: at, to: at + line.length, x: o.xs?.[i] ?? 0 };
    at += line.length + 1;
    return { lines: [[seg]] };
  });
  return {
    type: 'text',
    name,
    id: `id-${name}`,
    transform: { ...T0, tx: o.x ?? 0, ty: o.y ?? 0 },
    meta: { ux: { rangedStyles: ranges } },
    style: {
      fill: solid(...fill),
      font: { family: o.family ?? 'Poppins', style: o.fontStyle ?? 'Regular', size },
      ...(o.align ? { textAttributes: { paragraphAlign: o.align } } : {}),
      ...o.style,
    },
    text: {
      frame: {
        type: o.frame ?? 'positioned',
        ...(o.frameWidth !== undefined ? { width: o.frameWidth } : {}),
      },
      paragraphs,
      rawText: raw,
    },
  };
};

export { argb };

/** A symbol instance: a placeholder that takes everything from the node whose id is `source`. */
export const syncRef = (source: string, over: Partial<AgcNode> = {}): AgcNode => ({
  type: 'syncRef',
  syncSourceGuid: source,
  guid: `guid-${source}`,
  ...over,
});

export const polygon = (
  name: string,
  points: [number, number][],
  style: AgcStyle = {},
  extra: Partial<AgcNode> = {},
): AgcNode => ({
  type: 'shape',
  name,
  id: `id-${name}`,
  transform: { ...T0 },
  shape: { type: 'polygon', points: points.map(([x, y]) => ({ x, y })) },
  style,
  ...extra,
});
