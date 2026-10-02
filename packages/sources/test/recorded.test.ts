import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReplayFetch, loadShareLink } from '../src';

const dir = join(import.meta.dirname, '../../../fixtures/recorded/sample-prototype');

describe('recorded Adobe sample (raster-only prototype)', () => {
  it('reports NoVectorPayload offline', async () => {
    await expect(
      loadShareLink('https://xd.adobe.com/view/03b1317d-e479-43b9-7c5f-8e291ed15d40-7580/', {
        fetch: createReplayFetch(dir),
      }),
    ).rejects.toMatchObject({ code: 'NoVectorPayload' });
  });
});
