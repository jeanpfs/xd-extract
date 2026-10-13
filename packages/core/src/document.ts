import type { AgcDocument } from './agc';
import type { SourceInfo } from './convert';
import { type ParsedRoot, parseAgc } from './parse';
import { buildSyncIndex } from './sync';

export interface XdArtboard {
  id: string;
  name: string;
  agc: AgcDocument;
  bounds?: { x: number; y: number; width: number; height: number };
  aliases?: string[];
}

export interface XdDocument {
  artboards: XdArtboard[];
  /** The document-wide resources AGC: symbol masters (`resources.meta.ux.symbols`) and gradients. */
  resources?: AgcDocument;
  source: SourceInfo;
}

export interface ParsedArtboard {
  id: string;
  name: string;
  aliases: string[];
  roots: ParsedRoot[];
}

export function parseDocument(doc: XdDocument): ParsedArtboard[] {
  // a symbol instance on one artboard takes its content from a master that may be on another
  const index = buildSyncIndex(
    doc.artboards.map((a) => a.agc),
    doc.resources,
  );
  return doc.artboards.map((a) => ({
    id: a.id,
    name: a.name,
    aliases: a.aliases ?? [],
    roots: parseAgc(a.agc, index),
  }));
}
