/**
 * Advance widths of Helvetica (the Adobe core-14 metrics; Arial is metric-compatible), in 1/1000 em, for
 * ASCII 32..126. XD stores no width for left-aligned text and the font is not embedded, so the width of a
 * line is an estimate: the shape of a typical sans-serif, not of the font that will draw it.
 */
const HELVETICA = [
  278,
  278,
  355,
  556,
  556,
  889,
  667,
  191,
  333,
  333,
  389,
  584,
  278,
  333,
  278,
  278, // space ! " # $ % & ' ( ) * + , - . /
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556, // 0-9
  278,
  278,
  584,
  584,
  584,
  556,
  1015, // : ; < = > ? @
  667,
  667,
  722,
  722,
  667,
  611,
  778,
  722,
  278,
  500,
  667,
  556,
  833,
  722,
  778,
  667,
  778,
  722,
  667,
  611,
  722,
  667,
  944,
  667,
  667,
  611, // A-Z
  278,
  278,
  278,
  469,
  556,
  333, // [ \ ] ^ _ `
  556,
  556,
  500,
  556,
  556,
  278,
  556,
  556,
  222,
  222,
  500,
  222,
  833,
  556,
  556,
  556,
  556,
  333,
  500,
  278,
  556,
  500,
  722,
  500,
  500,
  500, // a-z
  334,
  260,
  334,
  584, // { | } ~
];

/** A bold face is about this much wider than the regular one (Helvetica-Bold against Helvetica). */
const BOLD = 1.06;
const OTHER = 600;
const WIDE = 1000;

function advance(cp: number): number {
  if (cp >= 32 && cp <= 126) return HELVETICA[cp - 32] as number;
  // CJK, kana, hangul, full-width forms: one em each
  if ((cp >= 0x2e80 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef))
    return WIDE;
  return OTHER;
}

/** The estimated width of one line of text, in the units of `size`; `letterSpacing` follows every character. */
export function estimateWidth(text: string, size: number, weight: number, letterSpacing: number): number {
  let sum = 0;
  let n = 0;
  for (const ch of text) {
    sum += advance(ch.codePointAt(0) as number);
    n++;
  }
  const bold = weight >= 600 ? BOLD : 1;
  return (sum / 1000) * size * bold + n * letterSpacing;
}
