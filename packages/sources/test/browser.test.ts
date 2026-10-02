import { buildManifest } from '@xd-extract/testkit';
import { describe, expect, it } from 'vitest';
import { discoverManifestUrl, type Exec, loadShareLinkViaBrowser, parseEvalOutput } from '../src/browser';
import { componentUrl, fakeFetch, manifestUrl, pageUrl } from './helpers';

const encodedEval = (v: unknown) => JSON.stringify(JSON.stringify(v));

const stubExec =
  (evalOut: string, calls: string[][] = []): Exec =>
  async (cmd, args) => {
    calls.push([cmd, ...args]);
    return args[0] === 'eval' ? evalOut : '';
  };

describe('parseEvalOutput', () => {
  it('unwraps the double JSON encoding of a returned string', () => {
    expect(parseEvalOutput(encodedEval(manifestUrl))).toBe(manifestUrl);
    expect(parseEvalOutput(encodedEval(null))).toBeNull();
  });
});

describe('discoverManifestUrl', () => {
  it('opens, waits, evaluates and always closes', async () => {
    const calls: string[][] = [];
    const url = await discoverManifestUrl(pageUrl, stubExec(encodedEval(manifestUrl), calls));
    expect(url).toBe(manifestUrl);
    expect(calls.map((c) => c.slice(0, 2).join(' '))).toEqual([
      'agent-browser open',
      'agent-browser wait',
      'agent-browser eval',
      'agent-browser close',
    ]);
  });

  it('reports PrivateLink when the page never requested a manifest, and still closes', async () => {
    const calls: string[][] = [];
    await expect(discoverManifestUrl(pageUrl, stubExec(encodedEval(null), calls))).rejects.toMatchObject({
      code: 'PrivateLink',
    });
    expect(calls.at(-1)![1]).toBe('close');
  });

  it('reports BrowserUnavailable when agent-browser is not installed', async () => {
    const exec: Exec = async () => {
      throw Object.assign(new Error('spawn agent-browser ENOENT'), { code: 'ENOENT' });
    };
    await expect(discoverManifestUrl(pageUrl, exec)).rejects.toMatchObject({ code: 'BrowserUnavailable' });
  });
});

describe('loadShareLinkViaBrowser', () => {
  it('downloads through the shared HTTP path once the URL is discovered', async () => {
    const routes = {
      [manifestUrl]: { body: buildManifest([{ id: 'a1', name: 'Splash', version: '1' }]) },
      [componentUrl('cmp-a1', '1')]: { body: { version: '1.5.0', children: [] } },
      [componentUrl('cmp-pasteboard', '1')]: { body: { version: '1.5.0', children: [] } },
    };
    const doc = await loadShareLinkViaBrowser(pageUrl, {
      exec: stubExec(encodedEval(manifestUrl)),
      fetch: fakeFetch(routes),
    });
    expect(doc.source).toEqual({ kind: 'share-link', ref: pageUrl });
    expect(doc.artboards.map((a) => a.name)).toEqual(['pasteboard', 'Splash']);
  });
});
