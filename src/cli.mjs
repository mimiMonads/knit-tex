#!/usr/bin/env node
// knit-tex <input.tex> [-o out.pdf] [-t N | --host] [--check] [--quiet]
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { typeset } from "./engine.mjs";

const USAGE = `usage: knit-tex <input.tex> [options]

  -o, --out FILE     output PDF (default: input name with .pdf)
  -t, --threads N    worker threads, or "auto" (default): a pool of cores - 1
                     for documents with 400+ paragraphs, else the main thread
      --host         typeset on the main thread only
      --check        typeset on the host and on the pool, require identical bytes
  -q, --quiet        no warnings or stats
  -h, --help         show this help`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { input: null, out: null, threads: "auto", host: false, check: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (a === "-o" || a === "--out") o.out = value();
    else if (a === "-t" || a === "--threads") {
      const v = value();
      o.threads = v === "auto" ? "auto" : Number(v);
      if (o.threads !== "auto" && (!Number.isInteger(o.threads) || o.threads < 1 || o.threads > 64)) throw new UsageError(`--threads must be "auto" or an integer from 1 to 64`);
    } else if (a === "--host") o.host = true;
    else if (a === "--check") o.check = true;
    else if (a === "-q" || a === "--quiet") o.quiet = true;
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
    else if (o.input === null) o.input = a;
    else throw new UsageError(`unexpected argument ${a}`);
  }
  if (o.input === null) throw new UsageError("missing input file");
  o.out ??= join(dirname(o.input), basename(o.input, extname(o.input)) + ".pdf");
  return o;
}

/** Write via a temp file + rename so a failed run never leaves a truncated PDF. */
async function writeAtomic(path, bytes) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

const ms = (v) => `${v.toFixed(1)} ms`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const inputPath = resolve(o.input);
  const source = await readFile(inputPath, "utf8");
  const common = { file: inputPath, readFile: (p) => readFileSync(p, "utf8") };
  const cores = Math.max(1, availableParallelism() - 1);
  const run = await typeset(source, { ...common, threads: o.host ? 0 : o.threads, autoThreads: cores });
  if (o.check) {
    // compare against the other side: the pool if we ran on the host, the host otherwise
    const otherThreads = run.executor === "main thread" ? (o.threads === "auto" ? cores : o.threads) : 0;
    const other = await typeset(source, { ...common, threads: otherThreads });
    const a = Buffer.from(run.pdf);
    const b = Buffer.from(other.pdf);
    if (!a.equals(b)) throw new Error(`parity check failed: host and pool produced different PDFs (${a.length} vs ${b.length} bytes)`);
    if (!o.quiet) console.error(`parity: ${run.executor} and ${other.executor} produced identical ${a.length}-byte PDFs`);
  }
  await writeAtomic(o.out, run.pdf);
  if (!o.quiet) {
    for (const w of run.warnings) console.error(`warning: ${w}`);
    const s = run.stats;
    console.error(
      `${o.out}: ${s.pages} pages, ${s.paragraphs} paragraphs, ${s.lines} lines, ${s.hyphens} hyphenated, ${s.overfull} overfull` +
        (s.missing > 0 ? `, ${s.missing} unencodable characters` : ""),
    );
    const t = run.timings;
    const mode = run.executor;
    console.error(
      `${mode}: total ${ms(t.total)} (parse ${ms(t.parse)}` +
        (t.poolStart !== undefined ? `, pool start ${ms(t.poolStart)}` : "") +
        `, paragraphs ${ms(t.paragraphs)}, layout ${ms(t.layout)}, render ${ms(t.render)}, write ${ms(t.write)})`,
    );
  }
}

main().catch((e) => {
  if (e instanceof UsageError) {
    console.error(`knit-tex: ${e.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  let msg = `knit-tex: ${e?.message ?? e}`;
  for (let c = e?.cause; c !== undefined && c !== null; c = c?.cause) {
    msg += `\n  caused by: ${c instanceof Error ? c.stack ?? c.message : String(c)}`;
    if (!(c instanceof Error)) break;
  }
  console.error(msg);
  process.exitCode = 1;
});
