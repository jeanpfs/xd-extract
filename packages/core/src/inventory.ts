import { colorDistance, parseColor } from './color';
import type { ParsedArtboard } from './document';
import { collectPaintFacts } from './frame';
import { round } from './matrix';

export interface InventoryEntry {
  artboard: string;
  artboardId: string;
  name: string;
  id: string;
  kind: 'group' | 'shape';
  bbox: { x: number; y: number; w: number; h: number } | null;
  dominantColor: string | null;
  shapes: number;
  warnings: string[];
}

export function inventory(artboards: ParsedArtboard[]): InventoryEntry[] {
  return artboards.flatMap((a) =>
    a.roots.map((r) => {
      const facts = collectPaintFacts(r.node);
      let dominantColor: string | null = null;
      let best = -1;
      for (const [css, area] of facts.fills) {
        if (area > best) {
          best = area;
          dominantColor = css;
        }
      }
      const c = facts.content;
      return {
        artboard: a.name,
        artboardId: a.id,
        name: r.node.name,
        id: r.node.id,
        kind: r.node.kind,
        bbox: c ? { x: round(c.x0), y: round(c.y0), w: round(c.x1 - c.x0), h: round(c.y1 - c.y0) } : null,
        dominantColor,
        shapes: facts.shapes,
        warnings: r.warnings.map((w) => w.code),
      };
    }),
  );
}

const COLOUR_TOLERANCE = 60;

/** A query that parses as a colour searches by dominant fill (closest first); anything else by name. */
export function findEntries(entries: InventoryEntry[], query: string): InventoryEntry[] {
  const wanted = parseColor(query);
  if (wanted) {
    return entries
      .map((e) => {
        const c = e.dominantColor ? parseColor(e.dominantColor) : null;
        return { e, d: c ? colorDistance(wanted, c) : Number.POSITIVE_INFINITY };
      })
      .filter((x) => x.d <= COLOUR_TOLERANCE)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }
  const q = query.toLowerCase();
  return entries.filter((e) => e.name.toLowerCase().includes(q));
}
