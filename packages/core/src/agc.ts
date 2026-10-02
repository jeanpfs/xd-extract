import type { AgcColor } from './color';

export interface AgcTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface AgcPaint {
  type?: string;
  color?: AgcColor;
  width?: number;
  align?: string;
  cap?: string;
  lineCap?: string;
  join?: string;
  lineJoin?: string;
  miterLimit?: number;
  dash?: number[];
}

export interface AgcStyle {
  fill?: AgcPaint;
  stroke?: AgcPaint;
  opacity?: number;
  filters?: unknown;
  clipPath?: unknown;
}

export interface AgcShape {
  type?: string;
  path?: string;
  winding?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** rect: array of 4 corner radii [tl, tr, br, bl]; circle: number. */
  r?: number | number[];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface AgcNode {
  type?: string;
  name?: string;
  id?: string;
  transform?: AgcTransform;
  /** Present only when false. */
  visible?: boolean;
  style?: AgcStyle;
  shape?: AgcShape;
  group?: { children?: AgcNode[] };
  artboard?: { children?: AgcNode[] };
  meta?: { ux?: { isMaskGroup?: boolean; clipPathResources?: { children?: AgcNode[] } } };
}

export interface AgcDocument {
  version?: string;
  children?: AgcNode[];
}
