import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { convertRoot, parseDocument, type Report, resolveNode, XdError } from '@xd-extract/core';
import type { Io } from '../io';
import { openSource } from '../source';

interface Job {
  file: string;
  node: string;
  artboard?: string;
}

function readMap(path: string): Job[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new XdError('Usage', `cannot read map ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ok =
    Array.isArray(raw) &&
    raw.every(
      (j) =>
        j &&
        typeof j === 'object' &&
        typeof (j as Job).file === 'string' &&
        typeof (j as Job).node === 'string',
    );
  if (!ok)
    throw new XdError(
      'Usage',
      'map.json must be an array of {"file": "...", "node": "...", "artboard"?: "..."}',
    );
  return raw as Job[];
}

export async function extractCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      node: { type: 'string' },
      artboard: { type: 'string' },
      out: { type: 'string', short: 'o' },
      map: { type: 'string' },
      dir: { type: 'string', short: 'd' },
      json: { type: 'boolean' },
      browser: { type: 'boolean' },
      record: { type: 'string' },
    },
  });

  let jobs: Job[];
  if (values.map) {
    if (values.node || values.out) throw new XdError('Usage', '--map cannot be combined with --node or -o');
    const dir = values.dir ?? '.';
    jobs = readMap(values.map).map((j) => ({ ...j, file: join(dir, j.file) }));
  } else {
    if (!values.node || !values.out) throw new XdError('Usage', 'extract needs --node and -o, or --map');
    jobs = [{ file: values.out, node: values.node }];
  }

  const doc = await openSource(positionals[0], values);
  const artboards = parseDocument(doc);

  // Resolve and convert every job first so a failing job leaves nothing half-written.
  const done = jobs.map((job) => {
    const match = resolveNode(artboards, job.node, job.artboard ?? values.artboard);
    const { svg, report } = convertRoot(match.artboard.name, match.root, doc.source);
    return { file: job.file, svg, report };
  });
  for (const d of done) {
    mkdirSync(dirname(d.file), { recursive: true });
    writeFileSync(d.file, `${d.svg}\n`);
    writeFileSync(`${d.file}.report.json`, `${JSON.stringify(d.report, null, 2)}\n`);
  }

  if (values.json) {
    io.out(
      `${JSON.stringify(
        done.map((d) => ({ file: d.file, ...d.report })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  for (const d of done) {
    const r: Report = d.report;
    io.out(
      `${d.file}  viewBox="${r.frame.x} ${r.frame.y} ${r.frame.w} ${r.frame.h}" rule=${r.rule} snaps=${r.snaps.length} clips=${r.clips} warnings=${r.warnings.length}\n`,
    );
    for (const s of r.snaps)
      io.out(`  snap: mask "${s.mask}" clip "${s.clip}" moved dx=${s.dx} dy=${s.dy}\n`);
    for (const w of r.warnings) io.out(`  warning ${w.code} (${w.count}x): ${w.message}\n`);
  }
  return 0;
}
