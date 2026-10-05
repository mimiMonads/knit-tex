#!/usr/bin/env node
// Fetch and convert The Adventures of Tom Sawyer (Project Gutenberg #74).
// The plain-text download is cached next to the generated example.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_TXT = "https://www.gutenberg.org/cache/epub/74/pg74.txt";
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(here, "..", "examples", "tom-sawyer.tex"));
const cache = join(dirname(out), "cache", "pg74.txt");

async function download() {
  try {
    return await readFile(cache, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  const res = await fetch(URL_TXT);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${URL_TXT}`);
  const text = await res.text();
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(`${cache}.tmp`, text);
  await rename(`${cache}.tmp`, cache);
  return text;
}

const escapeTex = (s) =>
  s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&%#])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");

function convert(raw) {
  const start = raw.indexOf("*** START OF THE PROJECT GUTENBERG EBOOK");
  const end = raw.indexOf("*** END OF THE PROJECT GUTENBERG EBOOK");
  if (start < 0 || end < 0) throw new Error("Gutenberg START/END markers not found");
  let body = raw.slice(raw.indexOf("\n", start) + 1, end).replace(/\r\n/g, "\n");
  const firstChapter = body.search(/^CHAPTER I\.?$/m);
  if (firstChapter < 0) throw new Error('could not find standalone "CHAPTER I"');
  body = body.slice(firstChapter);

  const parts = [];
  let chapters = 0;
  let paragraphs = 0;
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.replace(/\s*\n\s*/g, " ").trim();
    if (text.length === 0) continue;
    const chapter = /^CHAPTER ([IVXLC]+)\.?$/.exec(text);
    if (chapter !== null) {
      chapters++;
      parts.push(`\\chapter*{Chapter ${chapter[1]}}`);
      continue;
    }
    if (/^THE END\.?$/i.test(text)) {
      parts.push("\\begin{center}\n\\textsc{The End}\n\\end{center}");
      continue;
    }
    const tex = escapeTex(text).replace(/_([^_]+)_/g, "\\emph{$1}").replace(/_/g, "\\_");
    parts.push(tex);
    paragraphs++;
  }
  if (chapters !== 35) throw new Error(`expected 35 chapters, found ${chapters}`);

  const doc = [
    "% The Adventures of Tom Sawyer, by Mark Twain (1876). Project Gutenberg eBook #74.",
    "% Converted by scripts/gutenberg-tom-sawyer.mjs; front matter before Chapter I is omitted.",
    "\\documentclass{book}",
    "\\title{The Adventures of Tom Sawyer}",
    "\\author{Mark Twain}",
    "\\date{1876}",
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
console.error(`${out}: ${chapters} chapters, ${paragraphs} paragraphs, ${doc.length} characters`);
