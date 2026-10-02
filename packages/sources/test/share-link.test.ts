import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgc } from '@xd-extract/core';
import { agcDoc, buildManifest, group, rect, solid } from '@xd-extract/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRecorder, createReplayFetch, extractManifestUrl, loadShareLink, redactTokens } from '../src';
import { BASE, componentUrl, fakeFetch, manifestUrl, pageHtml, pageUrl, TOKEN } from './helpers';

const splashAgc = agcDoc([group('Logo', [rect('r', 0, 0, 10, 10, { fill: solid(1, 2, 3) })])]);
const emptyAgc = { version: '1.5.0', children: [] };

const happyRoutes = () => ({
  [pageUrl]: { body: pageHtml() },
  [manifestUrl]: { body: buildManifest([{ id: 'a1', name: 'Splash', version: '1' }]) },
  [componentUrl('cmp-a1', '1')]: { body: splashAgc },
  [componentUrl('cmp-pasteboard', '1')]: { body: emptyAgc },
});

describe('extractManifestUrl', () => {
  it('finds the manifest URL and unescapes &amp;', () => {
    expect(extractManifestUrl(pageHtml())).toBe(manifestUrl);
  });
  it('returns null when the page does not embed one', () => {
    expect(extractManifestUrl('<html>login required</html>')).toBeNull();
  });
});

describe('loadShareLink', () => {
  it('loads artboards through the manifest, using each component version as the revision', async () => {
    const doc = await loadShareLink(pageUrl, { fetch: fakeFetch(happyRoutes()) });
    expect(doc.source).toEqual({ kind: 'share-link', ref: pageUrl });
    expect(doc.artboards.map((a) => a.name)).toEqual(['pasteboard', 'Splash']);
    expect(parseAgc(doc.artboards[1]!.agc).map((r) => r.node.name)).toEqual(['Logo']);
  });

  it('falls back across revisions when the component has no usable version', async () => {
    const calls: string[] = [];
    const routes = {
      [pageUrl]: { body: pageHtml() },
      [manifestUrl]: { body: buildManifest([{ id: 'a1', name: 'Splash' }], { 'uxdesign#revision': '3' }) },
      [componentUrl('cmp-a1', '3')]: { status: 400, body: '' },
      [componentUrl('cmp-a1', '1')]: { status: 400, body: '' },
      [componentUrl('cmp-a1', '0')]: { body: splashAgc },
      [componentUrl('cmp-pasteboard', '0')]: { body: emptyAgc },
      [componentUrl('cmp-pasteboard', '3')]: { status: 400, body: '' },
      [componentUrl('cmp-pasteboard', '1')]: { status: 400, body: '' },
    };
    const doc = await loadShareLink(pageUrl, { fetch: fakeFetch(routes, calls) });
    expect(doc.artboards.map((a) => a.name)).toEqual(['pasteboard', 'Splash']);
    const revisionsFor = (component: string) =>
      calls.filter((u) => u.includes(`component_id=${component}`)).map((u) => /revision=(\d+)/.exec(u)?.[1]);
    // the first component walks the fallback order: manifest revision, then 1, then 0
    expect(revisionsFor('cmp-pasteboard')).toEqual(['3', '1', '0']);
    // the next one reuses the revision that worked instead of repeating the walk
    expect(revisionsFor('cmp-a1')).toEqual(['0']);
  });

  it('reports NoVectorPayload for a raster-only manifest', async () => {
    const rasterOnly = {
      id: 'x',
      children: [
        {
          id: 'a',
          name: 'artwork',
          path: 'artwork',
          children: [{ id: 'p', name: 'pasteboard', path: 'pasteboard' }],
        },
        { id: 'r', name: 'renderLayers', path: 'renderLayers' },
      ],
    };
    const routes = { [pageUrl]: { body: pageHtml() }, [manifestUrl]: { body: rasterOnly } };
    await expect(loadShareLink(pageUrl, { fetch: fakeFetch(routes) })).rejects.toMatchObject({
      code: 'NoVectorPayload',
    });
  });

  it('maps HTTP failures to typed errors', async () => {
    const f = (routes: Parameters<typeof fakeFetch>[0]) =>
      loadShareLink(pageUrl, { fetch: fakeFetch(routes) });
    await expect(f({ [pageUrl]: { status: 404, body: '' } })).rejects.toMatchObject({ code: 'LinkNotFound' });
    await expect(f({ [pageUrl]: { status: 403, body: '' } })).rejects.toMatchObject({ code: 'PrivateLink' });
    await expect(f({ [pageUrl]: { body: '<html>sign in</html>' } })).rejects.toMatchObject({
      code: 'PrivateLink',
    });
    await expect(
      f({ [pageUrl]: { body: pageHtml() }, [manifestUrl]: { status: 403, body: '' } }),
    ).rejects.toMatchObject({ code: 'TokenExpired' });
    await expect(
      f({ [pageUrl]: { body: pageHtml() }, [manifestUrl]: { status: 500, body: '' } }),
    ).rejects.toMatchObject({ code: 'FetchFailed' });
  });

  it('fails with FetchFailed listing the revisions tried when no component answers', async () => {
    const routes = {
      [pageUrl]: { body: pageHtml() },
      [manifestUrl]: { body: buildManifest([{ id: 'a1', name: 'Splash', version: '1' }]) },
    };
    await expect(loadShareLink(pageUrl, { fetch: fakeFetch(routes) })).rejects.toMatchObject({
      code: 'FetchFailed',
      message: expect.stringContaining('tried revisions'),
    });
  });

  it('never puts a token in an error message', async () => {
    const routes = {
      [pageUrl]: { body: pageHtml() },
      [manifestUrl]: { body: buildManifest([{ id: 'a1', name: 'Splash', version: '1' }]) },
    };
    const err = await loadShareLink(pageUrl, { fetch: fakeFetch(routes) }).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe('recording and replay', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xd-extract-rec-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('redactTokens hides tokens and the CDN host', () => {
    expect(redactTokens(`${BASE}?access_token=${TOKEN}&x=1`)).toBe(
      '{CDN}/content/storage/id/urn:aaid:sc:US:test?access_token=REDACTED&x=1',
    );
  });

  it('records a load without tokens or the raw host, and replays it offline to the same document', async () => {
    const live = await loadShareLink(pageUrl, {
      fetch: fakeFetch(happyRoutes()),
      recorder: createRecorder(dir),
    });

    for (const file of await readdir(dir)) {
      const content = await readFile(join(dir, file), 'utf8');
      expect(content, file).not.toContain(TOKEN);
      expect(content, file).not.toContain('access_token=tok');
      expect(content, file).not.toContain('cdn-sharing.adobecc.com');
    }

    const replayed = await loadShareLink(pageUrl, { fetch: createReplayFetch(dir) });
    expect(replayed).toEqual(live);
  });

  it('replay fails loudly for a URL that was never recorded', async () => {
    const replay = createReplayFetch(dir);
    await expect(replay('https://xd.adobe.com/view/never-recorded/')).rejects.toThrow(/no recording/);
  });
});
