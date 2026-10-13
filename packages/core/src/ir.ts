import type { Matrix } from './matrix';

export type Point = [number, number];

export type Paint = { kind: 'solid'; css: string } | { kind: 'unsupported'; reason: string };

/** A drop shadow, in the coordinates of the node it belongs to. `color` is `rgb(r,g,b)`; alpha is `opacity`. */
export interface Shadow {
  dx: number;
  dy: number;
  /** Blur radius as XD stores it; the SVG standard deviation is half of it. */
  r: number;
  color: string;
  opacity: number;
}

export interface Stroke {
  paint: Paint;
  /** undefined: emit no stroke-width (SVG default 1). */
  width: number | undefined;
  cap?: string;
  join?: string;
  miterLimit?: number;
  dash?: number[];
  /** Only set on closed shapes; undefined is centred. */
  align?: 'inside' | 'outside';
}

/** `pts` are local-space points used for bounding boxes. */
export type Geom =
  | { tag: 'path'; d: string; evenodd: boolean; pts: Point[] }
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx?: number; pts: Point[] }
  | { tag: 'line'; x1: number; y1: number; x2: number; y2: number; pts: Point[] }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number; pts: Point[] };

export interface IrShape {
  kind: 'shape';
  id: string;
  name: string;
  transform: Matrix;
  geom: Geom;
  /** Resolved (inheritance applied). null: no fill. */
  fill: Paint | null;
  /** True when the node itself declared the fill (candidate for the frame plate). */
  ownFill: boolean;
  stroke: Stroke | null;
  opacity: number;
  shadows: Shadow[];
}

export interface IrClipShape {
  name: string;
  transform: Matrix;
  geom: Geom;
}

export interface IrGroup {
  kind: 'group';
  id: string;
  name: string;
  transform: Matrix;
  opacity: number;
  shadows: Shadow[];
  clip: { maskName: string; shapes: IrClipShape[] } | null;
  children: IrNode[];
}

export interface IrTextRun {
  text: string;
  family: string;
  weight: number;
  italic: boolean;
  size: number;
  /** CSS letter-spacing in user units (0: none). */
  letterSpacing: number;
  /** null: unsupported paint, drawn as none. */
  fill: string | null;
  /** CSS text-decoration value; undefined: none. */
  decoration?: string;
}

/** One laid-out line: XD's own wrapping, `x`/`y` as XD stored them (baseline, node coordinates). */
export interface IrTextLine {
  x: number;
  y: number;
  /** Where the line is anchored in the node's coordinates, and which side of the text sits there. */
  anchorX: number;
  anchor: 'start' | 'middle' | 'end';
  runs: IrTextRun[];
}

export interface IrText {
  kind: 'text';
  id: string;
  name: string;
  transform: Matrix;
  opacity: number;
  shadows: Shadow[];
  align: 'left' | 'center' | 'right';
  lines: IrTextLine[];
  /** Local-space corners of the (partly estimated) text box, for the frame. */
  pts: Point[];
}

export type IrNode = IrShape | IrGroup | IrText;
