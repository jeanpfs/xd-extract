import { describe, expect, it } from 'vitest';
import { checkMarketplace, checkSkill } from './check-skills-lib.mjs';

const skill = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: "${description}"\n---\n\n# Body\n`;

describe('checkSkill', () => {
  it('accepts a valid skill', () => {
    expect(checkSkill('xd-inventory', skill('xd-inventory', 'Does a thing. Use when asked.'))).toEqual([]);
  });

  it('requires frontmatter', () => {
    expect(checkSkill('a', '# no frontmatter')).toEqual(['missing frontmatter']);
  });

  it('requires name to equal the directory and follow the naming rules', () => {
    expect(checkSkill('dir', skill('other', 'd'))).toContain('name "other" must equal the directory "dir"');
    expect(checkSkill('Bad_Name', skill('Bad_Name', 'd')).join()).toContain('lowercase');
    expect(checkSkill('a--b', skill('a--b', 'd')).join()).toContain('lowercase');
    expect(checkSkill('-a', skill('-a', 'd')).join()).toContain('lowercase');
    const long = 'a'.repeat(65);
    expect(checkSkill(long, skill(long, 'd')).join()).toContain('64');
  });

  it('requires a description of 1 to 1024 characters', () => {
    expect(checkSkill('a', '---\nname: a\n---\n')).toContain('missing description');
    expect(checkSkill('a', skill('a', 'x'.repeat(1025))).join()).toContain('1024');
  });
});

describe('checkMarketplace', () => {
  const marketplace = {
    name: 'xd-extract',
    owner: { name: 'someone' },
    plugins: [{ name: 'xd-extract', source: './', description: 'd' }],
  };
  const plugin = { name: 'xd-extract', version: '0.1.0' };

  it('accepts a valid pair', () => {
    expect(checkMarketplace(marketplace, plugin)).toEqual([]);
  });

  it('flags missing owner, empty plugins and name mismatch', () => {
    expect(checkMarketplace({ ...marketplace, owner: {} }, plugin).join()).toContain('owner.name');
    expect(checkMarketplace({ ...marketplace, plugins: [] }, plugin).join()).toContain('plugins');
    expect(checkMarketplace(marketplace, { ...plugin, name: 'other' }).join()).toContain('must equal');
  });

  it('rejects a relative source containing ..', () => {
    const bad = { ...marketplace, plugins: [{ name: 'xd-extract', source: '../x' }] };
    expect(checkMarketplace(bad, plugin).join()).toContain('..');
  });
});
