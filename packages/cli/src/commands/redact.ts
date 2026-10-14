import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { dropRoots, redactDocument, XdError } from '@xd-extract/core';
import type { Io } from '../io';
import { openSource } from '../source';

export async function redactCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      browser: { type: 'boolean' },
      record: { type: 'string' },
      exclude: { type: 'string', multiple: true },
      'keep-images': { type: 'boolean' },
      'drop-image': { type: 'string', multiple: true },
    },
  });
  if (!values.out) throw new XdError('Usage', 'redact needs -o <dir>');
  const source = await openSource(positionals[0], values);
  const { doc, dropped } = dropRoots(source, values.exclude ?? []);
  for (const [name, count] of Object.entries(dropped)) {
    if (count === 0) throw new XdError('Usage', `--exclude "${name}" matched no top-level node`);
  }
  const dropImages = values['drop-image'] ?? [];
  if (dropImages.length && !values['keep-images']) {
    throw new XdError(
      'Usage',
      '--drop-image only applies with --keep-images (pictures are dropped by default)',
    );
  }
  for (const uid of dropImages) {
    if (!(uid in (source.images ?? {}))) throw new XdError('Usage', `--drop-image "${uid}" matched no image`);
  }
  const red = redactDocument(doc, { keepImages: values['keep-images'] === true, dropImages });
  mkdirSync(values.out, { recursive: true });
  const file = join(values.out, 'document.json');
  writeFileSync(file, JSON.stringify(red));
  for (const [name, count] of Object.entries(dropped)) io.out(`excluded "${name}": ${count}\n`);
  io.out(`wrote ${file} (${red.artboards.length} artboards)\n`);
  io.out(
    'Names, ids, text and fonts are removed; geometry is kept. Confirm the artwork itself is publishable before committing.\n',
  );
  if (values['keep-images'] && red.images) {
    io.out(`kept ${Object.keys(red.images).length} image(s): only for pictures you may publish.\n`);
  }
  return 0;
}
