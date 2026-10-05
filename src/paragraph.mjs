// Paragraph setting: styled runs -> boxes/glue/penalties -> optimal lines.
// Runs in a worker; input and output are plain JSON-safe values.
//
// spec  = { runs: [{ t, f, s, r? }], width, indent, align: "j"|"l"|"c"|"r",
//           hyphenate, tag?: [{ t, f, s }], label?: [{ t, f, s, r? }] }
// result = { lines: [{ x, segs: [[dx, f, s, bytes, rise]] }],
//            label: { w, segs } | null, stats }
import { encode, metrics, WINANSI_HYPHEN, WINANSI_SPACE } from "./fonts.mjs";
import { syllables } from "./hyphenate.mjs";
import { BOX, FIL, GLUE, INF, PENALTY, breakGreedy, breakLines, skipDiscardable } from "./knuth-plass.mjs";

const NBSP = "\u00a0";
const HARD_BREAK = "\u2028";
const SOFT_HYPHEN = "\u00ad";
const HFILL = "\ue002";
// \hfill outranks \parfillskip (order fil), as fill glue does in TeX
const FILL = 1e12;
const HYPHEN_PENALTY = 50; // \hyphenpenalty
const EX_HYPHEN_PENALTY = 50; // \exhyphenpenalty
const DASHES = new Set(["-", "–", "—"]);

/** Split runs into word / space / break tokens. A word may span runs. */
function tokenize(runs) {
  const tokens = [];
  let pieces = null;
  const flush = () => {
    if (pieces !== null) tokens.push({ type: "word", pieces });
    pieces = null;
  };
  for (const run of runs) {
    const style = { f: run.f, s: run.s, r: run.r ?? 0 };
    for (const ch of run.t) {
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        flush();
        const prev = tokens[tokens.length - 1];
        if (prev !== undefined && prev.type === "space") continue;
        tokens.push({ type: "space", ...style, nb: false });
      } else if (ch === NBSP) {
        flush();
        tokens.push({ type: "space", ...style, nb: true });
      } else if (ch === HARD_BREAK) {
        flush();
        tokens.push({ type: "break" });
      } else if (ch === HFILL) {
        flush();
        tokens.push({ type: "fill" });
      } else {
        if (pieces === null) pieces = [];
        const lastPiece = pieces[pieces.length - 1];
        if (lastPiece !== undefined && lastPiece.f === style.f && lastPiece.s === style.s && lastPiece.r === style.r) {
          lastPiece.t += ch;
        } else {
          pieces.push({ ...style, t: ch });
        }
      }
    }
  }
  flush();
  // Trim spaces at the paragraph's edges and around hard breaks.
  const out = [];
  for (const tok of tokens) {
    if (tok.type === "space" && !tok.nb && (out.length === 0 || out[out.length - 1].type === "break")) continue;
    if (tok.type === "break") while (out.length > 0 && out[out.length - 1].type === "space" && !out[out.length - 1].nb) out.pop();
    out.push(tok);
  }
  while (out.length > 0 && out[out.length - 1].type === "space" && !out[out.length - 1].nb) out.pop();
  return out;
}

/**
 * Cut a word's pieces into fragments at break opportunities.
 * Fragment: { f, s, r, t, after } with after one of null | "hyphen" | "soft" | "explicit".
 */
function fragmentsOf(pieces, hyphenate) {
  const fragments = [];
  const hasSoft = pieces.some((p) => p.t.includes(SOFT_HYPHEN));
  for (let pi = 0; pi < pieces.length; pi++) {
    const piece = pieces[pi];
    // explicit dashes and soft hyphens split the piece first
    const parts = [];
    let cur = "";
    for (const ch of piece.t) {
      if (ch === SOFT_HYPHEN) {
        parts.push({ t: cur, after: "soft" });
        cur = "";
      } else if (DASHES.has(ch)) {
        cur += ch;
        parts.push({ t: cur, after: "explicit" });
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push({ t: cur, after: null });
    for (const part of parts) {
      if (part.t.length === 0) {
        // "--x" or a trailing soft hyphen: move the break onto the previous fragment
        if (part.after !== null && fragments.length > 0 && fragments[fragments.length - 1].after === null) {
          fragments[fragments.length - 1].after = part.after;
        }
        continue;
      }
      let sylls = [part.t];
      if (hyphenate && !hasSoft && piece.f !== "T") {
        const m = /^(\P{L}*)(\p{L}+)(\P{L}*)$/u.exec(part.t);
        if (m !== null) {
          const core = syllables(m[2]);
          if (core.length > 1) {
            sylls = core.slice();
            sylls[0] = m[1] + sylls[0];
            sylls[sylls.length - 1] += m[3];
          }
        }
      }
      for (let k = 0; k < sylls.length; k++) {
        const isLast = k === sylls.length - 1;
        fragments.push({ f: piece.f, s: piece.s, r: piece.r, t: sylls[k], after: isLast ? part.after : "hyphen" });
      }
    }
  }
  // a dash at the very end of a word is not a break point (a space follows anyway)
  if (fragments.length > 0) fragments[fragments.length - 1].after = null;
  return fragments;
}

function buildItems(spec, hyphenate, stats) {
  const items = [];
  if (spec.indent > 0) items.push({ k: BOX, w: spec.indent, f: "R", s: 10, r: 0, t: "" });
  for (const tok of tokenize(spec.runs)) {
    if (tok.type === "space") {
      const w = (metrics(tok.f === "S" ? "R" : tok.f).widths[WINANSI_SPACE] * tok.s) / 1000;
      if (tok.nb) items.push({ k: PENALTY, w: 0, p: INF, fl: 0, hy: 0 });
      items.push({ k: GLUE, w, y: w / 2, z: w / 3 });
      continue;
    }
    if (tok.type === "fill") {
      // an empty box first keeps the glue at a line start, like \hspace*
      items.push({ k: BOX, w: 0, f: "R", s: 10, r: 0, t: "" });
      items.push({ k: GLUE, w: 0, y: FILL, z: 0 });
      continue;
    }
    if (tok.type === "break") {
      items.push({ k: GLUE, w: 0, y: FIL, z: 0 });
      items.push({ k: PENALTY, w: 0, p: -INF, fl: 0, hy: 0 });
      continue;
    }
    // word: fragments -> encoded boxes, kerning carried across box seams
    const boxes = [];
    for (const frag of fragmentsOf(tok.pieces, hyphenate)) {
      const chunks = encode(frag.t, frag.f, stats);
      for (let c = 0; c < chunks.length; c++) {
        boxes.push({ f: chunks[c].f, s: frag.s, r: frag.r, t: chunks[c].t, after: c === chunks.length - 1 ? frag.after : null });
      }
    }
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      const m = metrics(box.f);
      const next = boxes[b + 1];
      const sameFont = next !== undefined && next.f === box.f && next.s === box.s && next.r === box.r;
      const lastCode = box.t.charCodeAt(box.t.length - 1);
      const seamKern = sameFont && box.t.length > 0 && next.t.length > 0 ? m.kernPair(lastCode, next.t.charCodeAt(0)) : 0;
      items.push({ k: BOX, w: ((m.measure(box.t) + seamKern) * box.s) / 1000, f: box.f, s: box.s, r: box.r, t: box.t });
      if (next === undefined || box.after === null) continue;
      if (box.after === "explicit") {
        items.push({ k: PENALTY, w: (-seamKern * box.s) / 1000, p: EX_HYPHEN_PENALTY, fl: 1, hy: 0 });
      } else {
        // discretionary hyphen: "-" appended in this box's font if we break here
        const hyFont = box.f === "S" ? "R" : box.f;
        const hm = metrics(hyFont);
        const hyKern = hyFont === box.f && box.t.length > 0 ? hm.kernPair(lastCode, WINANSI_HYPHEN) : 0;
        const w = ((hm.widths[WINANSI_HYPHEN] + hyKern - seamKern) * box.s) / 1000;
        items.push({ k: PENALTY, w, p: HYPHEN_PENALTY, fl: 1, hy: box.after === "hyphen" ? 1 : 0, dash: hyFont });
      }
    }
  }
  items.push({ k: GLUE, w: 0, y: FIL, z: 0 });
  items.push({ k: PENALTY, w: 0, p: -INF, fl: 0, hy: 0, end: 1 });
  return items;
}

/** Turn breakpoints into positioned text segments, one array per line. */
function linesFrom(items, breaks, width, align) {
  const lines = [];
  let start = 0;
  for (const { pos, r: rawR } of breaks) {
    start = skipDiscardable(items, start);
    const r = Number.isFinite(rawR) ? Math.max(rawR, -1) : 0;
    const segs = [];
    let x = 0;
    let open = null; // segment that the next box may extend
    for (let i = start; i < pos; i++) {
      const it = items[i];
      if (it.k === BOX) {
        if (it.t.length > 0) {
          if (open !== null && open[1] === it.f && open[2] === it.s && open[4] === it.r) open[3] += it.t;
          else segs.push((open = [x, it.f, it.s, it.t, it.r]));
        } else {
          open = null;
        }
        x += it.w;
      } else if (it.k === GLUE) {
        x += it.w + (r >= 0 ? r * it.y : r * it.z);
        open = null;
      }
    }
    const brk = items[pos];
    if (brk.k === PENALTY && brk.dash !== undefined) {
      const hyphen = String.fromCharCode(WINANSI_HYPHEN);
      if (open !== null && open[1] === brk.dash) open[3] += hyphen;
      else segs.push([x, brk.dash, items[pos - 1]?.s ?? 10, hyphen, 0]);
      x += brk.w;
    }
    let offset = 0;
    if (align === "c") offset = (width - x) / 2;
    else if (align === "r") offset = width - x;
    lines.push({ x: offset, w: x, segs, hyphen: brk.k === PENALTY && brk.dash !== undefined });
    start = pos + 1;
  }
  return lines;
}

function setRuns(spec, stats) {
  const align = spec.align ?? "j";
  if (align !== "j") {
    const items = buildItems(spec, false, stats);
    return { lines: linesFrom(items, breakGreedy(items, spec.width), spec.width, align), pass: 0 };
  }
  // TeX's passes: no hyphenation at \pretolerance, then hyphenation at
  // \tolerance, then an emergency pass that always succeeds.
  const items = buildItems(spec, spec.hyphenate !== false, stats);
  const em = (spec.runs[0]?.s ?? 10) * 3;
  const passes = [
    { tolerance: 100, allowHyphens: false },
    { tolerance: 200, allowHyphens: spec.hyphenate !== false },
    { tolerance: 9999, allowHyphens: spec.hyphenate !== false, emergencyStretch: em, final: true },
  ];
  for (let p = 0; p < passes.length; p++) {
    const breaks = breakLines(items, spec.width, passes[p]);
    if (breaks !== null) return { lines: linesFrom(items, breaks, spec.width, "j"), pass: p + 1 };
  }
  throw new Error("final line-breaking pass found no breakpoints (bug)");
}

export function setParagraph(spec) {
  if (spec === null || typeof spec !== "object" || !Array.isArray(spec.runs)) throw new TypeError("paragraph spec must have runs");
  if (!(spec.width > 0)) throw new RangeError(`paragraph width must be positive, got ${spec.width}`);
  const stats = { missing: 0 };
  const { lines, pass } = setRuns(spec, stats);
  let overfull = 0;
  let hyphens = 0;
  for (const line of lines) {
    if (line.w > spec.width + 0.5 && (spec.align ?? "j") === "j") overfull++;
    if (line.hyphen) hyphens++;
  }
  if (spec.tag !== undefined && lines.length > 0) {
    const tag = setRuns({ runs: spec.tag, width: spec.width, indent: 0, align: "l" }, stats).lines[0];
    if (tag !== undefined) {
      const lastLine = lines[lines.length - 1];
      for (const seg of tag.segs) lastLine.segs.push([seg[0] - lastLine.x + spec.width - tag.w, seg[1], seg[2], seg[3], seg[4]]);
    }
  }
  let label = null;
  if (spec.label !== undefined) {
    const set = setRuns({ runs: spec.label, width: 1e6, indent: 0, align: "l" }, stats).lines[0];
    if (set !== undefined) label = { w: set.w, segs: set.segs };
  }
  return {
    lines: lines.map((l) => ({ x: l.x, segs: l.segs })),
    label,
    stats: { lines: lines.length, hyphens, overfull, pass, missing: stats.missing },
  };
}

/** Load font metrics and hyphenation patterns ahead of the first task. */
export function warmUp() {
  setParagraph({ runs: [{ t: "Warm\u00a0up: hyphenation, “kerning”, α ≤ β.", f: "R", s: 10 }, { t: " italic", f: "I", s: 10 }, { t: " bold", f: "B", s: 10 }, { t: " both", f: "BI", s: 10 }, { t: " mono", f: "T", s: 10 }], width: 200, indent: 0, align: "j", hyphenate: true });
}
