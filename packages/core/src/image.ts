import type { AgcDocument } from './agc';

/** Image bytes by pattern `uid`, base64 (so a document stays plain JSON). */
export type XdImages = Record<string, string>;

/** An image bigger than this is not embedded in an SVG unless the caller raises the limit. */
export const DEFAULT_MAX_EMBED_BYTES = 2 * 1024 * 1024;

export const base64ByteLength = (b64: string): number => {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
};

/** The image type from its first bytes, never from a file name or a header that could lie. */
export function sniffImage(b64: string): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  let head: Uint8Array;
  try {
    head = Uint8Array.from(atob(b64.slice(0, 24)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/** Every image id the artwork refers to, so a loader reads or fetches only those. */
export function collectPatternUids(docs: AgcDocument[]): Set<string> {
  const uids = new Set<string>();
  const visit = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const x of o) visit(x);
    } else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (r.type === 'pattern') {
        const uid = (r.pattern as { meta?: { ux?: { uid?: unknown } } } | undefined)?.meta?.ux?.uid;
        if (typeof uid === 'string') uids.add(uid);
      }
      for (const v of Object.values(r)) visit(v);
    }
  };
  for (const d of docs) visit(d);
  return uids;
}
