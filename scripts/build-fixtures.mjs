// Redacts every cached upstream file into fixtures/public/<name>/document.json. Needs `pnpm build` first.
import { spawnSync } from 'node:child_process';
import { FIXTURES } from './fixtures.mjs';

for (const f of FIXTURES) {
  const args = [
    'packages/cli/dist/bin.js',
    'redact',
    `fixtures/.cache/${f.file}`,
    '-o',
    `fixtures/public/${f.name}`,
  ];
  for (const name of f.exclude) args.push('--exclude', name);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
