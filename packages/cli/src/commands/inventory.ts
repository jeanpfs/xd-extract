import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  convertRoot,
  findEntries,
  type InventoryEntry,
  inventory,
  type PreviewItem,
  parseDocument,
  renderPreview,
  selectArtboards,
  XdError,
} from '@xd-extract/core';
import type { Io } from '../io';
import { openSource } from '../source';

const PREVIEW_LIMIT = 60;

const bbox = (e: InventoryEntry) => (e.bbox ? `${e.bbox.x},${e.bbox.y} ${e.bbox.w}x${e.bbox.h}` : '-');

export async function inventoryCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      artboard: { type: 'string' },
      find: { type: 'string' },
      json: { type: 'boolean' },
      preview: { type: 'string' },
      browser: { type: 'boolean' },
      record: { type: 'string' },
    },
  });
  const doc = await openSource(positionals[0], values);
  let parsed = parseDocument(doc);
  if (values.artboard !== undefined) {
    parsed = selectArtboards(parsed, values.artboard);
    if (!parsed.length) {
      throw new XdError(
        'TargetNotFound',
        `artboard not found: "${values.artboard}". Available: ${doc.artboards.map((a) => a.name).join(', ')}`,
      );
    }
  }
  const all = inventory(parsed);
  const shown = values.find !== undefined ? findEntries(all, values.find) : all;

  if (values.json) {
    io.out(`${JSON.stringify(shown, null, 2)}\n`);
  } else if (!shown.length) {
    io.out('no matches\n');
  } else {
    io.out('artboard | node | kind | bbox | colour | shapes | warnings\n');
    for (const e of shown) {
      io.out(
        `${e.artboard} | ${e.name} | ${e.kind} | ${bbox(e)} | ${e.dominantColor ?? '-'} | ${e.shapes} | ${e.warnings.join(',') || '-'}\n`,
      );
    }
  }

  if (values.preview) {
    const keep = new Set(shown);
    const pairs = parsed.flatMap((a) => a.roots.map((r) => ({ a, r })));
    const items: PreviewItem[] = [];
    pairs.forEach(({ a, r }, i) => {
      if (!keep.has(all[i] as InventoryEntry) || items.length >= PREVIEW_LIMIT) return;
      try {
        const { svg, report } = convertRoot(a.name, r, doc.source);
        const f = report.frame;
        items.push({ file: `${a.name} / ${r.node.name}`, viewBox: `${f.x} ${f.y} ${f.w} ${f.h}`, svg });
      } catch (e) {
        if (!(e instanceof XdError && e.code === 'NoPaintedGeometry')) throw e;
      }
    });
    writeFileSync(values.preview, renderPreview(items));
    const cut = shown.length > PREVIEW_LIMIT ? `, first ${PREVIEW_LIMIT} of ${shown.length}` : '';
    io.out(`preview: ${values.preview} (${items.length} items${cut})\n`);
  }
  return 0;
}
