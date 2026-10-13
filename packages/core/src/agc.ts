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

export interface AgcTextRange {
  length?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  charSpacing?: number;
  underline?: boolean;
  strikethrough?: boolean;
  textTransform?: string;
  textScript?: string;
  /** ARGB as an unsigned 32-bit integer. */
  fill?: { value?: number };
}

export interface AgcTextSegment {
  x?: number;
  y?: number;
  from?: number;
  to?: number;
}

export interface AgcText {
  frame?: { type?: string; width?: number; height?: number };
  rawText?: string;
  paragraphs?: { lines?: AgcTextSegment[][] }[];
}

export interface AgcStyle {
  font?: { postscriptName?: string; family?: string; style?: string; size?: number };
  textAttributes?: { lineHeight?: number; paragraphAlign?: string };
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
  text?: AgcText;
  group?: { children?: AgcNode[] };
  artboard?: { children?: AgcNode[] };
  meta?: {
    ux?: {
      isMaskGroup?: boolean;
      clipPathResources?: { children?: AgcNode[] };
      rangedStyles?: AgcTextRange[];
    };
  };
}

export interface AgcDocument {
  version?: string;
  children?: AgcNode[];
}
