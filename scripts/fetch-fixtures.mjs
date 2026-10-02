import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const COMMIT = '937365e71fe735751053e918b3ba02cfa546ce7a';
const RAW = `https://raw.githubusercontent.com/L2jLiga/xd2svg/${COMMIT}/test/input`;
const FILES = [
  { name: 'single.xd', sha256: 'a664b4938f146a541335e60bf0870e63733d0ba422a8bd9b278eccec89956f19' },
  { name: 'multi.xd', sha256: '75e178bc7984e6e429106bf74db6002fed0ed52ecc5e79c49ae1dfd68cfb8f38' },
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

mkdirSync('fixtures/.cache', { recursive: true });
for (const f of FILES) {
  const path = `fixtures/.cache/${f.name}`;
  if (existsSync(path) && sha(readFileSync(path)) === f.sha256) {
    console.log(`ok (cached)  ${f.name}`);
    continue;
  }
  const res = await fetch(`${RAW}/${f.name}`);
  if (!res.ok) {
    console.error(`${f.name}: HTTP ${res.status}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha(bytes);
  if (got !== f.sha256) {
    console.error(`${f.name}: checksum mismatch (got ${got})`);
    process.exit(1);
  }
  writeFileSync(path, bytes);
  console.log(`fetched      ${f.name}`);
}
