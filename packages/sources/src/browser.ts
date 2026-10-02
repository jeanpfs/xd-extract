import { execFile } from 'node:child_process';
import { type XdDocument, XdError } from '@xd-extract/core';
import { loadFromManifestUrl, type ShareLinkOptions } from './share-link';

export type Exec = (cmd: string, args: string[], stdin?: string) => Promise<string>;

export const nodeExec: Exec = (cmd, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
    if (stdin !== undefined) child.stdin?.end(stdin);
  });

// `agent-browser eval --stdin` takes ONE expression and forbids bare top-level await.
const DISCOVER = `(async () => {
  const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('component_id=manifest'));
  return JSON.stringify(u ?? null);
})()`;

/** `agent-browser eval` JSON-encodes what the page returns, and we return a JSON string: decode twice. */
export function parseEvalOutput(stdout: string): unknown {
  const once: unknown = JSON.parse(stdout.trim());
  return typeof once === 'string' ? JSON.parse(once) : once;
}

export async function discoverManifestUrl(pageUrl: string, exec: Exec = nodeExec): Promise<string> {
  try {
    await exec('agent-browser', ['open', pageUrl]);
    await exec('agent-browser', ['wait', '--load', 'networkidle']);
    const url = parseEvalOutput(await exec('agent-browser', ['eval', '--stdin'], DISCOVER));
    if (typeof url !== 'string') {
      throw new XdError(
        'PrivateLink',
        'the page loaded in the browser but never requested a manifest: the link may be private or password protected',
      );
    }
    return url;
  } catch (e) {
    if (e instanceof XdError) throw e;
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new XdError(
        'BrowserUnavailable',
        'agent-browser was not found on PATH: install it, or drop --browser',
      );
    }
    throw new XdError(
      'BrowserUnavailable',
      `browser capture failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    await exec('agent-browser', ['close']).catch(() => undefined);
  }
}

export async function loadShareLinkViaBrowser(
  pageUrl: string,
  opts: ShareLinkOptions & { exec?: Exec } = {},
): Promise<XdDocument> {
  const manifestUrl = await discoverManifestUrl(pageUrl, opts.exec);
  return loadFromManifestUrl(manifestUrl, pageUrl, opts);
}
