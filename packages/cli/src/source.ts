import { type XdDocument, XdError } from '@xd-extract/core';
import {
  createRecorder,
  loadFixtureDocument,
  loadShareLink,
  loadShareLinkViaBrowser,
  loadXdFile,
} from '@xd-extract/sources';

export interface SourceFlags {
  browser?: boolean | undefined;
  record?: string | undefined;
}

/** `--max-embed-bytes`: the largest image embedded in an SVG. Undefined keeps the default (2 MiB). */
export function embedLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new XdError('Usage', `--max-embed-bytes needs a whole number of bytes, got "${value}"`);
  }
  return n;
}

export async function openSource(arg: string | undefined, flags: SourceFlags): Promise<XdDocument> {
  if (!arg) throw new XdError('Usage', 'missing <source> (share link, .xd file or document.json)');
  if (/^https?:\/\//i.test(arg)) {
    const recorder = flags.record ? createRecorder(flags.record) : undefined;
    return flags.browser ? loadShareLinkViaBrowser(arg, { recorder }) : loadShareLink(arg, { recorder });
  }
  if (flags.browser || flags.record)
    throw new XdError('Usage', '--browser and --record only apply to share links');
  const lower = arg.toLowerCase();
  if (lower.endsWith('.xd')) return loadXdFile(arg);
  if (lower.endsWith('.json')) return loadFixtureDocument(arg);
  throw new XdError('Usage', `source must be an http(s) share link, a .xd file or a document.json: ${arg}`);
}
