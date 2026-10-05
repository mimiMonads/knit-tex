// Liang hyphenation with TeX's US English patterns (hyphen/en-us), plus TeX's
// \lefthyphenmin=2 and \righthyphenmin=3. Results are memoised per process.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { hyphenateSync } = require("hyphen/en-us");

const LEFT_MIN = 2;
const RIGHT_MIN = 3;
const SOFT = "\u00ad";
const cache = new Map();

const isHyphenatable = (word) =>
  word.length >= LEFT_MIN + RIGHT_MIN && /^\p{L}+$/u.test(word) && word !== word.toUpperCase();

/** Split a word into syllables. Returns [word] when it must not be hyphenated. */
export function syllables(word) {
  let parts = cache.get(word);
  if (parts !== undefined) return parts;
  if (!isHyphenatable(word)) {
    parts = [word];
  } else {
    parts = hyphenateSync(word, { hyphenChar: SOFT, minWordLength: LEFT_MIN + RIGHT_MIN }).split(SOFT);
    if (parts.join("") !== word) throw new Error(`hyphenation changed the word "${word}"`);
    while (parts.length > 1 && parts[0].length < LEFT_MIN) parts.splice(0, 2, parts[0] + parts[1]);
    while (parts.length > 1 && parts[parts.length - 1].length < RIGHT_MIN) {
      const last = parts.pop();
      parts[parts.length - 1] += last;
    }
  }
  if (cache.size >= 100_000) cache.clear();
  cache.set(word, parts);
  return parts;
}
