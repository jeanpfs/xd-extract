import type { AgcDocument, AgcNode, AgcStyle, AgcTransform } from '../packages/core/src/agc';

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
