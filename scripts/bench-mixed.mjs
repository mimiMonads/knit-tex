#!/usr/bin/env node
// Benchmark one shuffled, deterministic 80/20 mix of paragraph jobs from two
// documents. Every pool sees the same selected jobs in the same order.
//
//   node scripts/bench-mixed.mjs [--runs N] [--seed N] [--json results.json]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { knittingExecutor } from "../src/engine.mjs";
import { planParagraphs } from "../src/layout.mjs";
import { parseTex } from "../src/parse.mjs";
import { segsOf } from "../src/wire.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const runs = Number(opt("--runs", "5"));
const seed = Number(opt("--seed", "1729"));
const jsonOut = opt("--json", null);
const prideFile = resolve(opt("--pride", join(here, "..", "examples", "pride-and-prejudice.tex")));
const sawyerFile = resolve(opt("--sawyer", join(here, "..", "examples", "tom-sawyer.tex")));
if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("--seed must be an integer from 0 to 4294967295");

const readSpecs = (file) => {
  const doc = parseTex(readFileSync(file, "utf8"), { file });
  return planParagraphs(doc.blocks).specs;
};
const prideSpecs = readSpecs(prideFile);
const sawyerSpecs = readSpecs(sawyerFile);
if (prideSpecs.length === 0 || sawyerSpecs.length === 0) throw new Error("both inputs must contain paragraph tasks");

function mulberry32(initial) {
  let state = initial >>> 0;
  return () => {
    let t = state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const random = mulberry32(seed);
// Keep the baseline close to the Pride-only task count while making 80/20
// exact: the total must be divisible by five.
const totalTasks = Math.floor(prideSpecs.length / 5) * 5;
const prideCount = totalTasks * 0.8;
const sawyerCount = totalTasks * 0.2;
if (sawyerCount > sawyerSpecs.length) throw new Error("Tom Sawyer does not have enough unique paragraph tasks for an 80/20 sample");
const selected = [
  ...shuffled(prideSpecs, random).slice(0, prideCount).map((spec) => ({ source: "Pride and Prejudice", spec })),
  ...shuffled(sawyerSpecs, random).slice(0, sawyerCount).map((spec) => ({ source: "Tom Sawyer", spec })),
];
const workload = shuffled(selected, random);
const textLengths = workload.map(({ spec }) => spec.runs.reduce((n, run) => n + run.t.length, 0)).sort((a, b) => a - b);
const quantile = (p) => textLengths[Math.floor((textLengths.length - 1) * p)];

/** Longest gaps between 1 ms timer ticks and the 99th percentile of the gaps. */
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

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
// knitting results keep each line's segs packed (src/wire.mjs); hash the plain form
const plain = (r) => ({
  lines: r.lines.map((l) => ({ x: l.x, segs: segsOf(l.segs) })),
  label: r.label === null ? null : { w: r.label.w, segs: segsOf(r.label.segs) },
  stats: r.stats,
});
const hashResults = (results) => {
  const hash = createHash("sha256");
  for (const result of results) hash.update(JSON.stringify(plain(result))).update("\n");
  return hash.digest("hex");
};

async function runBatch(executor) {
  const stopProbe = stallProbe();
  const wall0 = performance.now();
  const cpu0 = process.cpuUsage();
  const results = await Promise.all(workload.map(({ spec }) => executor.setParagraph(spec)));
  const wall = performance.now() - wall0;
  const cpu = process.cpuUsage(cpu0);
  const stalls = stopProbe();
  const cpuMs = (cpu.user + cpu.system) / 1000;
  return {
    wall,
    cpu: cpuMs,
    cpuPercent: (cpuMs / wall) * 100,
    stallMax: stalls.max,
    stallP99: stalls.p99,
    hash: hashResults(results),
  };
}

const results = [];
let referenceHash = null;
const supportsPiscina = process.versions.bun === undefined;

async function recordConfig({ config, threads, scheduler, stealing, makeExecutor }) {
  const coldStart = performance.now();
  const executor = await makeExecutor();
  try {
    const first = await runBatch(executor);
    const cold = performance.now() - coldStart;
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await runBatch(executor));
    const hashes = new Set([first.hash, ...samples.map((sample) => sample.hash)]);
    referenceHash ??= first.hash;
    const row = {
      config,
      threads,
      scheduler,
      stealing,
      cold,
      total: median(samples.map((sample) => sample.wall)),
      cpu: median(samples.map((sample) => sample.cpu)),
      cpuPercent: median(samples.map((sample) => sample.cpuPercent)),
      stallMax: median(samples.map((sample) => sample.stallMax)),
      stallP99: median(samples.map((sample) => sample.stallP99)),
      identical: hashes.size === 1 && hashes.has(referenceHash),
    };
    results.push(row);
    console.error(`${config}: done`);
  } finally {
    await executor.close();
  }
}

async function piscinaExecutor(threads) {
  const { default: Piscina } = await import("piscina");
  const pool = new Piscina({
    filename: new URL("./piscina-worker.mjs", import.meta.url).href,
    minThreads: threads,
    maxThreads: threads,
    concurrentTasksPerWorker: 1,
  });
  return {
    setParagraph: (spec) => pool.run(spec, { name: "setParagraphTask" }),
    close: () => pool.destroy(),
  };
}

for (let threads = 1; threads <= 4; threads++) {
  for (const stealing of [true, false]) {
    await recordConfig({
      config: `knitting x${threads}, stealing ${stealing ? "on" : "off"}`,
      threads,
      scheduler: "knitting",
      stealing,
      makeExecutor: () => knittingExecutor(threads, { host: { steal: stealing } }),
    });
  }
  if (supportsPiscina) {
    await recordConfig({
      config: `piscina x${threads}, shared FIFO queue`,
      threads,
      scheduler: "piscina-fifo",
      stealing: null,
      makeExecutor: () => piscinaExecutor(threads),
    });
  }
}

const base = results.find((row) => row.threads === 1 && row.stealing).total;
const fmt = (value) => value.toFixed(0);
const lines = [
  `mixed paragraph batch: ${workload.length} tasks, seed ${seed}, median of ${runs} warm runs; ${availableParallelism()} available CPUs`,
  `Pride and Prejudice: ${prideCount} tasks (${(100 * prideCount / workload.length).toFixed(1)}%); Tom Sawyer: ${sawyerCount} tasks (${(100 * sawyerCount / workload.length).toFixed(1)}%)`,
  `paragraph text length: p50 ${quantile(0.5)} chars, p99 ${quantile(0.99)} chars, max ${textLengths.at(-1)} chars`,
  "",
  "| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |",
  "|---|---:|---:|---:|---:|---:|---:|---:|:---:|",
  ...results.map((row) => `| ${row.config} | ${fmt(row.cold)} ms | ${fmt(row.total)} ms | ${(base / row.total).toFixed(2)}x | ${fmt(row.cpu)} ms | ${row.cpuPercent.toFixed(1)}% | ${row.stallMax.toFixed(1)} ms | ${row.stallP99.toFixed(1)} ms | ${row.identical ? "yes" : "NO"} |`),
];
console.log(lines.join("\n"));
if (jsonOut !== null) {
  writeFileSync(jsonOut, JSON.stringify({ prideFile, sawyerFile, seed, runs, workload: { total: workload.length, pride: prideCount, sawyer: sawyerCount, p50Chars: quantile(0.5), p99Chars: quantile(0.99), maxChars: textLengths.at(-1) }, results }, null, 2));
}
if (results.some((row) => !row.identical)) {
  console.error("bench-mixed: worker configurations produced different paragraph results");
  process.exitCode = 1;
}
