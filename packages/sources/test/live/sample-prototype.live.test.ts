import { convertRoot, parseDocument } from '@xd-extract/core';
import { describe, expect, it } from 'vitest';
import { loadShareLink } from '../../src';

const SAMPLE = 'https://xd.adobe.com/view/03b1317d-e479-43b9-7c5f-8e291ed15d40-7580/';

describe.skipIf(!process.env.XD_LIVE)('live share links (nightly)', () => {
  it('the Adobe sample is raster-only and reports NoVectorPayload', async () => {
    await expect(loadShareLink(SAMPLE)).rejects.toMatchObject({ code: 'NoVectorPayload' });
  });

  it.skipIf(!process.env.XD_LIVE_POSITIVE_URL)(
    'a positive public link yields at least one convertible node',
    async () => {
      const doc = await loadShareLink(process.env.XD_LIVE_POSITIVE_URL as string);
      const roots = parseDocument(doc).flatMap((a) => a.roots.map((r) => ({ a, r })));
      expect(roots.length).toBeGreaterThan(0);
      const results = roots.map(({ a, r }) => {
        try {
          return convertRoot(a.name, r).svg.length;
        } catch {
          return 0;
        }
      });
      expect(results.some((n) => n > 0)).toBe(true);
    },
  );
});
