import { describe, expect, it } from 'vitest';
import { renderPreview } from '../src/preview';

describe('renderPreview', () => {
  const html = renderPreview([
    { file: 'cart.svg', viewBox: '0 0 100 100', svg: '<svg viewBox="0 0 100 100"><rect/></svg>' },
    { file: '<b>evil</b>.svg', viewBox: '0 0 10 10', svg: '<svg viewBox="0 0 10 10"><rect/></svg>' },
  ]);

  it('inlines every SVG and captions it with file name and viewBox', () => {
    expect(html).toContain('<svg viewBox="0 0 100 100"><rect/></svg>');
    expect(html).toContain('cart.svg');
    expect(html).toContain('viewBox 0 0 100 100');
  });

  it('escapes captions', () => {
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;.svg');
    expect(html).not.toContain('<b>evil</b>');
  });

  it('is a complete HTML document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});
