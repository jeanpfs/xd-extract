import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  type AgcDocument,
  collectPatternUids,
  parseManifest,
  type XdArtboard,
  type XdDocument,
  XdError,
  type XdImages,
} from '@xd-extract/core';
import { unzipSync } from 'fflate';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** Larger images are not read at all: no SVG would embed them, and they are the bulk of an archive. */
export const MAX_LOAD_IMAGE_BYTES = 32 * 1024 * 1024;

/** Only inflate what we read: `.xd` files carry large bitmaps under resources/. */
const wanted = (name: string) =>
  name === 'mimetype' ||
  name === 'manifest' ||
  name === 'resources/graphics/graphicContent.agc' ||
  /^artwork\/[^/]+\/graphics\/graphicContent\.agc$/.test(name);

export function readXdBytes(bytes: Uint8Array, ref: string): XdDocument {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => wanted(f.name) });
  } catch {
    throw new XdError('NotAnXdFile', `${ref} is not a ZIP archive`);
  }
  const mimetype = files.mimetype ? text(files.mimetype) : '';
  if (!mimetype.startsWith('application/vnd.adobe.')) {
    throw new XdError('NotAnXdFile', `${ref} has no Adobe mimetype entry`);
  }
  const manifestBytes = files.manifest;
  if (!manifestBytes) throw new XdError('NotAnXdFile', `${ref} has no manifest entry`);
  let manifest: unknown;
  try {
    manifest = JSON.parse(text(manifestBytes));
  } catch {
    throw new XdError('NotAnXdFile', `${ref}: the manifest entry is not JSON`);
  }

  const artboards: XdArtboard[] = [];
  for (const a of parseManifest(manifest)) {
    const agcBytes = files[`artwork/${a.dir}/graphics/graphicContent.agc`];
    if (!agcBytes) continue;
    let agc: AgcDocument;
    try {
      agc = JSON.parse(text(agcBytes)) as AgcDocument;
    } catch {
      throw new XdError('InvalidAgc', `${ref}: the AGC of "${a.name}" is not valid JSON`);
    }
    artboards.push({
      id: a.id,
      name: a.name,
      agc,
      aliases: a.aliases,
      ...(a.bounds ? { bounds: a.bounds } : {}),
    });
  }
  let resources: AgcDocument | undefined;
  const resourcesBytes = files['resources/graphics/graphicContent.agc'];
  if (resourcesBytes) {
    try {
      resources = JSON.parse(text(resourcesBytes)) as AgcDocument;
    } catch {
      throw new XdError('InvalidAgc', `${ref}: the resources AGC is not valid JSON`);
    }
  }
  // Image bytes are stored as resources/<uid>; only the ones the artwork uses are inflated.
  const uids = collectPatternUids([...artboards.map((a) => a.agc), ...(resources ? [resources] : [])]);
  let images: XdImages | undefined;
  if (uids.size) {
    const prefix = 'resources/';
    const found = unzipSync(bytes, {
      filter: (f) =>
        f.name.startsWith(prefix) &&
        uids.has(f.name.slice(prefix.length)) &&
        f.originalSize <= MAX_LOAD_IMAGE_BYTES,
    });
    const entries = Object.entries(found).map(([name, data]) => [
      name.slice(prefix.length),
      Buffer.from(data).toString('base64'),
    ]);
    if (entries.length) images = Object.fromEntries(entries);
  }
  return {
    artboards,
    ...(resources ? { resources } : {}),
    ...(images ? { images } : {}),
    source: { kind: 'xd-file', ref },
  };
}

export async function loadXdFile(path: string): Promise<XdDocument> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (e) {
    throw new XdError('NotAnXdFile', `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return readXdBytes(bytes, basename(path));
}
