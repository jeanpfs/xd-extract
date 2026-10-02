import type { AgcDocument, AgcNode } from './agc';
import type { XdDocument } from './document';

/** Strings the converter and parser actually read. Everything else becomes "x". */
const KEEP_KEYS = new Set([
  'type',
  'mode',
  'align',
  'winding',
  'operation',
  'cap',
  'join',
  'lineCap',
  'lineJoin',
  'version',
  'nameL10N',
  'rule',
]);
const ID_KEYS = new Set(['id', 'ref', 'symbolId']);

/**
 * Anonymises a document for use as a public fixture. Removes names, ids, text, fonts and every
 * string it does not recognise. Geometry (numbers and path data) is kept on purpose, so the
 * author must still confirm the artwork itself is publishable.
 */
export function redactDocument(doc: XdDocument): XdDocument {
  const ids = new Map<string, string>();
  const idFor = (v: string) => {
    let r = ids.get(v);
    if (!r) {
      r = `id-${ids.size + 1}`;
      ids.set(v, r);
    }
    return r;
  };
  let names = 0;

  const visit = (value: unknown, key: string, parent: Record<string, unknown> | null): unknown => {
    if (typeof value === 'string') {
      if (KEEP_KEYS.has(key)) return value;
      if (key === 'path' && parent && (parent.type === 'path' || parent.type === 'compound')) return value;
      if (ID_KEYS.has(key)) return idFor(value);
      if (key === 'name') return `${typeof parent?.type === 'string' ? parent.type : 'node'}-${++names}`;
      return 'x';
    }
    if (Array.isArray(value)) return value.map((v) => visit(v, key, parent));
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) out[k] = visit(v, k, o);
      return out;
    }
    return value;
  };

  return {
    source: { kind: 'fixture', ref: 'redacted' },
    artboards: doc.artboards.map((a, i) => ({
      id: idFor(a.id),
      name: `artboard-${i + 1}`,
      ...(a.bounds ? { bounds: a.bounds } : {}),
      agc: visit(a.agc, 'agc', null) as AgcDocument,
    })),
  };
}

/**
 * Removes top-level nodes by exact name from every artboard and from the pasteboard, before
 * redaction (names are gone afterwards). Use it for content that must not be published even
 * anonymised, such as a third-party logo. Returns how many roots each name removed, so a typo
 * (count 0) can be rejected. The input is not mutated.
 */
export function dropRoots(
  doc: XdDocument,
  names: string[],
): { doc: XdDocument; dropped: Record<string, number> } {
  const counts = new Map(names.map((n) => [n, 0]));
  const keep = (n: AgcNode): boolean => {
    const seen = n.name === undefined ? undefined : counts.get(n.name);
    if (seen === undefined) return true;
    counts.set(n.name as string, seen + 1);
    return false;
  };
  const artboards = doc.artboards.map((a) => {
    const children = a.agc.children ?? [];
    const first = children[0];
    // Real artboards wrap their roots in children[0].artboard.children; the pasteboard does not.
    if (first?.type === 'artboard' && first.artboard) {
      const wrapped = {
        ...first,
        artboard: { ...first.artboard, children: (first.artboard.children ?? []).filter(keep) },
      };
      return { ...a, agc: { ...a.agc, children: [wrapped, ...children.slice(1)] } };
    }
    return { ...a, agc: { ...a.agc, children: children.filter(keep) } };
  });
  return { doc: { ...doc, artboards }, dropped: Object.fromEntries(counts) };
}
