import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FIXTURES } from './fixtures.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

mkdirSync('fixtures/.cache', { recursive: true });
for (const f of FIXTURES) {
  const path = `fixtures/.cache/${f.file}`;
  if (existsSync(path) && sha(readFileSync(path)) === f.sha256) {
    console.log(`ok (cached)  ${f.file}`);
    continue;
  }
  const res = await fetch(f.url);
  if (!res.ok) {
    console.error(`${f.file}: HTTP ${res.status}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha(bytes);
  if (got !== f.sha256) {
    console.error(`${f.file}: checksum mismatch (got ${got})`);
    process.exit(1);
  }
  writeFileSync(path, bytes);
  console.log(`fetched      ${f.file}`);
}
