import { agcDoc, group, patternFill, pngBase64, rect, stripesPng } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { base64ByteLength, collectPatternUids, sniffImage } from '../src/image';

const b64 = (...bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('sniffImage', () => {
  it('recognises the four formats XD embeds by their first bytes', () => {
    expect(sniffImage(stripesPng())).toBe('image/png');
    expect(sniffImage(b64(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1))).toBe('image/jpeg');
    expect(sniffImage(b64(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0))).toBe('image/gif');
    expect(
      sniffImage(b64(0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20)),
    ).toBe('image/webp');
  });

  it('refuses anything else, however it is named, including text and broken base64', () => {
    expect(
      sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')),
    ).toBeNull();
    expect(sniffImage(b64(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull(); // RIFF WAVE
    expect(sniffImage('')).toBeNull();
    expect(sniffImage('!!not base64!!')).toBeNull();
  });
});

describe('base64ByteLength', () => {
  it('counts the bytes behind the padding', () => {
    for (const n of [0, 1, 2, 3, 4, 100, 101]) {
      expect(base64ByteLength(Buffer.alloc(n, 7).toString('base64'))).toBe(n);
    }
    expect(base64ByteLength(pngBase64(3, 3, () => [1, 2, 3]))).toBeGreaterThan(30);
  });
});

describe('collectPatternUids', () => {
  it('finds the image of every pattern fill, in groups and in other documents', () => {
    const a = agcDoc([group('G', [rect('r', 0, 0, 5, 5, { fill: patternFill('u1') })])]);
    const b = agcDoc([
      rect('s', 0, 0, 5, 5, { stroke: patternFill('u2') as never }),
      rect('t', 0, 0, 5, 5, { fill: patternFill('u1') }),
    ]);
    expect([...collectPatternUids([a, b])].sort()).toEqual(['u1', 'u2']);
  });

  it('ignores solid fills and a pattern without an id', () => {
    const noId = { type: 'pattern', pattern: { meta: { ux: {} } } };
    const doc = agcDoc([
      rect('r', 0, 0, 5, 5, { fill: noId as never }),
      rect('s', 0, 0, 5, 5, { fill: { type: 'solid' } }),
    ]);
    expect(collectPatternUids([doc]).size).toBe(0);
  });
});
