const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const unquote = (s) => {
  const t = (s ?? '').trim();
  return /^(".*"|'.*')$/s.test(t) ? t.slice(1, -1) : t;
};

/** @returns {string[]} problems, empty when the skill is valid */
export function checkSkill(dirName, text) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return ['missing frontmatter'];
  const problems = [];
  const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();
  const description = unquote(/^description:\s*(.+)$/m.exec(fm[1])?.[1]);
  if (!name) problems.push('missing name');
  else {
    if (name.length > 64) problems.push(`name is longer than 64 characters (${name.length})`);
    if (!NAME.test(name))
      problems.push(
        `name "${name}" must be lowercase letters, digits and single hyphens, not starting or ending with a hyphen`,
      );
    if (name !== dirName) problems.push(`name "${name}" must equal the directory "${dirName}"`);
  }
  if (!description) problems.push('missing description');
  else if (description.length > 1024)
    problems.push(`description is longer than 1024 characters (${description.length})`);
  return problems;
}

/** @returns {string[]} problems, empty when the marketplace and plugin manifests are consistent */
export function checkMarketplace(marketplace, plugin) {
  const problems = [];
  const m = marketplace ?? {};
  if (!m.name) problems.push('marketplace.name is required');
  if (!m.owner?.name) problems.push('marketplace.owner.name is required');
  if (!Array.isArray(m.plugins) || m.plugins.length === 0)
    problems.push('marketplace.plugins must list at least one plugin');
  for (const p of m.plugins ?? []) {
    if (!p.name) problems.push('a plugin entry has no name');
    if (typeof p.source === 'string' && p.source.includes('..'))
      problems.push(`plugin "${p.name}": relative source must not contain ".."`);
    if (plugin?.name && p.name && p.name !== plugin.name) {
      problems.push(`plugin entry name "${p.name}" must equal the plugin manifest name "${plugin.name}"`);
    }
  }
  return problems;
}
