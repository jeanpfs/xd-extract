import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  EXIT_VALIDATION_FAILED,
  type Finding,
  readViewBox,
  validateSameFrame,
  validateSvg,
  type Warning,
  XdError,
} from '@xd-extract/core';
import type { Io } from '../io';

interface Sidecar {
  warnings?: Warning[];
  rule?: 'plate' | 'content';
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    throw new XdError('Usage', `cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function readSidecar(file: string): Sidecar | undefined {
  let raw: string;
  try {
    raw = readFileSync(`${file}.report.json`, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw) as Sidecar;
  } catch {
    throw new XdError('Usage', `${file}.report.json is not valid JSON`);
  }
}

export async function validateCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { 'expect-same-frame': { type: 'boolean' }, json: { type: 'boolean' } },
  });
  if (!positionals.length) throw new XdError('Usage', 'validate needs at least one .svg file');

  const findings: Finding[] = [];
  const views: { file: string; viewBox: string }[] = [];
  for (const file of positionals) {
    const svg = readText(file);
    const sidecar = readSidecar(file);
    findings.push(
      ...validateSvg(svg, { warnings: sidecar?.warnings, rule: sidecar?.rule }).map((f) => ({ ...f, file })),
    );
    views.push({ file, viewBox: readViewBox(svg) });
  }
  if (values['expect-same-frame']) findings.push(...validateSameFrame(views));

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.length - errors;
  if (values.json) {
    io.out(`${JSON.stringify({ files: positionals.length, errors, warnings: warns, findings }, null, 2)}\n`);
  } else {
    for (const f of findings) io.out(`${f.file}: ${f.severity} ${f.code}: ${f.message}\n`);
    io.out(`${positionals.length} file(s): ${errors} error(s), ${warns} warning(s)\n`);
  }
  return errors ? EXIT_VALIDATION_FAILED : 0;
}
