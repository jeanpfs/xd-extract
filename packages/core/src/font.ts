const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  roman: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  heavy: 800,
  black: 900,
};

/** "Bold Italic" -> 700 + italic. undefined weight: a style name we do not know. */
export function fontStyleOf(style: string | undefined): { weight: number | undefined; italic: boolean } {
  const s = (style ?? 'Regular').toLowerCase();
  const italic = /italic|oblique/.test(s);
  const base = s.replace(/italic|oblique/g, '').replace(/[\s_-]+/g, '');
  return { weight: base === '' ? 400 : FONT_WEIGHTS[base], italic };
}

const GENERIC_MONO = /mono|courier|consolas|menlo|monaco|code/i;
const GENERIC_SERIF =
  /(?<!sans[ -]?)(serif|times|georgia|garamond|palatino|playfair|merriweather|lora|baskerville|didot|bodoni|cambria)/i;

export const genericFamily = (family: string): string =>
  GENERIC_MONO.test(family)
    ? 'monospace'
    : /sans/i.test(family)
      ? 'sans-serif'
      : GENERIC_SERIF.test(family)
        ? 'serif'
        : 'sans-serif';

/** Family names with spaces or punctuation must be quoted in a CSS font-family list. */
export const quoteFamily = (f: string): string =>
  /^[A-Za-z0-9_-]+$/.test(f) ? f : `'${f.replace(/['"\\]/g, '')}'`;
