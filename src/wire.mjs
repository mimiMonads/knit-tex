// Compact payloads for the knitting boundary.
//
// knitting sends plain objects and arrays as JSON. Positioned segments are
// most of a set paragraph (122k of them for Pride and Prejudice) and cross
// twice: worker -> layout, then layout -> render worker. Layout never looks
// inside them, so they travel in an Envelope: numbers as raw float64 in the
// binary body (exact, no formatting or parsing) and the segments' byte
// strings back to back in the header string.
//
// A packed block of segments is [count, text length, then per segment:
// dx, size, rise, font index, byte count]. On the host, unpackSet keeps each
// line's block as { nums, text } for packPage to copy into a page.
import { Envelope } from "knitting";
import { FONT_NAMES } from "./fonts.mjs";

const FONTS = Object.keys(FONT_NAMES);
const FONT_INDEX = new Map(FONTS.map((k, i) => [k, i]));
const SEG = 5;
const HEAD = 8; // line count, has label, label width, then the 5 stats

const blockSize = (segs) => 2 + SEG * segs.length;

/** Write one block at nums[at]; returns its text. */
function writeBlock(segs, nums, start) {
  let text = "";
  let at = start + 2;
  for (const [dx, f, s, bytes, r] of segs) {
    const font = FONT_INDEX.get(f);
    if (font === undefined) throw new TypeError(`unknown font key "${f}"`);
    nums[at] = dx;
    nums[at + 1] = s;
    nums[at + 2] = r ?? 0;
    nums[at + 3] = font;
    nums[at + 4] = bytes.length;
    at += SEG;
    text += bytes;
  }
  nums[start] = segs.length;
  nums[start + 1] = text.length;
  return text;
}

/** [[dx, f, s, bytes, rise]] -> { nums, text } */
function packSegs(segs) {
  const nums = new Float64Array(blockSize(segs));
  return { nums, text: writeBlock(segs, nums, 0) };
}

/** Worker side: a setParagraph() result -> Envelope. */
export function packSet({ lines, label, stats }) {
  const blocks = lines.map((l) => l.segs);
  if (label !== null) blocks.unshift(label.segs);
  let size = HEAD + lines.length;
  for (const segs of blocks) size += blockSize(segs);
  const nums = new Float64Array(size);
  nums[0] = lines.length;
  nums[1] = label === null ? 0 : 1;
  nums[2] = label === null ? 0 : label.w;
  nums.set([stats.lines, stats.hyphens, stats.overfull, stats.pass, stats.missing], 3);
  lines.forEach((l, i) => (nums[HEAD + i] = l.x));
  let at = HEAD + lines.length;
  let text = "";
  for (const segs of blocks) {
    text += writeBlock(segs, nums, at);
    at += blockSize(segs);
  }
  return new Envelope(text, nums.buffer);
}

/** Host side: the setParagraph() shape, with each line's segs left packed. */
export function unpackSet(envelope) {
  if (!(envelope instanceof Envelope)) throw new TypeError(`malformed paragraph result: ${Object.prototype.toString.call(envelope)}`);
  const text = envelope.header;
  const nums = new Float64Array(envelope.payload);
  const n = nums[0];
  let at = HEAD + n;
  let t = 0;
  const take = () => {
    const end = at + 2 + SEG * nums[at];
    const len = nums[at + 1];
    const segs = { nums: nums.subarray(at, end), text: text.slice(t, t + len) };
    at = end;
    t += len;
    return segs;
  };
  const label = nums[1] === 1 ? { w: nums[2], segs: take() } : null;
  const lines = [];
  for (let i = 0; i < n; i++) lines.push({ x: nums[HEAD + i], segs: take() });
  if (at !== nums.length || t !== text.length) throw new TypeError("malformed paragraph result: trailing data");
  return { lines, label, stats: { lines: nums[3], hyphens: nums[4], overfull: nums[5], pass: nums[6], missing: nums[7] } };
}

/** Host side: a buildPages() page -> Envelope. Layout-made segs are still arrays. */
export function packPage(page) {
  const blocks = page.lines.map(([, , segs]) => (Array.isArray(segs) ? packSegs(segs) : segs));
  let size = 1;
  for (const b of blocks) size += 2 + b.nums.length;
  const nums = new Float64Array(size);
  nums[0] = blocks.length;
  let at = 1;
  let text = "";
  page.lines.forEach(([x, y], i) => {
    nums[at] = x;
    nums[at + 1] = y;
    nums.set(blocks[i].nums, at + 2);
    at += 2 + blocks[i].nums.length;
    text += blocks[i].text;
  });
  return new Envelope({ text, rules: page.rules ?? [] }, nums.buffer);
}

/** The block at nums[at], whose bytes start at text[t], as [[dx, f, s, bytes, rise]]. */
function readBlock(nums, at, text, t) {
  const segs = new Array(nums[at]);
  at += 2;
  for (let k = 0; k < segs.length; k++, at += SEG) {
    const len = nums[at + 4];
    segs[k] = [nums[at], FONTS[nums[at + 3]], nums[at + 1], text.slice(t, t + len), nums[at + 2]];
    t += len;
  }
  return segs;
}

/** Segs from unpackSet() as [[dx, f, s, bytes, rise]]; arrays pass through. */
export const segsOf = (segs) => (Array.isArray(segs) ? segs : readBlock(segs.nums, 0, segs.text, 0));

/** Worker side: Envelope -> the page shape renderPageStream() takes. */
export function unpackPage({ header: { text, rules }, payload }) {
  const nums = new Float64Array(payload);
  const lines = [];
  let at = 1;
  let t = 0;
  for (let i = 0; i < nums[0]; i++) {
    const segs = readBlock(nums, at + 2, text, t);
    lines.push([nums[at], nums[at + 1], segs]);
    t += nums[at + 3];
    at += 4 + SEG * segs.length;
  }
  return { lines, rules };
}
