/** SVG matrix(a b c d e f). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Composition: the result applies `n` first, then `m`. */
export const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export const isIdentity = (m: Matrix): boolean => m.every((v, i) => v === IDENTITY[i]);

export const round = (n: number): number => Math.round(n * 1000) / 1000;

export const matrixAttr = (m: Matrix): string => `matrix(${m.map(round).join(' ')})`;

export const translate = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy];
