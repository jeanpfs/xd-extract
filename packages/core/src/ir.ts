import type { Matrix } from './matrix';

export type Point = [number, number];

export type Paint = { kind: 'solid'; css: string } | { kind: 'unsupported'; reason: string };

export interface Stroke {
  paint: Paint;
  /** undefined: emit no stroke-width (SVG default 1). */
  width: number | undefined;
  cap?: string;
  join?: string;
  miterLimit?: number;
  dash?: number[];
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
  clip: { maskName: string; shapes: IrClipShape[] } | null;
  children: IrNode[];
}

export type IrNode = IrShape | IrGroup;
