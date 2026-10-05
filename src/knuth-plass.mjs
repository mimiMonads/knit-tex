// Knuth & Plass, "Breaking Paragraphs into Lines" (1981), following TeX's
// line_break (tex.web §813–890) for a constant line width.
//
// Items:
//   { k: BOX, w }                      material that can't be broken
//   { k: GLUE, w, y, z }               space: width, stretch, shrink
//   { k: PENALTY, w, p, fl, hy, end }  break opportunity; w is added only if
//                                      the line breaks here, fl marks flagged
//                                      (hyphen) breaks, hy marks discretionary
//                                      hyphens skipped when hyphenation is off,
//                                      end marks the paragraph's final break.
export const BOX = 0;
export const GLUE = 1;
export const PENALTY = 2;
export const INF = 10000; // penalty >= INF: never break; <= -INF: must break
export const FIL = 1e7; // stretch of \hfil-style glue
const INF_BAD = 10000;

const DEFAULTS = Object.freeze({
  tolerance: 200,
  linePenalty: 10,
  adjDemerits: 10000,
  doubleHyphenDemerits: 10000,
  finalHyphenDemerits: 5000,
  emergencyStretch: 0,
  allowHyphens: true,
  final: false,
});

const fitnessOf = (r) => (r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3);

/**
 * Returns the optimal breakpoints as [{ pos, r }] (index of the breaking
 * item, adjustment ratio of the line that ends there), or null when no
 * feasible set of breaks exists under the given tolerance.
 */
export function breakLines(items, width, options) {
  const o = { ...DEFAULTS, ...options };
  const n = items.length;
  if (n === 0) return [];
  const last = items[n - 1];
  if (last.k !== PENALTY || last.p > -INF) throw new Error("paragraph must end with a forced break");

  let sw = 0;
  let sy = 0;
  let sz = 0;
  let active = [{ pos: -1, line: 0, fit: 1, tw: 0, ty: 0, tz: 0, dem: 0, prev: null, r: 0 }];

  const flaggedAt = (pos) => pos >= 0 && items[pos].k === PENALTY && items[pos].fl === 1;

  const tryBreak = (i) => {
    const it = items[i];
    const isPenalty = it.k === PENALTY;
    const pen = isPenalty ? it.p : 0;
    const forced = isPenalty && pen <= -INF;
    const best = [null, null, null, null];
    let minDem = Infinity;
    let k = 0;
    while (k < active.length) {
      const a = active[k];
      const w = sw - a.tw + (isPenalty ? it.w : 0);
      let r;
      if (w < width) {
        const stretch = sy - a.ty + o.emergencyStretch;
        r = stretch > 0 ? (width - w) / stretch : Infinity;
      } else if (w > width) {
        const shrink = sz - a.tz;
        r = shrink > 0 ? (width - w) / shrink : -Infinity;
      } else {
        r = 0;
      }
      const deactivate = r < -1 || forced;
      // \tolerance bounds badness (100|r|^3, capped at 10000), not the ratio itself
      const badness = r < -1 || r === Infinity ? INF_BAD + 1 : Math.min(100 * Math.abs(r) ** 3, INF_BAD);
      let feasible = badness <= o.tolerance;
      let artificial = false;
      // TeX §854: in the final pass, never let the last active node vanish
      // without a successor; accept an overfull (or underfull) line instead.
      if (!feasible && deactivate && o.final && active.length === 1 && minDem === Infinity) {
        feasible = true;
        artificial = true;
      }
      if (feasible) {
        let d;
        if (artificial) {
          d = 0;
        } else {
          d = (o.linePenalty + badness) ** 2;
          if (pen > 0) d += pen * pen;
          else if (pen > -INF) d -= pen * pen;
          if (flaggedAt(a.pos)) {
            if (isPenalty && it.end === 1) d += o.finalHyphenDemerits;
            else if (isPenalty && it.fl === 1) d += o.doubleHyphenDemerits;
          }
        }
        const fit = fitnessOf(Number.isFinite(r) ? r : r > 0 ? 2 : 0);
        if (!artificial && Math.abs(fit - a.fit) > 1) d += o.adjDemerits;
        d += a.dem;
        if (best[fit] === null || d < best[fit].dem) best[fit] = { a, dem: d, r };
        if (d < minDem) minDem = d;
      }
      if (deactivate) active.splice(k, 1);
      else k++;
    }
    if (minDem === Infinity) return;
    // Totals after the break: glue following the break is discarded (TeX §837).
    let tw = sw;
    let ty = sy;
    let tz = sz;
    for (let j = i; j < n; j++) {
      const x = items[j];
      if (x.k === GLUE) {
        tw += x.w;
        ty += x.y;
        tz += x.z;
      } else if (x.k === BOX || (x.k === PENALTY && x.p <= -INF && j > i)) {
        break;
      }
    }
    const limit = minDem + o.adjDemerits; // TeX §836: other classes can never win
    for (let f = 0; f < 4; f++) {
      const b = best[f];
      if (b === null || b.dem > limit) continue;
      active.push({ pos: i, line: b.a.line + 1, fit: f, tw, ty, tz, dem: b.dem, prev: b.a, r: b.r });
    }
  };

  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (it.k === BOX) {
      sw += it.w;
    } else if (it.k === GLUE) {
      if (i > 0 && items[i - 1].k === BOX) tryBreak(i);
      sw += it.w;
      sy += it.y;
      sz += it.z;
    } else {
      if (it.p >= INF) continue;
      if (it.hy === 1 && !o.allowHyphens) continue;
      tryBreak(i);
    }
    if (active.length === 0) return null;
  }

  let end = null;
  for (const a of active) if (a.pos === n - 1 && (end === null || a.dem < end.dem)) end = a;
  if (end === null) return null;
  const breaks = [];
  for (let a = end; a.pos >= 0; a = a.prev) breaks.push({ pos: a.pos, r: a.r });
  return breaks.reverse();
}

/** First-fit breaking on natural widths, for ragged and centred text. */
export function breakGreedy(items, width) {
  const breaks = [];
  let lineStart = 0;
  let w = 0;
  let candidate = -1;
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const legal =
      (it.k === GLUE && i > lineStart && items[i - 1].k === BOX) || (it.k === PENALTY && it.p < INF && it.hy !== 1);
    if (it.k === PENALTY && it.p <= -INF) {
      breaks.push({ pos: i, r: 0 });
      lineStart = skipDiscardable(items, i + 1);
      i = lineStart;
      w = 0;
      candidate = -1;
      continue;
    }
    if (legal && w <= width) candidate = i;
    if (it.k === BOX || it.k === GLUE) w += it.w;
    if (w > width && candidate >= 0 && it.k === BOX) {
      breaks.push({ pos: candidate, r: 0 });
      lineStart = skipDiscardable(items, candidate + 1);
      i = lineStart;
      w = 0;
      candidate = -1;
      continue;
    }
    i++;
  }
  return breaks;
}

export function skipDiscardable(items, i) {
  while (i < items.length && (items[i].k === GLUE || (items[i].k === PENALTY && items[i].p > -INF))) i++;
  return i;
}
