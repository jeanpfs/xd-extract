import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { type XdDocument, XdError } from '@xd-extract/core';

/** Loads the `document.json` written by `xd redact` (or any serialized XdDocument). */
export async function loadFixtureDocument(path: string): Promise<XdDocument> {
  let raw: Partial<XdDocument>;
  try {
    raw = JSON.parse(await readFile(path, 'utf8')) as Partial<XdDocument>;
  } catch (e) {
    throw new XdError('InvalidAgc', `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!raw || !Array.isArray(raw.artboards)) {
    throw new XdError('InvalidAgc', `${path} is not an xd-extract document.json (no artboards array)`);
  }
  return {
    artboards: raw.artboards,
    source: raw.source ?? { kind: 'fixture', ref: basename(dirname(path)) },
  };
}
