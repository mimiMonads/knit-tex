// Page layout on the host: blocks + set paragraphs -> positioned pages.
import { encode, metrics } from "./fonts.mjs";

export const GEOMETRY = Object.freeze({
  pageW: 595.276, // A4
  pageH: 841.89,
  textW: 360,
  textH: 610,
  top: 110, // page top to the top of the text block
  footerY: 80, // baseline of the page number
  labelSep: 6,
  verbatimSize: 9,
});

const leadingOf = (block) => {
  let max = block.size ?? 10;
  for (const r of block.runs) if (r.s > max) max = r.s;
  return max * 1.2;
};

/** Paragraph specs for the worker pool, plus the block index each belongs to. */
export function planParagraphs(blocks, geom = GEOMETRY) {
  const specs = [];
  const owners = [];
  blocks.forEach((b, i) => {
    if (b.type !== "par") return;
    const spec = {
      runs: b.runs,
      width: geom.textW - b.left - b.right,
      indent: b.indent,
      align: b.align,
      hyphenate: b.hyphenate,
    };
    if (b.label !== null && b.label !== undefined) spec.label = b.label;
    if (b.tag !== undefined) spec.tag = b.tag;
    specs.push(spec);
    owners.push(i);
  });
  return { specs, owners };
}

const encodeSegs = (text, key, size, x, stats) => {
  const segs = [];
  let dx = 0;
  for (const chunk of encode(text, key, stats)) {
    segs.push([x + dx, chunk.f, size, chunk.t, 0]);
    dx += (metrics(chunk.f).measure(chunk.t) * size) / 1000;
  }
  return { segs, w: dx };
};

/**
 * Lay out pages. `set[k]` is the setParagraph result for planParagraphs' specs[k].
 * Returns { pages: [{ lines, rules }], outline: [{ level, title, page, y }], stats }.
 */
export function buildPages(blocks, owners, set, geom = GEOMETRY) {
  const stats = { missing: 0 };
  const left = (geom.pageW - geom.textW) / 2;
  const resultOf = new Map();
  owners.forEach((blockIndex, k) => resultOf.set(blockIndex, set[k]));

  // 1. vertical list
  const items = [];
  blocks.forEach((b, bi) => {
    if (b.type === "space") {
      const prev = items[items.length - 1];
      if (prev !== undefined && prev.k === "glue") {
        prev.h = Math.max(prev.h, b.h); // adjacent spaces merge, like \addvspace
        prev.sticky = prev.sticky || b.sticky === true;
      } else {
        items.push({ k: "glue", h: b.h, sticky: b.sticky === true });
      }
      return;
    }
    if (b.type === "pagebreak") {
      items.push({ k: "break" });
      return;
    }
    if (b.type === "verbatim") {
      const h = geom.verbatimSize * 1.2;
      b.lines.forEach((text, li) => {
        const { segs } = encodeSegs(text.replace(/ /g, "\u00a0"), "T", geom.verbatimSize, 0, stats);
        const n = b.lines.length;
        items.push({ k: "line", h, x: left + b.left, segs, noBreakAfter: n > 3 && (li === 0 || li === n - 2) });
      });
      return;
    }
    if (b.type !== "par") return;
    const res = resultOf.get(bi);
    if (res === undefined) throw new Error(`paragraph ${bi} was never set`);
    const h = leadingOf(b);
    const n = res.lines.length;
    res.lines.forEach((line, li) => {
      const item = {
        k: "line",
        h,
        x: left + b.left + line.x,
        segs: line.segs,
        noBreakAfter: b.keepWithNext === true || (n >= 2 && (li === 0 || li === n - 2)),
      };
      if (li === 0 && res.label !== null) {
        item.label = { x: left + b.left - geom.labelSep - res.label.w, segs: res.label.segs };
      }
      if (li === 0 && b.outline !== undefined) item.outline = b.outline;
      items.push(item);
    });
  });

  // 2. page breaking: fill, then back up to the last break the constraints allow
  const pagesOfItems = [];
  let cur = [];
  let used = 0;
  const allowedAfter = (idx) => {
    const it = items[idx];
    if (it.k === "glue") return !it.sticky;
    return it.noBreakAfter !== true;
  };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === "break") {
      if (cur.length > 0) pagesOfItems.push(cur);
      cur = [];
      used = 0;
      continue;
    }
    if (cur.length === 0 && it.k === "glue" && !it.sticky) continue; // space vanishes at a page top
    if (used + it.h <= geom.textH + 1e-6 || cur.length === 0) {
      cur.push(i);
      used += it.h;
      continue;
    }
    // overflow: find the latest permitted break that keeps the page at least half full
    let b = cur.length - 1;
    let filled = used;
    while (b >= 0 && !allowedAfter(cur[b])) {
      filled -= items[cur[b]].h;
      b--;
    }
    if (b < 0 || filled < geom.textH * 0.5) b = cur.length - 1; // give up on the constraint
    const firstMoved = b + 1 < cur.length ? cur[b + 1] : i;
    pagesOfItems.push(cur.slice(0, b + 1));
    cur = [];
    used = 0;
    i = firstMoved - 1; // re-flow the moved items onto the next page
  }
  if (cur.length > 0) pagesOfItems.push(cur);

  // 3. positions
  const pages = [];
  const outline = [];
  const yTop = geom.pageH - geom.top;
  pagesOfItems.forEach((idxs, p) => {
    const lines = [];
    let y = yTop;
    for (const idx of idxs) {
      const it = items[idx];
      if (it.k === "glue") {
        y -= it.h;
        continue;
      }
      const baseline = y - it.h * 0.8;
      if (it.outline !== undefined) outline.push({ ...it.outline, page: p, y: y + 4 });
      if (it.label !== undefined) lines.push([it.label.x, baseline, it.label.segs]);
      lines.push([it.x, baseline, it.segs]);
      y -= it.h;
    }
    const folio = encodeSegs(String(p + 1), "R", 10, 0, stats);
    lines.push([(geom.pageW - folio.w) / 2, geom.footerY, folio.segs]);
    pages.push({ lines, rules: [] });
  });
  return { pages, outline, stats };
}
