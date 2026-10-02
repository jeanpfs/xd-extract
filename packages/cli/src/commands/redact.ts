import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { redactDocument, XdError } from '@xd-extract/core';
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
    },
  });
  if (!values.out) throw new XdError('Usage', 'redact needs -o <dir>');
  const doc = await openSource(positionals[0], values);
  const red = redactDocument(doc);
  mkdirSync(values.out, { recursive: true });
  const file = join(values.out, 'document.json');
  writeFileSync(file, JSON.stringify(red));
  io.out(`wrote ${file} (${red.artboards.length} artboards)\n`);
  io.out(
    'Names, ids, text and fonts are removed; geometry is kept. Confirm the artwork itself is publishable before committing.\n',
  );
  return 0;
}
