import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { checkMarketplace, checkSkill } from './check-skills-lib.mjs';

const problems = [];
const dirs = existsSync('skills')
  ? readdirSync('skills', { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];
if (!dirs.length) problems.push('skills/: no skills found');
for (const d of dirs) {
  const file = `skills/${d.name}/SKILL.md`;
  if (!existsSync(file)) problems.push(`${file}: missing`);
  else for (const p of checkSkill(d.name, readFileSync(file, 'utf8'))) problems.push(`${file}: ${p}`);
}

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined);
const marketplace = read('.claude-plugin/marketplace.json');
const plugin = read('.claude-plugin/plugin.json');
if (!marketplace) problems.push('.claude-plugin/marketplace.json: missing');
if (!plugin) problems.push('.claude-plugin/plugin.json: missing');
if (marketplace) for (const p of checkMarketplace(marketplace, plugin)) problems.push(`.claude-plugin: ${p}`);

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`skills:check ok (${dirs.length} skills)`);
