import type { FetchLike } from '../src/recording';

export const HOST = 'https://cdn-sharing.adobecc.com';
export const BASE = `${HOST}/content/storage/id/urn:aaid:sc:US:test`;
export const TOKEN = 'tok%3A123';
export const pageUrl = 'https://xd.adobe.com/view/test-share-1234/';

export const qs = (component: string) =>
  `component_id=${component}&api_key=CometServer1&access_token=${TOKEN}`;
export const manifestUrl = `${BASE}?${qs('manifest')}`;
export const componentUrl = (component: string, revision: string) =>
  `${BASE};revision=${revision}?${qs(component)}`;

/** The viewer embeds the manifest URL HTML-escaped in a script tag. */
export const pageHtml = (url = manifestUrl) =>
  `<html><head><script>window.prototypeData = {"manifest":"${url.replace(/&/g, '&amp;')}"}</script></head></html>`;

interface Route {
  status?: number;
  body: unknown;
}

/** Exact-URL router. Unknown URLs answer 404, like a missing component would. */
export const fakeFetch =
  (routes: Record<string, Route>, calls: string[] = []): FetchLike =>
  async (url) => {
    calls.push(url);
    const hit = routes[url];
    if (!hit) return new Response('', { status: 404 });
    return new Response(typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body), {
      status: hit.status ?? 200,
    });
  };
