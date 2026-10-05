// A LaTeX subset -> document blocks. Runs on the host; it is cheap next to
// line breaking. Unsupported commands keep their argument text and produce
// one warning each, so real-world documents degrade instead of failing.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mathToRuns } from "./math.mjs";

export const BODY_SIZE = 10;
const SIZES = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
const NBSP = "\u00a0";
const HARD_BREAK = "\u2028";
const HFILL = "\ue002"; // glue of order fill; see paragraph.mjs
const REF_OPEN = "\ue000";
const REF_CLOSE = "\ue001";
const MAX_EXPANSIONS = 200_000;
const MAX_INPUT_DEPTH = 16;

const TEXT_SYMBOLS = {
  ss: "ß", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", o: "ø", O: "Ø", aa: "å", AA: "Å", l: "ł", L: "Ł", i: "ı", j: "ȷ",
  S: "§", P: "¶", dag: "†", ddag: "‡", copyright: "©", textcopyright: "©", textregistered: "®", texttrademark: "™",
  pounds: "£", textsterling: "£", euro: "€", texteuro: "€", textbullet: "•", textperiodcentered: "·",
  textendash: "–", textemdash: "—", textquoteleft: "‘", textquoteright: "’", textquotedblleft: "“",
  textquotedblright: "”", guillemotleft: "«", guillemotright: "»", ldots: "…", dots: "…", textellipsis: "…",
  textasciitilde: "~", textasciicircum: "^", textbackslash: "\\", textbar: "|", textless: "<", textgreater: ">",
  textdegree: "°", degree: "°", textmu: "µ", texttimes: "×", textdiv: "÷", textonehalf: "½", textonequarter: "¼",
  textthreequarters: "¾", textexclamdown: "¡", textquestiondown: "¿", textunderscore: "_", textbraceleft: "{",
  textbraceright: "}", textdollar: "$", textpercent: "%", textampersand: "&", textsection: "§", textparagraph: "¶",
  TeX: "TeX", LaTeX: "LaTeX", LaTeXe: "LaTeX2ε", XeTeX: "XeTeX", LuaTeX: "LuaTeX", BibTeX: "BibTeX",
  "%": "%", "&": "&", "$": "$", "#": "#", _: "_", "{": "{", "}": "}", " ": " ", "@": "", "/": "", "-": "\u00ad",
  ",": "\u2009", ":": "\u2009", ";": "\u2009", "!": "", quad: NBSP.repeat(4), qquad: NBSP.repeat(8),
  enspace: NBSP.repeat(2), thinspace: "\u2009", nobreakspace: NBSP, textvisiblespace: "␣",
};
const ACCENTS = {
  "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "=": "\u0304", ".": "\u0307",
  u: "\u0306", v: "\u030c", H: "\u030b", c: "\u0327", d: "\u0323", b: "\u0331", r: "\u030a", k: "\u0328",
};
// commands whose arguments carry no printable text
const SWALLOW = {
  documentclass: [1, 1], usepackage: [1, 1], RequirePackage: [1, 1], pagestyle: [0, 1], thispagestyle: [0, 1],
  pagenumbering: [0, 1], setlength: [0, 2], addtolength: [0, 2], setcounter: [0, 2], addtocounter: [0, 2],
  hypersetup: [0, 1], geometry: [0, 1], graphicspath: [0, 1], bibliographystyle: [0, 1], linespread: [0, 1],
  newcounter: [1, 1], newlength: [0, 1], numberwithin: [0, 2], DeclareMathOperator: [0, 2], definecolor: [0, 3],
  newtheorem: [1, 2], theoremstyle: [0, 1], makeatletter: [0, 0], makeatother: [0, 0],
  centering: [0, 0], sloppy: [0, 0], fussy: [0, 0], selectfont: [0, 0], protect: [0, 0], nocite: [0, 1],
  hss: [0, 0], strut: [0, 0], null: [0, 0], relax: [0, 0], frenchspacing: [0, 0],
  nonfrenchspacing: [0, 0], index: [0, 1], phantom: [0, 1], hphantom: [0, 1], vphantom: [0, 1], color: [1, 1],
  addcontentsline: [0, 3], markboth: [0, 2], markright: [0, 1],
  bibliography: [0, 1], printbibliography: [1, 0], appendix: [0, 0], frontmatter: [0, 0], mainmatter: [0, 0],
  backmatter: [0, 0], indent: [0, 0], tableofcontents: [0, 0], listoffigures: [0, 0], listoftables: [0, 0],
};

export class TexError extends Error {
  constructor(message, file, line) {
    super(`${file}:${line}: ${message}`);
    this.name = "TexError";
    this.file = file;
    this.line = line;
  }
}

/** Character source with a stack of frames, so macro expansion can push text. */
class Reader {
  constructor(text, file, line) {
    this.frames = [{ s: text, i: 0, base: true }];
    this.file = file;
    this.line = line;
    this.expansions = 0;
  }
  top() {
    while (this.frames.length > 0) {
      const f = this.frames[this.frames.length - 1];
      if (f.i < f.s.length) return f;
      if (this.frames.length === 1) return f;
      this.frames.pop();
    }
    return null;
  }
  peek(offset = 0) {
    const f = this.top();
    return f !== null && f.i + offset < f.s.length ? f.s[f.i + offset] : null;
  }
  next() {
    const f = this.top();
    if (f === null || f.i >= f.s.length) return null;
    const c = f.s[f.i++];
    if (f.base && c === "\n") this.line++;
    return c;
  }
  push(text) {
    if (++this.expansions > MAX_EXPANSIONS) this.fail("too many macro expansions (recursive \\newcommand?)");
    if (text.length > 0) this.frames.push({ s: text, i: 0, base: false });
  }
  fail(message) {
    throw new TexError(message, this.file, this.line);
  }
  /** Raw text of a balanced {...} group; the opening brace must be next. */
  group() {
    this.skipSpaces();
    if (this.peek() !== "{") {
      // TeX allows a single token as an argument
      const c = this.next();
      if (c === null) this.fail("missing argument");
      if (c !== "\\") return c;
      const name = this.csName();
      return `\\${name}${/^[A-Za-z]+$/.test(name) ? " " : ""}`;
    }
    this.next();
    let depth = 1;
    let out = "";
    for (;;) {
      const c = this.next();
      if (c === null) this.fail("unbalanced braces: missing }");
      if (c === "\\") {
        const d = this.next();
        if (d === null) this.fail("lone backslash at end of input");
        out += c + d;
        continue;
      }
      if (c === "%") {
        while (this.peek() !== null && this.peek() !== "\n") this.next();
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return out;
      out += c;
    }
  }
  /** Raw text of [...] if present, else null. */
  optional() {
    this.skipSpaces();
    if (this.peek() !== "[") return null;
    this.next();
    let depth = 0;
    let out = "";
    for (;;) {
      const c = this.next();
      if (c === null) this.fail("unbalanced [ ... ]");
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === "]" && depth === 0) return out;
      out += c;
    }
  }
  star() {
    if (this.peek() === "*") {
      this.next();
      return true;
    }
    return false;
  }
  skipSpaces() {
    for (let c = this.peek(); c === " " || c === "\t" || c === "\n" || c === "\r"; c = this.peek()) this.next();
  }
  /** Name after a backslash; skips spaces after control words like TeX. */
  csName() {
    const c = this.next();
    if (c === null) this.fail("lone backslash at end of input");
    if (!/[A-Za-z]/.test(c)) return c;
    let name = c;
    while (this.peek() !== null && /[A-Za-z]/.test(this.peek())) name += this.next();
    while (this.peek() === " " || this.peek() === "\t") this.next();
    if (this.peek() === "\n") {
      // a single line end after a control word is skipped; a blank line is \par
      let k = 1;
      while (this.peek(k) === " " || this.peek(k) === "\t" || this.peek(k) === "\r") k++;
      if (this.peek(k) !== "\n") {
        this.next();
        while (this.peek() === " " || this.peek() === "\t") this.next();
      }
    }
    return name;
  }
  /** Raw text up to the literal terminator (verbatim, math). */
  until(terminator, what) {
    let out = "";
    for (;;) {
      const f = this.top();
      if (f === null || f.i >= f.s.length) this.fail(`missing ${terminator} to end ${what}`);
      if (f.s.startsWith(terminator, f.i)) {
        for (let k = 0; k < terminator.length; k++) this.next();
        return out;
      }
      out += this.next();
    }
  }
}

const lengthPt = (raw, size) => {
  const m = /^\s*(-?[0-9]*\.?[0-9]+)\s*(pt|bp|mm|cm|in|em|ex|pc|\\baselineskip|\\textwidth|\\linewidth|\\parindent)?/.exec(raw ?? "");
  if (m === null) return 0;
  const v = Number(m[1]);
  const unit = { pt: 1, bp: 1, mm: 2.845, cm: 28.45, in: 72.27, em: size, ex: size * 0.43, pc: 12, "\\baselineskip": size * 1.2, "\\textwidth": 360, "\\linewidth": 360, "\\parindent": 15 }[m[2] ?? "pt"];
  return v * unit;
};

const roman = (n) => {
  const t = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of t) while (n >= v) { out += s; n -= v; }
  return out;
};
const enumLabel = (depth, n) => [`${n}.`, `(${String.fromCharCode(96 + n)})`, `${roman(n)}.`, `${String.fromCharCode(64 + n)}.`][Math.min(depth, 3)];

const fontKey = (st) => (st.tt ? "T" : st.bold && st.italic ? "BI" : st.bold ? "B" : st.italic ? "I" : "R");

/**
 * Parse LaTeX source. Returns { meta, blocks, warnings }.
 * options: { file, readFile(path) -> string | undefined }
 */
export function parseTex(source, options = {}) {
  const file = options.file ?? "input.tex";
  const readFile = options.readFile ?? ((p) => readFileSync(p, "utf8"));
  const warnings = [];
  const warned = new Set();
  const macros = new Map();
  const labels = new Map();
  const bibNumbers = new Map();
  const notes = [];
  const meta = { title: null, author: null, date: null };
  const counters = { chapter: 0, section: 0, subsection: 0, subsubsection: 0, equation: 0, figure: 0, table: 0, footnote: 0 };
  let lastLabel = "";
  const blocks = [];
  let par = null; // open paragraph
  let capture = null; // runs collector for headings, titles, notes
  let suppressIndent = false;
  let pendingLabel = null; // list item label runs for the next paragraph

  const warnOnce = (key, msg, line) => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(`${file}:${line}: ${msg}`);
  };

  // ---- output helpers -------------------------------------------------
  const pushRun = (target, t, st) => {
    if (t.length === 0) return;
    const f = fontKey(st);
    const s = st.size;
    const r = st.rise ?? 0;
    const last = target[target.length - 1];
    if (last !== undefined && last.f === f && last.s === s && last.r === r) last.t += t;
    else target.push({ t, f, s, r });
  };
  const text = (t, ctx) => {
    if (t.length === 0) return;
    let s = t;
    if (ctx.style.upper) s = s.toUpperCase();
    if (ctx.style.nobreak) s = s.replace(/ /g, NBSP);
    if (capture !== null) return pushRun(capture, s, ctx.style);
    if (par === null) {
      if (/^[ \t\n\r]*$/.test(s)) return; // spaces never start a paragraph
      openPar(ctx);
    }
    pushRun(par.runs, s, ctx.style);
  };
  const space = (ctx) => text(" ", ctx);
  const openPar = (ctx) => {
    const g = ctx.geom;
    const indent = suppressIndent || pendingLabel !== null || g.align !== "j" || !g.indentPars ? 0 : 15;
    par = {
      type: "par",
      runs: [],
      indent,
      align: g.align,
      left: g.left,
      right: g.right,
      size: ctx.style.size,
      hyphenate: g.align === "j",
      label: pendingLabel,
      srcLine: ctx.reader.line,
      spaceBefore: 0,
    };
    pendingLabel = null;
    suppressIndent = false;
  };
  const closePar = () => {
    if (par === null || capture !== null) return; // block structure is frozen while capturing
    const hasText = par.runs.some((r) => /[^ \t\n\r]/.test(r.t));
    if (hasText) blocks.push(par);
    else if (par.label !== null) pendingLabel = par.label; // \item with no text yet
    par = null;
  };
  const vspace = (h) => {
    closePar();
    blocks.push({ type: "space", h });
  };
  const captureRuns = (fn) => {
    const saved = capture;
    const out = [];
    capture = out;
    try {
      fn();
    } finally {
      capture = saved;
    }
    return out;
  };
  const plainText = (runs) => runs.map((r) => r.t).join("").replace(/[\u00a0\u2028\u2009]/g, " ").replace(/\s+/g, " ").trim();

  // ---- walking ----------------------------------------------------------
  const childCtx = (ctx, changes = {}) => ({
    ...ctx,
    ...changes,
    style: { ...ctx.style, ...(changes.style ?? {}) },
    geom: { ...ctx.geom, ...(changes.geom ?? {}) }, // list counters stay shared by reference
  });

  const walkString = (raw, ctx, line) => {
    const reader = new Reader(raw, file, line ?? ctx.reader.line);
    reader.expansions = ctx.reader.expansions;
    walk(reader, childCtx(ctx, { reader }), null);
    ctx.reader.expansions = reader.expansions;
  };

  const heading = (level, starred, raw, ctx) => {
    closePar();
    let number = "";
    if (!starred) {
      if (level === 0) {
        number = String(++counters.chapter);
        counters.section = counters.subsection = counters.subsubsection = 0;
      } else if (level === 1) {
        counters.section++;
        counters.subsection = counters.subsubsection = 0;
        number = (counters.chapter > 0 ? `${counters.chapter}.` : "") + counters.section;
      } else if (level === 2) {
        counters.subsection++;
        counters.subsubsection = 0;
        number = (counters.chapter > 0 ? `${counters.chapter}.` : "") + `${counters.section}.${counters.subsection}`;
      } else {
        counters.subsubsection++;
        number = (counters.chapter > 0 ? `${counters.chapter}.` : "") + `${counters.section}.${counters.subsection}.${counters.subsubsection}`;
      }
      lastLabel = number;
    }
    const sizes = [24.88, 14.4, 12, 10];
    const st = { bold: true, italic: false, tt: false, size: sizes[level], rise: 0, upper: false, nobreak: false };
    const title = captureRuns(() => walkString(raw, childCtx(ctx, { style: st })));
    if (level === 0) {
      blocks.push({ type: "pagebreak" });
      blocks.push({ type: "space", h: 50, sticky: true });
      if (number !== "") {
        blocks.push({ type: "par", role: "heading", runs: [{ t: `Chapter ${number}`, f: "B", s: 20.74, r: 0 }], indent: 0, align: "l", left: 0, right: 0, size: 20.74, hyphenate: false, label: null, srcLine: ctx.reader.line, keepWithNext: true });
        blocks.push({ type: "space", h: 18 });
      }
      blocks.push({ type: "par", role: "heading", runs: title, indent: 0, align: "l", left: 0, right: 0, size: 24.88, hyphenate: false, label: null, srcLine: ctx.reader.line, keepWithNext: true, outline: { level: 0, title: (number ? `${number} ` : "") + plainText(title) } });
      blocks.push({ type: "space", h: 36 });
    } else {
      const before = [0, 18, 14, 11][level];
      const after = [0, 8, 6, 4][level];
      const runs = number === "" ? title : [{ t: number + NBSP + NBSP + NBSP, f: "B", s: sizes[level], r: 0 }, ...title];
      blocks.push({ type: "space", h: before });
      blocks.push({ type: "par", role: "heading", runs, indent: 0, align: "l", left: ctx.geom.left, right: ctx.geom.right, size: sizes[level], hyphenate: false, label: null, srcLine: ctx.reader.line, keepWithNext: true, outline: { level, title: (number ? `${number} ` : "") + plainText(title) } });
      blocks.push({ type: "space", h: after, sticky: true });
    }
    suppressIndent = true;
  };

  const footnote = (raw, ctx) => {
    const n = ++counters.footnote;
    const st = { bold: false, italic: false, tt: false, size: 9, rise: 0, upper: false, nobreak: false };
    const savedPar = par;
    const savedLabel = pendingLabel;
    const runs = captureRuns(() => walkString(raw, childCtx(ctx, { style: st })));
    par = savedPar;
    pendingLabel = savedLabel;
    notes.push({ n, runs });
    text(String(n), childCtx(ctx, { style: { size: Math.max(5, ctx.style.size * 0.7), rise: ctx.style.size * 0.36 } }));
  };

  const mathInline = (raw, ctx) => {
    const runs = mathToRuns(raw, { size: ctx.style.size, bold: ctx.style.bold }, (m) => warnOnce(m, m, ctx.reader.line));
    for (const r of runs) {
      const st = { ...ctx.style, rise: (ctx.style.rise ?? 0) + r.r, size: r.s };
      const t = r.t.replace(/ /g, NBSP);
      if (capture !== null) capture.push({ t, f: r.f, s: r.s, r: st.rise });
      else {
        if (par === null) openPar(ctx);
        const last = par.runs[par.runs.length - 1];
        if (last !== undefined && last.f === r.f && last.s === r.s && last.r === st.rise) last.t += t;
        else par.runs.push({ t, f: r.f, s: r.s, r: st.rise });
      }
    }
  };

  const mathDisplay = (raw, ctx, numbered) => {
    closePar();
    const lines = raw.split(/\\\\(?:\[[^\]]*\])?/).map((l) => l.trim()).filter((l) => l.length > 0);
    blocks.push({ type: "space", h: 6 });
    for (const line of lines) {
      let tag;
      if (numbered && !/\\(nonumber|notag)\b/.test(line)) {
        counters.equation++;
        lastLabel = String(counters.equation);
        tag = [{ t: `(${counters.equation})`, f: "R", s: BODY_SIZE, r: 0 }];
      }
      const runs = mathToRuns(line.replace(/\\label\{([^}]*)\}/g, (_, k) => { labels.set(k, lastLabel); return ""; }), { size: BODY_SIZE, bold: false }, (m) => warnOnce(m, m, ctx.reader.line));
      blocks.push({ type: "par", role: "math", runs, indent: 0, align: "c", left: ctx.geom.left, right: ctx.geom.right, size: BODY_SIZE, hyphenate: false, label: null, srcLine: ctx.reader.line, tag });
    }
    blocks.push({ type: "space", h: 6 });
    suppressIndent = true;
  };

  const LIST_ENVS = new Set(["itemize", "enumerate", "description", "thebibliography"]);

  const environment = (name, r, ctx) => {
    const line = r.line;
    const verbatimEnvs = ["verbatim", "verbatim*", "lstlisting", "minted", "Verbatim"];
    if (verbatimEnvs.includes(name)) {
      closePar();
      if (name === "lstlisting" || name === "Verbatim") r.optional();
      if (name === "minted") r.group();
      let body = r.until(`\\end{${name}}`, `\\begin{${name}}`);
      body = body.replace(/^[ \t]*\n/, "").replace(/\n[ \t]*$/, "");
      blocks.push({ type: "space", h: 6 });
      blocks.push({ type: "verbatim", lines: body.split("\n").map((l) => l.replace(/\t/g, "    ")), left: ctx.geom.left, srcLine: line });
      blocks.push({ type: "space", h: 6 });
      suppressIndent = true;
      return;
    }
    const mathEnvs = { equation: true, "equation*": false, align: true, "align*": false, gather: true, "gather*": false, displaymath: false, multline: true, "multline*": false, eqnarray: true, "eqnarray*": false };
    if (Object.hasOwn(mathEnvs, name)) {
      mathDisplay(r.until(`\\end{${name}}`, `\\begin{${name}}`), ctx, mathEnvs[name]);
      return;
    }
    if (name === "document") {
      walk(r, ctx, { env: name });
      while (r.next() !== null); // TeX ignores everything after \end{document}
      return;
    }
    if (name === "comment") {
      r.until("\\end{comment}", "\\begin{comment}");
      return;
    }
    closePar();
    const g = ctx.geom;
    if (LIST_ENVS.has(name)) {
      if (name === "thebibliography") {
        r.group(); // widest label
        heading(1, true, "References", ctx);
      }
      const depth = g.listDepth;
      const geom = { ...g, left: g.left + 25, listDepth: depth + 1, indentPars: false, list: { kind: name, n: 0, depth: name === "enumerate" ? g.enumDepth : depth }, enumDepth: g.enumDepth + (name === "enumerate" ? 1 : 0) };
      blocks.push({ type: "space", h: depth === 0 ? 6 : 2 });
      walk(r, childCtx(ctx, { geom }), { env: name });
      closePar();
      pendingLabel = null;
      blocks.push({ type: "space", h: depth === 0 ? 6 : 2 });
      suppressIndent = true;
      return;
    }
    const spaced = (geom, style = {}) => {
      blocks.push({ type: "space", h: 6 });
      walk(r, childCtx(ctx, { geom: { ...g, ...geom }, style }), { env: name });
      closePar();
      blocks.push({ type: "space", h: 6 });
      suppressIndent = true;
    };
    switch (name) {
      case "quote":
      case "verse":
        return spaced({ left: g.left + 25, right: g.right + 25, indentPars: false });
      case "quotation":
        return spaced({ left: g.left + 25, right: g.right + 25, indentPars: true });
      case "center":
        return spaced({ align: "c" });
      case "flushleft":
        return spaced({ align: "l" });
      case "flushright":
        return spaced({ align: "r" });
      case "abstract": {
        blocks.push({ type: "space", h: 10 });
        blocks.push({ type: "par", role: "body", runs: [{ t: "Abstract", f: "B", s: 9, r: 0 }], indent: 0, align: "c", left: 0, right: 0, size: 9, hyphenate: false, label: null, srcLine: line, keepWithNext: true });
        blocks.push({ type: "space", h: 4, sticky: true });
        suppressIndent = true;
        walk(r, childCtx(ctx, { geom: { ...g, left: g.left + 25, right: g.right + 25 }, style: { size: 9 } }), { env: name });
        closePar();
        blocks.push({ type: "space", h: 12 });
        suppressIndent = true;
        return;
      }
      case "figure":
      case "figure*":
      case "table":
      case "table*":
        r.optional();
        return spaced({ align: "c", float: name.replace("*", "") });
      case "tabular":
      case "tabular*":
      case "tabularx": {
        if (name !== "tabular") r.group();
        r.optional();
        r.group(); // column spec
        const body = r.until(`\\end{${name}}`, `\\begin{${name}}`);
        blocks.push({ type: "space", h: 4 });
        for (const row of body.split(/\\\\(?:\[[^\]]*\])?/)) {
          const cleaned = row.replace(/\\(hline|toprule|midrule|bottomrule|cline\{[^}]*\})/g, "").trim();
          if (cleaned.length === 0) continue;
          const cells = cleaned.split(/(?<!\\)&/).map((c) => c.trim());
          walkString(cells.join(" \\quad "), childCtx(ctx, { geom: { ...g, align: "c", indentPars: false } }), line);
          closePar();
        }
        blocks.push({ type: "space", h: 4 });
        return;
      }
      case "minipage":
        r.optional();
        r.group();
        walk(r, ctx, { env: name });
        return;
      case "proof":
        r.optional();
        closePar();
        text("Proof. ", childCtx(ctx, { style: { italic: true } }));
        walk(r, ctx, { env: name });
        text(" ∎", ctx);
        closePar();
        return;
      default:
        warnOnce(`env:${name}`, `environment {${name}} is not supported; its contents are kept`, line);
        walk(r, ctx, { env: name });
    }
  };

  const item = (r, ctx) => {
    closePar();
    const list = ctx.geom.list;
    const opt = r.optional();
    if (list === undefined) {
      warnOnce("item", "\\item outside a list", r.line);
      return;
    }
    if (list.n > 0) blocks.push({ type: "space", h: 2 });
    list.n++;
    const st = { ...ctx.style, rise: 0 };
    if (opt !== null) {
      pendingLabel = captureRuns(() => walkString(opt, childCtx(ctx, { style: list.kind === "description" ? { bold: true } : {} }), r.line));
    } else if (list.kind === "enumerate") {
      pendingLabel = [{ t: enumLabel(list.depth, list.n), f: fontKey(st), s: st.size, r: 0 }];
      lastLabel = enumLabel(list.depth, list.n).replace(/[.()]/g, "");
    } else if (list.kind === "thebibliography") {
      const key = r.group();
      bibNumbers.set(key, list.n);
      pendingLabel = [{ t: `[${list.n}]`, f: fontKey(st), s: st.size, r: 0 }];
    } else if (list.kind === "itemize") {
      pendingLabel = [{ t: ["•", "–", "∗", "·"][Math.min(list.depth, 3)], f: "R", s: st.size, r: 0 }];
    } else {
      pendingLabel = [];
    }
    if (list.kind === "description" && pendingLabel !== null && pendingLabel.length > 0) {
      // description labels run into the text instead of hanging
      const runs = pendingLabel;
      pendingLabel = null;
      openPar(ctx);
      par.indent = 0;
      for (const run of runs) par.runs.push(run);
      par.runs.push({ t: " ", f: "R", s: st.size, r: 0 });
    }
  };

  const newcommand = (r, redefine) => {
    let name = r.group().trim();
    if (name.startsWith("\\")) name = name.slice(1).trim();
    const nArgs = Number(r.optional() ?? 0);
    const defaultArg = r.optional();
    const body = r.group();
    if (!redefine && macros.has(name)) return;
    macros.set(name, { nArgs, defaultArg, body });
  };

  const def = (r) => {
    if (r.next() !== "\\") r.fail("\\def must be followed by a control sequence");
    const name = r.csName();
    let params = "";
    while (r.peek() !== null && r.peek() !== "{") params += r.next();
    const nArgs = (params.match(/#[1-9]/g) ?? []).length;
    macros.set(name, { nArgs, defaultArg: null, body: r.group() });
  };

  const expandMacro = (name, r) => {
    const m = macros.get(name);
    const args = [];
    for (let k = 0; k < m.nArgs; k++) {
      if (k === 0 && m.defaultArg !== null) args.push(r.optional() ?? m.defaultArg);
      else args.push(r.group());
    }
    // ## stays a literal #; #n becomes the argument
    const body = m.body.replace(/##|#([1-9])/g, (all, d) => (d === undefined ? "#" : (args[Number(d) - 1] ?? "")));
    // keep a control word from gluing onto following letters
    r.push(/\\[A-Za-z]+$/.test(body) ? body + " " : body);
  };

  const command = (name, r, ctx) => {
    if (macros.has(name)) return expandMacro(name, r);
    const st = ctx.style;
    if (Object.hasOwn(SIZES, name)) {
      st.size = SIZES[name];
      return;
    }
    if (Object.hasOwn(ACCENTS, name)) {
      let base = r.peek() === "{" ? r.group() : r.next();
      if (base === "\\") base = TEXT_SYMBOLS[r.csName()] ?? "";
      if (base === "\\i" || base === "\\i ") base = "ı";
      return text((base.slice(0, 1) + ACCENTS[name] + base.slice(1)).normalize("NFC"), ctx);
    }
    if (Object.hasOwn(TEXT_SYMBOLS, name)) return text(TEXT_SYMBOLS[name], ctx);
    if (Object.hasOwn(SWALLOW, name)) {
      const [opts, args] = SWALLOW[name];
      for (let k = 0; k < opts; k++) r.optional();
      for (let k = 0; k < args; k++) r.group();
      if (name === "centering") ctx.geom.align = "c";
      if (name === "bibliography" || name === "printbibliography" || name === "tableofcontents" || name.startsWith("listof")) warnOnce(name, `\\${name} is not supported`, r.line);
      return;
    }
    switch (name) {
      case "\\":
      case "newline":
      case "linebreak": {
        r.star();
        r.optional();
        if (par !== null || capture !== null) text(HARD_BREAK, ctx);
        return;
      }
      case "par":
        return closePar();
      case "noindent":
        closePar();
        suppressIndent = true;
        return;
      case "bf":
      case "bfseries":
        st.bold = true;
        return;
      case "it":
      case "itshape":
      case "sl":
      case "slshape":
        st.italic = true;
        return;
      case "em":
        st.italic = !st.italic;
        return;
      case "tt":
      case "ttfamily":
        st.tt = true;
        return;
      case "rm":
      case "rmfamily":
      case "normalfont":
      case "upshape":
      case "mdseries":
      case "sffamily":
      case "sf":
        st.bold = name === "upshape" ? st.bold : false;
        st.italic = false;
        st.tt = false;
        return;
      case "raggedright":
        ctx.geom.align = "l";
        return;
      case "raggedleft":
        ctx.geom.align = "r";
        return;
      case "textbf":
        return walkString(r.group(), childCtx(ctx, { style: { bold: true } }));
      case "textit":
      case "textsl":
        return walkString(r.group(), childCtx(ctx, { style: { italic: true } }));
      case "emph":
        return walkString(r.group(), childCtx(ctx, { style: { italic: !st.italic } }));
      case "texttt":
        return walkString(r.group(), childCtx(ctx, { style: { tt: true } }));
      case "textrm":
      case "textsf":
      case "textup":
      case "textmd":
      case "textnormal":
        return walkString(r.group(), childCtx(ctx, { style: { italic: false, tt: false, bold: name === "textmd" ? false : st.bold } }));
      case "textsc":
        return walkString(r.group(), childCtx(ctx, { style: { upper: true, size: st.size * 0.85 } }));
      case "underline":
      case "uline":
      case "textnormal":
        return walkString(r.group(), ctx);
      case "mbox":
      case "hbox":
      case "makebox":
      case "fbox":
        if (name === "makebox") {
          r.optional();
          r.optional();
        }
        return walkString(r.group(), childCtx(ctx, { style: { nobreak: true } }));
      case "url":
      case "nolinkurl":
        return text(r.group(), childCtx(ctx, { style: { tt: true } }));
      case "href": {
        r.group();
        return walkString(r.group(), ctx);
      }
      case "verb": {
        r.star();
        const delim = r.next();
        if (delim === null) r.fail("\\verb at end of input");
        return text(r.until(delim, "\\verb").replace(/ /g, NBSP), childCtx(ctx, { style: { tt: true } }));
      }
      case "footnote":
      case "thanks":
        r.optional();
        return footnote(r.group(), ctx);
      case "label":
        labels.set(r.group().trim(), lastLabel);
        return;
      case "ref":
      case "autoref":
      case "cref":
      case "Cref":
      case "pageref":
        return text(`${REF_OPEN}ref:${r.group().trim()}${REF_CLOSE}`, ctx);
      case "eqref":
        return text(`(${REF_OPEN}ref:${r.group().trim()}${REF_CLOSE})`, ctx);
      case "cite":
      case "citep":
      case "citet":
      case "parencite":
      case "textcite":
        r.optional();
        r.optional();
        return text(`${REF_OPEN}cite:${r.group().trim()}${REF_CLOSE}`, ctx);
      case "title":
        meta.title = r.group();
        return;
      case "author":
        meta.author = r.group();
        return;
      case "date":
        meta.date = r.group();
        return;
      case "today":
        return text(formatDate(options.date ?? new Date()), ctx);
      case "maketitle":
        return maketitle(ctx);
      case "chapter":
      case "section":
      case "subsection":
      case "subsubsection": {
        const starred = r.star();
        r.optional();
        const level = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 }[name];
        return heading(level, starred, r.group(), ctx);
      }
      case "paragraph":
      case "subparagraph": {
        r.star();
        r.optional();
        closePar();
        blocks.push({ type: "space", h: 6 });
        const title = r.group();
        walkString(title, childCtx(ctx, { style: { bold: true } }));
        text(NBSP + NBSP, ctx);
        return;
      }
      case "caption": {
        r.optional();
        const kind = ctx.geom.float ?? "figure";
        const n = ++counters[kind === "table" ? "table" : "figure"];
        lastLabel = String(n);
        closePar();
        walkString(`\\textbf{${kind === "table" ? "Table" : "Figure"} ${n}:} ${r.group()}`, childCtx(ctx, { geom: { ...ctx.geom, align: "c" } }));
        closePar();
        return;
      }
      case "includegraphics": {
        r.star();
        r.optional();
        const path = r.group();
        warnOnce(`img:${path}`, `images are not supported (\\includegraphics{${path}})`, r.line);
        return text(`[image: ${path}]`, childCtx(ctx, { style: { italic: true } }));
      }
      case "item":
      case "bibitem":
        return item(r, ctx);
      case "hfill":
      case "hfil":
        return text(HFILL, ctx);
      case "hspace": {
        r.star();
        const arg = r.group();
        if (/\\fill?\b/.test(arg)) return text(HFILL, ctx);
        return text(NBSP.repeat(Math.max(1, Math.round(lengthPt(arg, ctx.style.size) / 2.5))), ctx);
      }
      case "begin": {
        const env = r.group().trim();
        return environment(env, r, ctx);
      }
      case "end": {
        const env = r.group().trim();
        r.fail(`\\end{${env}} without matching \\begin`);
        return;
      }
      case "newcommand":
      case "renewcommand":
      case "providecommand":
        r.star();
        return newcommand(r, name === "renewcommand");
      case "def":
      case "gdef":
        return def(r);
      case "let": {
        if (r.next() !== "\\") r.fail("\\let must be followed by a control sequence");
        const target = r.csName();
        r.skipSpaces();
        if (r.peek() === "=") r.next();
        r.skipSpaces();
        const c = r.next();
        const source = c === "\\" ? r.csName() : c;
        if (macros.has(source)) macros.set(target, macros.get(source));
        return;
      }
      case "input":
      case "include":
      case "subfile": {
        const target = r.group().trim();
        const depth = ctx.inputDepth ?? 0;
        if (depth >= MAX_INPUT_DEPTH) r.fail(`\\input nested more than ${MAX_INPUT_DEPTH} deep`);
        const path = resolve(dirname(ctx.file), target.endsWith(".tex") ? target : `${target}.tex`);
        let body;
        try {
          body = readFile(path);
        } catch (cause) {
          throw new TexError(`cannot read \\${name}{${target}} (${path}): ${cause?.message ?? cause}`, file, r.line);
        }
        if (name === "include") closePar();
        const reader = new Reader(body, path, 1);
        walk(reader, childCtx(ctx, { reader, file: path, inputDepth: depth + 1 }), null);
        return;
      }
      case "vspace":
      case "vspace*":
        r.star();
        return vspace(lengthPt(r.group(), BODY_SIZE));
      case "smallskip":
        return vspace(3);
      case "medskip":
        return vspace(6);
      case "bigskip":
        return vspace(12);
      case "vfill":
        return vspace(24);
      case "newpage":
      case "clearpage":
      case "cleardoublepage":
      case "pagebreak":
        r.optional();
        closePar();
        blocks.push({ type: "pagebreak" });
        return;
      case "(":
        return mathInline(r.until("\\)", "\\("), ctx);
      case "[":
        return mathDisplay(r.until("\\]", "\\["), ctx, false);
      case "and":
        return text(", ", ctx);
      case "hline":
      case "rule":
        if (name === "rule") {
          r.optional();
          r.group();
          r.group();
        }
        return;
      default: {
        if (r.peek() === "{") {
          warnOnce(`cmd:${name}`, `\\${name} is not supported; its argument is kept as text`, r.line);
          return walkString(r.group(), ctx);
        }
        warnOnce(`cmd:${name}`, `\\${name} is not supported and was ignored`, r.line);
      }
    }
  };

  const maketitle = (ctx) => {
    closePar();
    const center = { ...ctx.geom, align: "c", left: 0, right: 0 };
    const block = (raw, size) => {
      if (raw.trim().length === 0) return;
      const runs = captureRuns(() => walkString(raw, childCtx(ctx, { geom: center, style: { size, bold: false, italic: false } })));
      blocks.push({ type: "par", role: "title", runs, indent: 0, align: "c", left: 0, right: 0, size, hyphenate: false, label: null, srcLine: ctx.reader.line, keepWithNext: true });
    };
    blocks.push({ type: "space", h: 20 });
    if (meta.title !== null) block(meta.title, 17.28);
    blocks.push({ type: "space", h: 14 });
    if (meta.author !== null) block(meta.author.replace(/\s*\\and\b\s*/g, ", "), 12);
    blocks.push({ type: "space", h: 6 });
    block(meta.date ?? "\\today", 12);
    blocks.push({ type: "space", h: 22 });
    suppressIndent = true;
  };

  /** Main loop. stop: null (end of input), { env } (\end{env}) or "group" (closing brace). */
  function walk(r, ctx, stop) {
    for (;;) {
      const c = r.next();
      if (c === null) {
        if (stop === "group") r.fail("unbalanced braces: missing }");
        if (stop !== null && stop.env !== "document") r.fail(`missing \\end{${stop.env}}`);
        return;
      }
      switch (c) {
        case "\\": {
          const name = r.csName();
          if (name === "end") {
            const env = r.group().trim();
            if (stop !== null && stop !== "group" && stop.env === env) return;
            r.fail(`\\end{${env}} does not match ${stop === null || stop === "group" ? "any open environment" : `\\begin{${stop.env}}`}`);
          }
          if (name === "verb" || name === "begin" || name === "item" || /^[A-Za-z]+$/.test(name) || Object.hasOwn(TEXT_SYMBOLS, name) || Object.hasOwn(ACCENTS, name) || name === "\\" || name === "(" || name === "[") {
            command(name, r, ctx);
          } else {
            text(name, ctx); // \<other char> prints that char
          }
          break;
        }
        case "{":
          walk(r, childCtx(ctx), "group");
          break;
        case "}":
          if (stop === "group") return;
          warnOnce("brace", "unmatched } ignored", r.line);
          break;
        case "%":
          while (r.peek() !== null && r.peek() !== "\n") r.next();
          if (r.peek() === "\n") r.next();
          while (r.peek() === " " || r.peek() === "\t") r.next();
          break;
        case "$":
          if (r.peek() === "$") {
            r.next();
            mathDisplay(r.until("$$", "$$"), ctx, false);
          } else {
            mathInline(r.until("$", "$"), ctx);
          }
          break;
        case "~":
          text(NBSP, ctx);
          break;
        case " ":
        case "\t":
        case "\r":
        case "\n": {
          let newlines = c === "\n" ? 1 : 0;
          for (let p = r.peek(); p === " " || p === "\t" || p === "\r" || p === "\n"; p = r.peek()) {
            if (r.next() === "\n") newlines++;
          }
          if (newlines >= 2 && capture === null) closePar();
          else space(ctx);
          break;
        }
        case "-":
          if (r.peek() === "-") {
            r.next();
            if (r.peek() === "-") {
              r.next();
              text("—", ctx);
            } else {
              text("–", ctx);
            }
          } else {
            text("-", ctx);
          }
          break;
        case "`":
          if (r.peek() === "`") {
            r.next();
            text("“", ctx);
          } else {
            text("‘", ctx);
          }
          break;
        case "'":
          if (r.peek() === "'") {
            r.next();
            text("”", ctx);
          } else {
            text("’", ctx);
          }
          break;
        case '"':
          text("”", ctx);
          break;
        default:
          text(c, ctx);
      }
    }
  }

  const reader = new Reader(source, file, 1);
  const rootCtx = {
    reader,
    file,
    style: { bold: false, italic: false, tt: false, size: BODY_SIZE, rise: 0, upper: false, nobreak: false },
    geom: { left: 0, right: 0, align: "j", indentPars: true, listDepth: 0, enumDepth: 0 },
  };
  // Treat everything as body text when there is no \begin{document}.
  walk(reader, rootCtx, null);
  closePar();

  if (notes.length > 0) {
    blocks.push({ type: "space", h: 18 });
    blocks.push({ type: "par", role: "heading", runs: [{ t: "Notes", f: "B", s: 14.4, r: 0 }], indent: 0, align: "l", left: 0, right: 0, size: 14.4, hyphenate: false, label: null, srcLine: 0, keepWithNext: true, outline: { level: 1, title: "Notes" } });
    blocks.push({ type: "space", h: 8, sticky: true });
    for (const note of notes) {
      blocks.push({ type: "par", role: "note", runs: note.runs, indent: 0, align: "j", left: 25, right: 0, size: 9, hyphenate: true, label: [{ t: `${note.n}.`, f: "R", s: 9, r: 0 }], srcLine: 0 });
      blocks.push({ type: "space", h: 3 });
    }
  }

  // Resolve \ref and \cite placeholders now that every \label and \bibitem is known.
  const resolveText = (t) =>
    t.replace(/\ue000(ref|cite):([^\ue001]*)\ue001/g, (_, kind, keys) => {
      if (kind === "ref") {
        const v = labels.get(keys);
        if (v === undefined) {
          warnOnce(`ref:${keys}`, `undefined reference \\ref{${keys}}`, 0);
          return "??";
        }
        return v;
      }
      const parts = keys.split(",").map((k) => k.trim()).filter(Boolean);
      return `[${parts.map((k) => bibNumbers.get(k) ?? k).join(", ")}]`;
    });
  for (const b of blocks) {
    if (b.type !== "par") continue;
    for (const run of b.runs) run.t = resolveText(run.t);
    if (b.label) for (const run of b.label) run.t = resolveText(run.t);
  }
  return { meta, blocks, warnings };
}

function formatDate(d) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
