#!/usr/bin/env node
// Cold CLI runs: every sample is a fresh process, which is what a person
// running the command gets. Reports the CLI's own typesetting total (no
// runtime start-up or file I/O) and the whole process's wall time.
//
//   node scripts/bench-cli.mjs [input.tex] [--runs N] [--cli path/to/cli.mjs] [--json results.json]
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
const cli = resolve(opt("--cli", join(here, "..", "src", "cli.mjs")));
const jsonOut = opt("--json", null);
const input = resolve(argv[0] ?? join(here, "..", "examples", "pride-and-prejudice.tex"));
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer`);

const out = join(tmpdir(), `knit-tex-bench-cli-${process.pid}.pdf`);
const modes = [
  { label: "--host", args: ["--host"] },
  { label: "--threads 2", args: ["-t", "2"] },
  { label: "--threads 4", args: ["-t", "4"] },
  { label: "--threads auto", args: [] },
];
// Deno needs its subcommand and permissions; Node and Bun run the file directly.
const runtimeArgs = process.versions.deno ? ["run", "-A"] : [];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const results = [];
for (const mode of modes) {
  const totals = [];
  const walls = [];
  let executor = null;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const p = spawnSync(process.execPath, [...runtimeArgs, cli, input, "-o", out, ...mode.args], { encoding: "utf8" });
    walls.push(performance.now() - t0);
    const m = /^(.+): total ([\d.]+) ms/m.exec(p.stderr);
    if (p.status !== 0 || m === null) throw new Error(`${mode.label} failed (${p.status}):\n${p.stderr}`);
    executor = m[1];
    totals.push(Number(m[2]));
  }
  results.push({ mode: mode.label, executor, total: median(totals), wall: median(walls) });
  console.error(`${mode.label}: done`);
}
rmSync(out, { force: true });

const runtime = process.versions.bun
  ? `bun ${process.versions.bun}`
  : process.versions.deno
    ? `deno ${process.versions.deno}`
    : `node ${process.versions.node}`;
const lines = [
  `${input.split("/").pop()}: cold CLI, a fresh process per run, median of ${runs}; ${runtime}; ${availableParallelism()} cores`,
  "",
  "| mode | executor | typeset total | process wall time |",
  "|---|---|---:|---:|",
  ...results.map((r) => `| ${r.mode} | ${r.executor} | ${r.total.toFixed(0)} ms | ${r.wall.toFixed(0)} ms |`),
];
console.log(lines.join("\n"));
if (jsonOut !== null) writeFileSync(jsonOut, JSON.stringify({ input, cli, runtime, runs, cores: availableParallelism(), results }, null, 2));
