// Page rendering: positioned segments -> deflated PDF content stream.
// Runs in a worker. Input is plain JSON; output is a top-level Uint8Array.
//
// page = { lines: [[x, y, segs]], rules: [[x1, y1, x2, y2, width]] }
// segs = [[dx, fontKey, size, bytes, rise]]
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import { metrics } from "./fonts.mjs";

/** Deterministic number formatting: at most 3 decimals, no "-0". */
export function num(v) {
  if (!Number.isFinite(v)) throw new RangeError(`non-finite coordinate ${v}`);
  // String() prints a whole number of thousandths with at most 3 decimals and
  // no trailing zeros, the same as toFixed(3) with them stripped, and -0 as "0".
  return String(Math.round(v * 1000) / 1000);
}

/** PDF literal string from a byte string; non-printables become octal escapes. */
export function pdfLiteral(bytes) {
  let out = "(";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes.charCodeAt(i);
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += "\\" + bytes[i];
    else if (c < 0x20 || c > 0x7e) out += "\\" + c.toString(8).padStart(3, "0");
    else out += bytes[i];
  }
  return out + ")";
}

/** TJ operand with the AFM kerning that the layout measured with. */
function tj(fontKey, bytes) {
  const m = metrics(fontKey);
  const parts = [];
  let start = 0;
  for (let i = 1; i < bytes.length; i++) {
    const k = m.kernPair(bytes.charCodeAt(i - 1), bytes.charCodeAt(i));
    if (k !== 0) {
      parts.push(pdfLiteral(bytes.slice(start, i)), String(-k));
      start = i;
    }
  }
  parts.push(pdfLiteral(bytes.slice(start)));
  return `[${parts.join(" ")}] TJ`;
}

export function renderPageStream(page) {
  if (page === null || typeof page !== "object" || !Array.isArray(page.lines)) throw new TypeError("page must have lines");
  const ops = ["BT"];
  let font = null;
  let size = -1;
  let rise = 0;
  for (const [x, y, segs] of page.lines) {
    for (const [dx, f, s, bytes, r] of segs) {
      if (bytes.length === 0) continue;
      if (f !== font || s !== size) {
        ops.push(`/${f} ${num(s)} Tf`);
        font = f;
        size = s;
      }
      const wantRise = r ?? 0;
      if (wantRise !== rise) {
        ops.push(`${num(wantRise)} Ts`);
        rise = wantRise;
      }
      ops.push(`1 0 0 1 ${num(x + dx)} ${num(y)} Tm ${tj(f, bytes)}`);
    }
  }
  ops.push("ET");
  for (const [x1, y1, x2, y2, w] of page.rules ?? []) {
    ops.push(`${num(w)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }
  const raw = Buffer.from(ops.join("\n"), "latin1");
  // exact-size copy: zlib may hand back a view into a larger pooled buffer
  return new Uint8Array(deflateSync(raw, { level: 6 }));
}
