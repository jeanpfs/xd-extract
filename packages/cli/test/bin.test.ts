import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agcDoc, buildManifest, group, rect, solid } from '@xd-extract/testkit';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Needs `pnpm build` (CI builds before testing). Without a build there is no binary to run.
const bin = join(import.meta.dirname, '../dist/bin.js');

describe.skipIf(!existsSync(bin))('built binary', () => {
  let dir: string;
  let xd: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'xd-bin-'));
    xd = join(dir, 'big.xd');
    const roots = Array.from({ length: 600 }, (_, i) =>
      group(`Node ${i}`, [rect('r', 0, 0, 10, 10, { fill: solid(1, 2, 3) })]),
    );
    const j = (v: unknown) => strToU8(JSON.stringify(v));
    writeFileSync(
      xd,
      zipSync({
        mimetype: [strToU8('application/vnd.adobe.sparkler.project+dcxucf'), { level: 0 }],
        manifest: j(buildManifest([{ id: 'a1', name: 'Home' }])),
        'artwork/pasteboard/graphics/graphicContent.agc': j({ version: '1.5.0', children: [] }),
        'artwork/artboard-a1/graphics/graphicContent.agc': j(agcDoc(roots)),
      }),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('exits quietly, with no stack trace, when the reader closes the pipe early (xd ... | head)', () => {
    const stderr = join(dir, 'stderr.txt');
    const r = spawnSync('bash', [
      '-o',
      'pipefail',
      '-c',
      `node "${bin}" inventory "${xd}" 2>"${stderr}" | head -c 10 >/dev/null`,
    ]);
    expect(readFileSync(stderr, 'utf8')).toBe('');
    expect(r.status).toBe(0);
  });
});
