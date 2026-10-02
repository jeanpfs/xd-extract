import { type AgcDocument, parseManifest, type XdArtboard, type XdDocument, XdError } from '@xd-extract/core';
import { type FetchLike, type Recorder, redactTokens } from './recording';

export interface ShareLinkOptions {
  fetch?: FetchLike;
  recorder?: Recorder;
}

const MANIFEST_URL =
  /https:\/\/cdn-sharing\.adobecc\.com\/content\/storage\/id\/[^"'\s<>]*component_id=manifest[^"'\s<>]*/;

/** The viewer embeds the manifest URL, HTML-escaped, in the static page. */
export function extractManifestUrl(html: string): string | null {
  const m = MANIFEST_URL.exec(html);
  return m ? m[0].replaceAll('&amp;', '&') : null;
}

async function get(
  f: FetchLike,
  recorder: Recorder | undefined,
  url: string,
): Promise<{ status: number; body: string }> {
  let res: Response;
  try {
    res = await f(url, { redirect: 'follow' });
  } catch (e) {
    throw new XdError(
      'FetchFailed',
      `request failed for ${redactTokens(url)}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const body = await res.text();
  recorder?.record(url, res.status, body);
  return { status: res.status, body };
}

const rawParam = (url: string, key: string): string | undefined =>
  new RegExp(`[?&]${key}=([^&]+)`).exec(url)?.[1];

export async function loadFromManifestUrl(
  manifestUrl: string,
  ref: string,
  opts: ShareLinkOptions = {},
): Promise<XdDocument> {
  const f: FetchLike = opts.fetch ?? fetch;
  const man = await get(f, opts.recorder, manifestUrl);
  if (man.status === 401 || man.status === 403) {
    throw new XdError(
      'TokenExpired',
      `the manifest request was refused (HTTP ${man.status}); the link token may have expired or the link is private`,
    );
  }
  if (man.status >= 400)
    throw new XdError('FetchFailed', `the manifest request failed with HTTP ${man.status}`);
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(man.body) as Record<string, unknown>;
  } catch {
    throw new XdError('FetchFailed', 'the manifest response is not JSON');
  }

  const listed = parseManifest(manifest);
  if (!listed.length) {
    throw new XdError(
      'NoVectorPayload',
      'this link exposes no vector payload: its manifest has no graphicContent.agc (a raster-only prototype stores renderLayers.json and PNGs). No SVG can be extracted from it.',
    );
  }

  const apiKey = rawParam(manifestUrl, 'api_key');
  const token = rawParam(manifestUrl, 'access_token');
  if (!apiKey || !token) throw new XdError('FetchFailed', 'the manifest URL has no api_key or access_token');
  const url = new URL(manifestUrl);
  const base = `${url.origin}${url.pathname}`;
  const manifestRevision = manifest['uxdesign#revision'];
  const manifestRev =
    typeof manifestRevision === 'string' || typeof manifestRevision === 'number'
      ? String(manifestRevision)
      : undefined;

  const artboards: XdArtboard[] = [];
  let learned: string | undefined;
  for (const a of listed) {
    const candidates = [
      ...new Set([a.agc.version, learned, manifestRev, '1', '0'].filter((v): v is string => v !== undefined)),
    ];
    let agc: AgcDocument | undefined;
    let lastStatus = 0;
    for (const rev of candidates) {
      const u = `${base};revision=${rev}?component_id=${a.agc.componentId}&api_key=${apiKey}&access_token=${token}`;
      const r = await get(f, opts.recorder, u);
      lastStatus = r.status;
      if (r.status === 401 || r.status === 403) {
        throw new XdError('TokenExpired', `the AGC request for "${a.name}" was refused (HTTP ${r.status})`);
      }
      if (r.status === 200) {
        try {
          agc = JSON.parse(r.body) as AgcDocument;
        } catch {
          throw new XdError('InvalidAgc', `the AGC of "${a.name}" is not valid JSON`);
        }
        learned = rev;
        break;
      }
    }
    if (!agc) {
      throw new XdError(
        'FetchFailed',
        `could not fetch the AGC of "${a.name}" (last HTTP ${lastStatus}); tried revisions ${candidates.join(', ')}`,
      );
    }
    artboards.push({
      id: a.id,
      name: a.name,
      agc,
      aliases: a.aliases,
      ...(a.bounds ? { bounds: a.bounds } : {}),
    });
  }
  return { artboards, source: { kind: 'share-link', ref } };
}

export async function loadShareLink(url: string, opts: ShareLinkOptions = {}): Promise<XdDocument> {
  const f: FetchLike = opts.fetch ?? fetch;
  const page = await get(f, opts.recorder, url);
  if (page.status === 404 || page.status === 410) {
    throw new XdError('LinkNotFound', `the share link answered HTTP ${page.status}`);
  }
  if (page.status === 401 || page.status === 403) {
    throw new XdError(
      'PrivateLink',
      `the share link answered HTTP ${page.status}; it is private or password protected`,
    );
  }
  if (page.status >= 400) throw new XdError('FetchFailed', `the share link answered HTTP ${page.status}`);
  const manifestUrl = extractManifestUrl(page.body);
  if (!manifestUrl) {
    throw new XdError(
      'PrivateLink',
      'no manifest URL in the page HTML: the link may be private or password protected, or use a layout this tool has not seen. Retry with --browser.',
    );
  }
  return loadFromManifestUrl(manifestUrl, url, opts);
}
