#!/usr/bin/env node
// Typeset one document on the main thread, on knitting pools and on piscina
// pools. Reports wall time, CPU time, CPU use and how long the main thread was
// unresponsive, and requires every configuration to produce identical bytes.
//
//   node scripts/bench.mjs [input.tex] [--runs N] [--json results.json]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hostExecutor, knittingExecutor, typeset } from "../src/engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const runs = Number(opt("--runs", "5"));
const jsonOut = opt("--json", null);
const only = opt("--only", null); // run configurations whose label contains this
const input = resolve(argv[0] ?? join(here, "..", "examples", "pride-and-prejudice.tex"));
const source = readFileSync(input, "utf8");
const maxThreads = Math.min(4, Math.max(1, availableParallelism() - 1));
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer`);

/** Longest gaps between 1 ms timer ticks: how long a request would have waited. */
function stallProbe() {
  const gaps = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
  }, 1);
  return () => {
    clearInterval(timer);
    gaps.push(performance.now() - last);
    gaps.sort((a, b) => a - b);
    return { max: gaps[gaps.length - 1], p99: gaps[Math.floor(gaps.length * 0.99)] };
  };
}

async function piscinaExecutor(threads, tasksPerWorker) {
  const { default: Piscina } = await import("piscina");
  const pool = new Piscina({
    filename: new URL("./piscina-worker.mjs", import.meta.url).href,
    minThreads: threads,
    maxThreads: threads,
    concurrentTasksPerWorker: tasksPerWorker,
  });
  return {
    name: `piscina x${threads}${tasksPerWorker > 1 ? `, ${tasksPerWorker} tasks/worker` : ""}`,
    setParagraph: (spec) => pool.run(spec, { name: "setParagraphTask" }),
    renderPage: (page) => pool.run(page, { name: "renderPageTask" }),
    close: () => pool.destroy(),
  };
}

const configs = [
  { label: "main thread", make: async () => hostExecutor() },
  ...Array.from({ length: maxThreads }, (_, k) => ({ label: `knitting x${k + 1}`, make: () => knittingExecutor(k + 1) })),
  ...Array.from({ length: maxThreads }, (_, k) => ({ label: `piscina x${k + 1}`, make: () => piscinaExecutor(k + 1, 1) })),
  { label: `piscina x${maxThreads}, 32/worker`, make: () => piscinaExecutor(maxThreads, 32) },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const results = [];
let reference = null;
let docStats = null;
for (const cfg of configs) {
  if (only !== null && !cfg.label.includes(only)) continue;
  const coldStart = performance.now();
  const executor = await cfg.make();
  let first;
  try {
    first = await typeset(source, { file: input, executor });
    const cold = performance.now() - coldStart;
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const probe = stallProbe();
      const wall0 = performance.now();
      const cpu0 = process.cpuUsage();
      const res = await typeset(source, { file: input, executor });
      const wall = performance.now() - wall0;
      const cpu = process.cpuUsage(cpu0);
      const stall = probe();
      const cpuMs = (cpu.user + cpu.system) / 1000;
      samples.push({ total: res.timings.total, paragraphs: res.timings.paragraphs, render: res.timings.render, cpu: cpuMs, cpuPercent: (cpuMs / wall) * 100, stallMax: stall.max, stallP99: stall.p99, hash: sha(res.pdf) });
    }
    const hashes = new Set([sha(first.pdf), ...samples.map((s) => s.hash)]);
    reference ??= sha(first.pdf);
    docStats ??= first.stats;
    const row = {
      config: cfg.label,
      cold,
      total: median(samples.map((s) => s.total)),
      paragraphs: median(samples.map((s) => s.paragraphs)),
      render: median(samples.map((s) => s.render)),
      cpu: median(samples.map((s) => s.cpu)),
      cpuPercent: median(samples.map((s) => s.cpuPercent)),
      stallMax: median(samples.map((s) => s.stallMax)),
      stallP99: median(samples.map((s) => s.stallP99)),
      identical: hashes.size === 1 && hashes.has(reference),
    };
    results.push(row);
    console.error(`${cfg.label}: done`);
  } finally {
    // piscina 5's destroy() never settles on Bun 1.3; report it instead of hanging
    const closed = await Promise.race([
      Promise.resolve(executor.close()).then(() => true),
      new Promise((r) => setTimeout(() => r(false), 5000).unref?.()),
    ]);
    if (!closed) {
      const row = results.find((r) => r.config === cfg.label);
      if (row !== undefined) row.note = "close() did not settle within 5 s";
      console.error(`${cfg.label}: close() did not settle within 5 s`);
    }
  }
}

const base = results[0].total;
const f = (v) => v.toFixed(0);
const lines = [
  `${input.split("/").pop()}: ${docStats.pages} pages, ${docStats.paragraphs} paragraphs, ${docStats.lines} lines; median of ${runs} warm runs; ${availableParallelism()} cores`,
  "",
  "| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|",
  ...results.map((r) => `| ${r.config}${r.note ? ` (${r.note})` : ""} | ${f(r.cold)} ms | ${f(r.total)} ms | ${(base / r.total).toFixed(2)}x | ${f(r.paragraphs)} ms | ${f(r.render)} ms | ${f(r.cpu)} ms | ${r.cpuPercent.toFixed(1)}% | ${r.stallMax.toFixed(1)} ms | ${r.stallP99.toFixed(1)} ms | ${r.identical ? "yes" : "NO"} |`),
];
console.log(lines.join("\n"));
if (jsonOut !== null) writeFileSync(jsonOut, JSON.stringify({ input, runs, cores: availableParallelism(), results }, null, 2));
if (results.some((r) => !r.identical)) {
  console.error("bench: configurations produced different PDFs");
  process.exitCode = 1;
}
// a pool whose close() hung may keep the process alive
process.exit(process.exitCode ?? 0);
