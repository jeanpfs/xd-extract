const FIXTURE_RULES = [
  { re: /access_token=(?!REDACTED)[^&\s"'<>]+/, why: 'unredacted access_token' },
  { re: /cdn-sharing\.adobecc\.com/, why: 'raw CDN host (use the {CDN} placeholder)' },
];

/**
 * @param {{ path: string, text: string }[]} files
 * @param {string[]} denylist literal terms that must appear nowhere in the repo
 * @returns {{ path: string, why: string }[]}
 */
export function findLeaks(files, denylist) {
  const terms = denylist.map((t) => t.trim()).filter(Boolean);
  const leaks = [];
  for (const { path, text } of files) {
    if (path.startsWith('fixtures/')) {
      for (const { re, why } of FIXTURE_RULES) if (re.test(text)) leaks.push({ path, why });
    }
    // Never echo the term itself: logs and CI output are public.
    if (terms.some((t) => text.includes(t))) leaks.push({ path, why: 'denylist match' });
  }
  return leaks;
}
