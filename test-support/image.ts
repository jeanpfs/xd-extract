import { crc32, deflateSync } from 'node:zlib';
import type { AgcPaint } from '../packages/core/src/agc';

const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A real, valid PNG (8-bit RGB) as base64; `pixel` gives the colour at each position. */
export function pngBase64(
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number],
): string {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

/**
 * 20 x 10: red on the left quarter, green in the middle half, blue on the right quarter.
 * Covering a square with it shows only the green; stretching shows all three.
 */
export const stripesPng = () =>
  pngBase64(20, 10, (x) => (x < 5 ? [255, 0, 0] : x < 15 ? [0, 255, 0] : [0, 0, 255]));

/** An image fill the way XD writes it. */
export const patternFill = (
  uid: string,
  o: { w?: number; h?: number; behavior?: string; ux?: Record<string, unknown> } = {},
): AgcPaint =>
  ({
    type: 'pattern',
    pattern: {
      width: o.w ?? 20,
      height: o.h ?? 10,
      href: 'x',
      meta: { ux: { uid, scaleBehavior: o.behavior ?? 'cover', hrefLastModifiedDate: 0, ...o.ux } },
    },
  }) as AgcPaint;
