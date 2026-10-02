import { EXIT_CODES, EXIT_UNEXPECTED, XdError } from '@xd-extract/core';
import { extractCommand } from './commands/extract';
import { inventoryCommand } from './commands/inventory';
import { redactCommand } from './commands/redact';
import { validateCommand } from './commands/validate';
import type { Io } from './io';

export const USAGE = `xd - extract SVG from Adobe XD

Usage:
  xd inventory <source> [--artboard <name|id>] [--find <name|colour>] [--json] [--preview <file.html>]
  xd extract   <source> --node <name|id:ID> [--artboard <name|id>] -o <file.svg>
  xd extract   <source> --map <map.json> [-d <dir>]
  xd validate  <file.svg...> [--expect-same-frame] [--json]
  xd redact    <source> -o <dir>

<source> is an https://xd.adobe.com/view/... share link, a .xd file, or a document.json from "xd redact".
Share-link flags: --browser (find the manifest with agent-browser), --record <dir> (save HTTP responses with tokens
stripped; the files contain the full design, do not commit them).
`;

export async function run(argv: string[], io: Io): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'inventory':
        return await inventoryCommand(rest, io);
      case 'extract':
        return await extractCommand(rest, io);
      case 'validate':
        return await validateCommand(rest, io);
      case 'redact':
        return await redactCommand(rest, io);
      case '-h':
      case '--help':
      case 'help':
        io.out(USAGE);
        return 0;
      case undefined:
        io.err(USAGE);
        return EXIT_CODES.Usage;
      default:
        io.err(`unknown command: ${cmd}\n${USAGE}`);
        return EXIT_CODES.Usage;
    }
  } catch (e) {
    if (e instanceof XdError) {
      io.err(`${e.code}: ${e.message}\n`);
      return EXIT_CODES[e.code];
    }
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')) {
      io.err(`${(e as Error).message}\n${USAGE}`);
      return EXIT_CODES.Usage;
    }
    io.err(`unexpected error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    return EXIT_UNEXPECTED;
  }
}
