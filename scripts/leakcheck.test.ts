import { describe, expect, it } from 'vitest';
import { findLeaks } from './leakcheck-lib.mjs';

const f = (path: string, text: string) => ({ path, text });

describe('findLeaks', () => {
  it('flags an unredacted access_token inside fixtures', () => {
    const leaks = findLeaks([f('fixtures/recorded/a/1.txt', 'x?access_token=abc123&y=1')], []);
    expect(leaks).toEqual([{ path: 'fixtures/recorded/a/1.txt', why: 'unredacted access_token' }]);
  });

  it('accepts access_token=REDACTED', () => {
    expect(findLeaks([f('fixtures/recorded/a/1.txt', 'x?access_token=REDACTED&y=1')], [])).toEqual([]);
  });

  it('flags the raw CDN host inside fixtures but not in source files', () => {
    const text = 'https://cdn-sharing.adobecc.com/content';
    expect(findLeaks([f('fixtures/a.json', text)], [])).toHaveLength(1);
    expect(findLeaks([f('packages/sources/src/share-link.ts', text)], [])).toEqual([]);
  });

  it('flags denylist terms anywhere without echoing the term', () => {
    const leaks = findLeaks([f('docs/readme.md', 'see secret-id-42')], ['secret-id-42']);
    expect(leaks).toEqual([{ path: 'docs/readme.md', why: 'denylist match' }]);
  });

  it('ignores blank denylist entries', () => {
    expect(findLeaks([f('a.txt', 'anything')], ['', '  '])).toEqual([]);
  });
});
