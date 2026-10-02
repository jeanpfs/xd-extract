import type { ParsedArtboard } from './document';
import { XdError } from './errors';
import type { ParsedRoot } from './parse';

/** Name, then id, then any alias that contains the key (a share-URL id often sits inside `artboard-<id>`). */
export function selectArtboards<T extends { id: string; name: string; aliases?: string[] }>(
  list: T[],
  key: string,
): T[] {
  const byName = list.filter((a) => a.name === key);
  if (byName.length) return byName;
  const byId = list.filter((a) => a.id === key);
  if (byId.length) return byId;
  if (key.length >= 8) return list.filter((a) => a.aliases?.some((s) => s.includes(key)));
  return [];
}

export interface NodeMatch {
  artboard: ParsedArtboard;
  root: ParsedRoot;
}

const available = (pool: ParsedArtboard[]) =>
  pool
    .flatMap((a) => a.roots.map((r) => r.node.name))
    .slice(0, 40)
    .join(', ');

/** Selector is an exact top-level node name, or `id:<node id>`. */
export function resolveNode(artboards: ParsedArtboard[], selector: string, artboardKey?: string): NodeMatch {
  let pool = artboards;
  if (artboardKey !== undefined) {
    pool = selectArtboards(artboards, artboardKey);
    if (!pool.length) {
      throw new XdError(
        'TargetNotFound',
        `artboard not found: "${artboardKey}". Available: ${artboards.map((a) => a.name).join(', ')}`,
      );
    }
  }
  const byId = selector.startsWith('id:');
  const wanted = byId ? selector.slice(3) : selector;
  const matches: NodeMatch[] = [];
  for (const artboard of pool) {
    for (const root of artboard.roots) {
      if ((byId ? root.node.id : root.node.name) === wanted) matches.push({ artboard, root });
    }
  }
  if (matches.length === 0) {
    throw new XdError(
      'TargetNotFound',
      `node not found: "${selector}". Available top-level nodes: ${available(pool)}`,
    );
  }
  if (matches.length > 1) {
    const where = matches.map((m) => `${m.artboard.name}/${m.root.node.name}`).join(', ');
    throw new XdError(
      'AmbiguousTarget',
      `"${selector}" matches several nodes: ${where}. Pass --artboard to pick one.`,
    );
  }
  return matches[0] as NodeMatch;
}
