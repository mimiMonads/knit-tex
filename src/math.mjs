// A small TeX math -> styled runs converter. It is not a math typesetter: no
// fractions on top of each other, no big operators with limits. It maps the
// symbols the base-14 fonts can show (Symbol has Greek and most operators)
// and sets scripts smaller and raised, which covers inline math in prose.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  varpi: "ϖ", rho: "ρ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const BINARY = {
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "⋅", ast: "∗", star: "∗", circ: "∘", bullet: "•",
  cup: "∪", cap: "∩", wedge: "∧", land: "∧", vee: "∨", lor: "∨", oplus: "⊕", otimes: "⊗", setminus: "\\",
};
const RELATION = {
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", cong: "≅",
  propto: "∝", in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
  to: "→", rightarrow: "→", leftarrow: "←", gets: "←", Rightarrow: "⇒", implies: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", iff: "⇔", leftrightarrow: "↔", mapsto: "→", perp: "⊥", mid: "|", parallel: "||",
  ll: "≪", gg: "≫", coloneqq: ":=",
};
const ORDINARY = {
  infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", neg: "¬", lnot: "¬", emptyset: "∅",
  varnothing: "∅", aleph: "ℵ", Re: "ℜ", Im: "ℑ", wp: "℘", angle: "∠", therefore: "∴", prime: "′",
  ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", ell: "ℓ", hbar: "ℏ", degree: "°",
  langle: "\u2329", rangle: "\u232a", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", backslash: "\\",
  sum: "∑", prod: "∏", int: "∫", oint: "∮", bigcup: "∪", bigcap: "∩", surd: "√",
  "{": "{", "}": "}", "|": "||", "#": "#", "%": "%", "&": "&", _: "_", $: "$",
};
const FUNCTIONS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
  "log", "ln", "lg", "exp", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "arg",
  "dim", "ker", "deg", "gcd", "hom", "Pr", "mod",
]);
const IGNORED = new Set([
  "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr",
  "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits", "middle", "!", "notag", "nonumber",
]);
const ACCENT_CMDS = new Set(["hat", "bar", "tilde", "vec", "dot", "ddot", "overline", "underline", "widehat", "widetilde", "mathring", "check", "breve", "acute", "grave"]);
const THIN = "\u2009";
const NBSP = "\u00a0";

/**
 * Convert TeX math source to runs [{ t, f, s, r }].
 * style: { size, bold } ; warn(msg) is called for unsupported commands.
 */
export function mathToRuns(src, { size, bold = false }, warn) {
  const runs = [];
  const emit = (t, f, s, r) => {
    if (t.length === 0) return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.f === f && last.s === s && last.r === r) last.t += t;
    else runs.push({ t, f, s, r });
  };
  let i = 0;
  // previous atom class, to decide spacing and unary minus
  let prevClass = "open";

  const readArg = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return "";
    if (src[i] === "{") {
      let depth = 0;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === "\\") {
          i++;
          continue;
        }
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) {
          i++;
          return src.slice(start + 1, i - 1);
        }
      }
      throw new Error(`unbalanced braces in math: ${src}`);
    }
    if (src[i] === "\\") {
      const start = i++;
      if (/[A-Za-z]/.test(src[i] ?? "")) while (i < src.length && /[A-Za-z]/.test(src[i])) i++;
      else i++;
      return src.slice(start, i);
    }
    return src[i++];
  };
  const readOptional = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== "[") return null;
    const end = src.indexOf("]", i);
    if (end < 0) return null;
    const v = src.slice(i + 1, end);
    i = end + 1;
    return v;
  };
  const sub = (text, st) => {
    const inner = mathToRuns(text, st, warn);
    for (const r of inner) emit(r.t, r.f, r.s, r.r);
  };
  const letterFont = (st) => (st.bold ? "BI" : "I");
  const romanFont = (st) => (st.bold ? "B" : "R");
  const isSimple = (text) => /^\s*(\\?[A-Za-z]|[0-9.]+)\s*$/.test(text);

  const style = { size, bold, rise: 0 };
  const atom = (t, cls, font) => {
    if ((cls === "bin" || cls === "rel") && !(cls === "bin" && (prevClass === "open" || prevClass === "bin" || prevClass === "rel"))) {
      emit(NBSP, "R", style.size, style.rise);
      emit(t, font, style.size, style.rise);
      emit(NBSP, "R", style.size, style.rise);
    } else {
      emit(t, font, style.size, style.rise);
    }
    prevClass = cls;
  };

  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "^" || c === "_") {
      i++;
      const arg = readArg();
      const s = Math.max(5, style.size * 0.7);
      const rise = style.rise + (c === "^" ? style.size * 0.38 : -style.size * 0.18);
      const inner = mathToRuns(arg, { size: s, bold: style.bold }, warn);
      for (const r of inner) emit(r.t, r.f, r.s, rise + r.r);
      prevClass = "ord";
      continue;
    }
    if (c === "{") {
      sub(readArg(), { size: style.size, bold: style.bold });
      prevClass = "ord";
      continue;
    }
    if (c === "}") {
      i++;
      continue;
    }
    if (c === "\\") {
      i++;
      let name;
      if (/[A-Za-z]/.test(src[i] ?? "")) {
        const start = i;
        while (i < src.length && /[A-Za-z]/.test(src[i])) i++;
        name = src.slice(start, i);
      } else {
        name = src[i++] ?? "";
      }
      if (Object.hasOwn(GREEK, name)) atom(GREEK[name], "ord", "R");
      else if (Object.hasOwn(BINARY, name)) atom(BINARY[name], "bin", romanFont(style));
      else if (Object.hasOwn(RELATION, name)) atom(RELATION[name], "rel", romanFont(style));
      else if (Object.hasOwn(ORDINARY, name)) atom(ORDINARY[name], "ord", romanFont(style));
      else if (FUNCTIONS.has(name)) {
        atom(name, "ord", romanFont(style));
        emit(THIN, "R", style.size, style.rise);
      } else if (name === "," || name === ":" || name === ";" || name === " ") emit(THIN, "R", style.size, style.rise);
      else if (name === "quad") emit(THIN.repeat(4), "R", style.size, style.rise);
      else if (name === "qquad") emit(THIN.repeat(8), "R", style.size, style.rise);
      else if (IGNORED.has(name)) continue;
      else if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = readArg();
        const b = readArg();
        const wrap = (x) => (isSimple(x) ? x : `(${x})`);
        sub(`${wrap(a)}/${wrap(b)}`, { size: style.size, bold: style.bold });
        prevClass = "ord";
      } else if (name === "binom") {
        const a = readArg();
        const b = readArg();
        sub(`C(${a}, ${b})`, { size: style.size, bold: style.bold });
        prevClass = "ord";
      } else if (name === "sqrt") {
        const n = readOptional();
        const a = readArg();
        if (n !== null) sub(`{}^{${n}}`, { size: style.size, bold: style.bold });
        atom("√", "ord", "R");
        sub(isSimple(a) ? a : `(${a})`, { size: style.size, bold: style.bold });
      } else if (name === "text" || name === "textrm" || name === "mathrm" || name === "operatorname" || name === "mbox" || name === "textup") {
        const a = readArg();
        emit(a.replace(/\\([{}$%&#_])/g, "$1").replace(/ /g, name === "text" || name === "mbox" ? NBSP : ""), romanFont(style), style.size, style.rise);
        prevClass = "ord";
      } else if (name === "textit" || name === "mathit") {
        emit(readArg(), letterFont(style), style.size, style.rise);
        prevClass = "ord";
      } else if (name === "mathbf" || name === "textbf" || name === "boldsymbol" || name === "bm" || name === "mathbb") {
        sub(readArg(), { size: style.size, bold: true });
        prevClass = "ord";
      } else if (name === "mathcal" || name === "mathscr" || name === "mathfrak" || name === "mathsf" || name === "mathtt") {
        sub(readArg(), { size: style.size, bold: style.bold });
        prevClass = "ord";
      } else if (ACCENT_CMDS.has(name)) {
        sub(readArg(), { size: style.size, bold: style.bold });
        prevClass = "ord";
      } else if (name === "\\") {
        emit(NBSP + NBSP, "R", style.size, style.rise);
      } else {
        warn?.(`math command \\${name} is not supported; printed as text`);
        atom(name, "ord", romanFont(style));
      }
      continue;
    }
    i++;
    if (/[A-Za-z]/.test(c)) atom(c, "ord", letterFont(style));
    else if (/[0-9.]/.test(c)) atom(c, "ord", romanFont(style));
    else if (c === "+") atom("+", "bin", romanFont(style));
    else if (c === "-") atom("−", "bin", romanFont(style));
    else if (c === "*") atom("∗", "bin", romanFont(style));
    else if (c === "=" || c === "<" || c === ">") atom(c, "rel", romanFont(style));
    else if (c === ":") atom(":", "rel", romanFont(style));
    else if (c === "(" || c === "[") atom(c, "open", romanFont(style));
    else if (c === ")" || c === "]") atom(c, "close", romanFont(style));
    else if (c === ",") {
      atom(",", "punct", romanFont(style));
      emit(THIN, "R", style.size, style.rise);
      prevClass = "open";
    } else if (c === ";") {
      atom(";", "punct", romanFont(style));
      emit(THIN, "R", style.size, style.rise);
      prevClass = "open";
    } else if (c === "'") atom("′", "ord", romanFont(style));
    else if (c === "&") continue; // alignment points are dropped
    else if (c === "~") emit(NBSP, "R", style.size, style.rise);
    else atom(c, "ord", romanFont(style));
  }
  // TeX puts no operator space at the edges of a formula
  while (runs.length > 0 && runs[0].t.startsWith(NBSP)) {
    runs[0].t = runs[0].t.replace(/^\u00a0+/, "");
    if (runs[0].t.length === 0) runs.shift();
  }
  while (runs.length > 0 && runs[runs.length - 1].t.endsWith(NBSP)) {
    const last = runs[runs.length - 1];
    last.t = last.t.replace(/\u00a0+$/, "");
    if (last.t.length === 0) runs.pop();
  }
  return runs;
}
