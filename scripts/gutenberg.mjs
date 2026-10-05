#!/usr/bin/env node
// Fetch Pride and Prejudice from Project Gutenberg (public domain) and convert
// it to the LaTeX subset knit-tex reads. The download is cached next to the
// output, so later runs are offline.
//
//   node scripts/gutenberg.mjs [out.tex]
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const URL_TXT = "https://www.gutenberg.org/cache/epub/1342/pg1342.txt";
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(here, "..", "examples", "pride-and-prejudice.tex"));
const cache = join(dirname(out), "cache", "pg1342.txt");

async function download() {
  try {
    return await readFile(cache, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  let lastError;
  for (const delay of [0, 2000, 4000, 8000]) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(URL_TXT);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${URL_TXT}`);
      const text = await res.text();
      await mkdir(dirname(cache), { recursive: true });
      await writeFile(`${cache}.tmp`, text);
      await rename(`${cache}.tmp`, cache);
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`could not download ${URL_TXT}`, { cause: lastError });
}

/** Drop [Illustration ...] blocks, which nest brackets and span lines. */
function stripIllustrations(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("[Illustration", i);
    if (at < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, at);
    let depth = 0;
    let j = at;
    for (; j < text.length; j++) {
      if (text[j] === "[") depth++;
      else if (text[j] === "]" && --depth === 0) break;
    }
    if (depth !== 0) throw new Error(`unterminated [Illustration at offset ${at}`);
    i = j + 1;
  }
  return out;
}

const escapeTex = (s) =>
  s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&%#])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");

let rejoined = 0;

function convert(raw) {
  const start = raw.indexOf("*** START OF THE PROJECT GUTENBERG EBOOK");
  const end = raw.indexOf("*** END OF THE PROJECT GUTENBERG EBOOK");
  if (start < 0 || end < 0) throw new Error("Gutenberg START/END markers not found; the file format changed");
  let body = raw.slice(raw.indexOf("\n", start) + 1, end).replace(/\r\n/g, "\n");
  // The novel starts at the illustration that carries "Chapter I."
  const first = body.indexOf("Chapter I.]");
  if (first < 0) throw new Error('could not find "Chapter I." in the text');
  body = "CHAPTER I.\n\n" + body.slice(first + "Chapter I.]".length);
  body = stripIllustrations(body);

  // An illustration inside a paragraph leaves blank lines behind; rejoin a
  // block that stops mid-sentence with a following block that starts in lower case.
  const blocks = [];
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.replace(/\s*\n\s*/g, " ").trim();
    if (text.length === 0) continue;
    const prev = blocks[blocks.length - 1];
    if (prev !== undefined && !/^(CHAPTER|Chapter) /.test(prev) && !/[.!?:;\u201d\u2019)\]_]$/.test(prev) && /^\p{Ll}/u.test(text)) {
      blocks[blocks.length - 1] = `${prev} ${text}`;
      rejoined++;
      continue;
    }
    blocks.push(text);
  }

  const parts = [];
  let chapters = 0;
  let paragraphs = 0;
  for (const text of blocks) {
    // one heading (XLVI) is set in title case in the Gutenberg text
    const ch = /^(?:CHAPTER|Chapter) ([IVXLC]+)\.?$/.exec(text);
    if (ch !== null) {
      chapters++;
      parts.push(`\\chapter*{Chapter ${ch[1]}}`);
      continue;
    }
    if (/^THE END\.?$/i.test(text)) {
      parts.push("\\begin{center}\n\\textsc{The End}\n\\end{center}");
      continue;
    }
    // _italic_ spans inside the paragraph; escape everything else
    // Gutenberg writes an em dash as "--", which TeX would read as an en dash
    const tex = escapeTex(text.replace(/--/g, "\u2014")).replace(/_([^_]+)_/g, "\\emph{$1}").replace(/_/g, "\\_");
    parts.push(tex);
    paragraphs++;
  }
  if (chapters !== 61) throw new Error(`expected 61 chapters, found ${chapters}`);
  const doc = [
    "% Pride and Prejudice, by Jane Austen (1813). Text from Project Gutenberg eBook #1342.",
    "% Converted by scripts/gutenberg.mjs; Project Gutenberg's front matter and illustrations are omitted.",
    "\\documentclass{book}",
    "\\title{Pride and Prejudice}",
    "\\author{Jane Austen}",
    "\\date{1813}",
    "\\begin{document}",
    "\\maketitle",
    "",
    parts.join("\n\n"),
    "",
    "\\end{document}",
    "",
  ].join("\n");
  return { doc, chapters, paragraphs };
}

const raw = await download();
const { doc, chapters, paragraphs } = convert(raw);
await mkdir(dirname(out), { recursive: true });
await writeFile(`${out}.tmp`, doc);
await rename(`${out}.tmp`, out);
console.error(`${out}: ${chapters} chapters, ${paragraphs} paragraphs (${rejoined} rejoined after illustrations), ${doc.length} characters`);
