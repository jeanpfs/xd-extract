import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { findLeaks } from './leakcheck-lib.mjs';

const BINARY = /\.(png|jpe?g|gif|ico|xd|zip)$/i;
const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

const files = listed
  .filter((p) => !BINARY.test(p) && existsSync(p) && statSync(p).size < 5_000_000)
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

const denylist = existsSync('.leakcheck') ? readFileSync('.leakcheck', 'utf8').split('\n') : [];
const leaks = findLeaks(files, denylist);

if (leaks.length) {
  for (const l of leaks) console.error(`leak: ${l.path}: ${l.why}`);
  process.exit(1);
}
console.log(
  `leakcheck ok (${files.length} files, ${denylist.filter((t) => t.trim()).length} denylist terms)`,
);
