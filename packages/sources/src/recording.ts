import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CDN_HOST = 'https://cdn-sharing.adobecc.com';

export type FetchLike = (input: string, init?: { redirect?: 'follow' }) => Promise<Response>;

export interface Recorder {
  record(url: string, status: number, body: string): void;
}

interface IndexEntry {
  key: string;
  status: number;
  file: string;
}

/** Strips the access token and replaces the CDN host so recordings are safe to commit. */
export const redactTokens = (s: string): string =>
  s.replace(/access_token=[^&"'\s<>]+/g, 'access_token=REDACTED').replaceAll(CDN_HOST, '{CDN}');

export const hydrate = (s: string): string => s.replaceAll('{CDN}', CDN_HOST);

/**
 * Writes every response to `<n>.txt` plus an `index.json` keyed by the redacted URL.
 * NOTE: bodies are full design JSON. Recording a private design writes that design to disk.
 */
export function createRecorder(dir: string): Recorder {
  mkdirSync(dir, { recursive: true });
  const entries: IndexEntry[] = [];
  return {
    record(url, status, body) {
      const file = `${entries.length + 1}.txt`;
      writeFileSync(join(dir, file), redactTokens(body));
      entries.push({ key: redactTokens(url), status, file });
      writeFileSync(join(dir, 'index.json'), JSON.stringify({ entries }, null, 2));
    },
  };
}

export function createReplayFetch(dir: string): FetchLike {
  const { entries } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { entries: IndexEntry[] };
  return async (input) => {
    const key = redactTokens(input);
    const hit = entries.find((e) => e.key === key);
    if (!hit) throw new Error(`no recording for ${key}`);
    return new Response(hydrate(readFileSync(join(dir, hit.file), 'utf8')), { status: hit.status });
  };
}
