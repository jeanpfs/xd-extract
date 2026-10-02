import type { AgcDocument } from './agc';
import type { SourceInfo } from './convert';
import { type ParsedRoot, parseAgc } from './parse';

export interface XdArtboard {
  id: string;
  name: string;
  agc: AgcDocument;
  bounds?: { x: number; y: number; width: number; height: number };
  aliases?: string[];
}

export interface XdDocument {
  artboards: XdArtboard[];
  source: SourceInfo;
}

export interface ParsedArtboard {
  id: string;
  name: string;
  aliases: string[];
  roots: ParsedRoot[];
}

export function parseDocument(doc: XdDocument): ParsedArtboard[] {
  return doc.artboards.map((a) => ({
    id: a.id,
    name: a.name,
    aliases: a.aliases ?? [],
    roots: parseAgc(a.agc),
  }));
}
