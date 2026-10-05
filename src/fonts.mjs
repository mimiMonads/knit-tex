// Base-14 font metrics (AFM widths + kerning) and text encoding.
//
// Text is carried as "byte strings": JS strings whose char codes are the
// font's single-byte codes (WinAnsi for Times/Courier, the built-in encoding
// for Symbol). Byte strings are JSON-safe, so they cross the worker boundary
// as plain strings.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Font, Encodings } = require("@pdf-lib/standard-fonts");

export const FONT_NAMES = Object.freeze({
  R: "Times-Roman",
  I: "Times-Italic",
  B: "Times-Bold",
  BI: "Times-BoldItalic",
  T: "Courier",
  S: "Symbol",
});

class Metrics {
  constructor(key) {
    const name = FONT_NAMES[key];
    if (name === undefined) throw new Error(`unknown font key "${key}"`);
    const font = Font.load(name);
    const encoding = key === "S" ? Encodings.Symbol : Encodings.WinAnsi;
    this.key = key;
    this.name = name;
    this.widths = new Float64Array(256); // 1/1000 em, indexed by byte code
    this.defined = new Uint8Array(256); // 1 when the code has a glyph in this font
    const codesByGlyph = new Map();
    for (const cp of encoding.supportedCodePoints) {
      const [code, glyph] = encoding.unicodeMappings[cp];
      const width = font.getWidthOfGlyph(glyph);
      if (typeof width !== "number") continue;
      this.widths[code] = width;
      this.defined[code] = 1;
      let codes = codesByGlyph.get(glyph);
      if (codes === undefined) codesByGlyph.set(glyph, (codes = []));
      if (!codes.includes(code)) codes.push(code);
    }
    this.kern = new Int16Array(65536); // (left << 8) | right -> 1/1000 em
    for (const [left, right, amount] of font.KernPairs) {
      const ls = codesByGlyph.get(left);
      const rs = codesByGlyph.get(right);
      if (ls === undefined || rs === undefined) continue;
      for (const l of ls) for (const r of rs) this.kern[(l << 8) | r] = amount;
    }
  }

  /** Width of a byte string in 1/1000 em, kerning included. */
  measure(bytes) {
    let width = 0;
    let prev = -1;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes.charCodeAt(i);
      width += this.widths[c];
      if (prev >= 0) width += this.kern[(prev << 8) | c];
      prev = c;
    }
    return width;
  }

  kernPair(leftCode, rightCode) {
    return this.kern[(leftCode << 8) | rightCode];
  }
}

const metricsCache = new Map();
export function metrics(key) {
  let m = metricsCache.get(key);
  if (m === undefined) metricsCache.set(key, (m = new Metrics(key)));
  return m;
}

// Unicode -> byte code lookups. Built once per process (host and each worker).
const winAnsi = new Map();
for (const cp of Encodings.WinAnsi.supportedCodePoints) winAnsi.set(cp, Encodings.WinAnsi.unicodeMappings[cp][0]);
const symbol = new Map();
for (const cp of Encodings.Symbol.supportedCodePoints) symbol.set(cp, Encodings.Symbol.unicodeMappings[cp][0]);

// Characters neither encoding has, mapped to something printable.
const FALLBACK = new Map([
  [0x2009, " "], [0x200a, " "], [0x2002, " "], [0x2003, " "], [0x202f, " "], [0x2007, " "],
  [0x200b, ""], [0x200c, ""], [0x200d, ""], [0xfeff, ""], [0x00ad, ""],
  [0x2010, "-"], [0x2011, "-"], [0x2012, "–"], [0x2015, "—"],
  [0x2032, "'"], [0x2033, "''"], [0x2039, "<"], [0x203a, ">"],
  [0x2264, "<="], [0x2265, ">="], [0x22ef, "…"], [0x2026, "..."],
  [0x0131, "i"], [0x0237, "j"], [0x0141, "L"], [0x0142, "l"],
  // math symbols Symbol lacks: closest readable stand-ins
  [0x2213, "\u2212+"], [0x2218, "\u00b0"], [0x226a, "<<"], [0x226b, ">>"], [0x22ee, ":"], [0x22f1, "\u2026"],
  [0x210f, "h"], [0x222e, "\u222b"], [0x230a, "["], [0x230b, "]"], [0x2308, "["], [0x2309, "]"],
  [0x3008, "\u2329"], [0x3009, "\u232a"], [0x2016, "||"], [0x2225, "||"],
]);

/**
 * Encode text for a font family key. Returns chunks [{ f, t }] where f is the
 * key actually used ("S" for characters only Symbol has) and t is a byte string.
 * `stats.missing` counts characters that had to be replaced with "?".
 */
export function encode(text, key, stats) {
  const out = [];
  let curKey = null;
  let cur = "";
  const push = (k, byte) => {
    if (k !== curKey) {
      if (cur.length > 0) out.push({ f: curKey, t: cur });
      curKey = k;
      cur = "";
    }
    cur += String.fromCharCode(byte);
  };
  const main = metrics(key);
  const encodeChar = (cp, depth) => {
    const code = winAnsi.get(cp);
    if (code !== undefined && main.defined[code] === 1) return push(key, code);
    const sym = symbol.get(cp);
    if (sym !== undefined && key !== "T") return push("S", sym);
    if (depth < 2) {
      const repl = FALLBACK.get(cp);
      if (repl !== undefined) {
        for (const ch of repl) encodeChar(ch.codePointAt(0), depth + 1);
        return;
      }
      // Strip diacritics the encoding can't express: "ő" -> "o".
      const decomposed = String.fromCodePoint(cp).normalize("NFKD").replace(/[̀-ͯ]/g, "");
      if (decomposed.length > 0 && decomposed !== String.fromCodePoint(cp)) {
        for (const ch of decomposed) encodeChar(ch.codePointAt(0), depth + 1);
        return;
      }
    }
    if (stats) stats.missing = (stats.missing ?? 0) + 1;
    push(key, 0x3f); // "?"
  };
  for (const ch of text.normalize("NFC")) encodeChar(ch.codePointAt(0), 0);
  if (cur.length > 0) out.push({ f: curKey, t: cur });
  return out;
}

export const WINANSI_SPACE = 0x20;
export const WINANSI_HYPHEN = 0x2d;
