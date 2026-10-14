import type { AgcColor } from './color';

export interface AgcTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface AgcGradientStop {
  offset?: number;
  color?: AgcColor;
}

/** Stops and type, inline under `gradient.meta.ux.gradientResources` or shared in `resources.gradients[ref]`. */
export interface AgcGradientResource {
  type?: string;
  stops?: AgcGradientStop[];
  /** angular */
  x?: number;
  y?: number;
  rotation?: number;
}

export interface AgcGradient {
  units?: string;
  /** linear */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** radial */
  cx?: number;
  cy?: number;
  fx?: number;
  fy?: number;
  r?: number;
  transform?: AgcTransform;
  ref?: string;
  meta?: { ux?: { gradientResources?: AgcGradientResource } };
}

export interface AgcPaint {
  type?: string;
  gradient?: AgcGradient;
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
  blendMode?: string;
  filters?: unknown;
  clipPath?: unknown;
}

export interface AgcShape {
  type?: string;
  path?: string;
  /** polygon */
  points?: { x: number; y: number }[];
  /** compound shapes, and a symbol instance's overrides */
  children?: AgcNode[];
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
  /** syncRef: the id of the node this instance takes its content from, and this instance's own id. */
  syncSourceGuid?: string;
  guid?: string;
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
  /** Only the resources document has this: symbol masters and shared gradients. */
  resources?: {
    meta?: { ux?: { symbols?: AgcNode[] } };
    gradients?: Record<string, AgcGradientResource>;
  };
}
