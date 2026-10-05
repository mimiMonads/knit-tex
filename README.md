# knit-tex

A small TeX-flavoured typesetter in JavaScript. It reads a subset of LaTeX and
writes a PDF, using Knuth–Plass line breaking for justified paragraphs and
Liang's patterns for English hyphenation. Paragraph setting and page rendering
can run on a [knitting](https://knittingdocs.netlify.app) worker pool.

No TeX installation or external font files are needed. Requires Node 22+;
the saved benchmarks cover Node 24.19.0 and Bun 1.4.0. The project pins
knitting 0.1.73 (`@vixeny/knitting`) through JSR's npm registry.

## Quick start

```sh
npm install
node src/cli.mjs examples/demo.tex
node src/cli.mjs examples/demo.tex --check
npm run novel
```

The first typesetting command writes `examples/demo.pdf`. `--check` also typesets the input
with the other executor and requires byte-identical host and pool PDFs in the
same runtime. `npm run novel` downloads and typesets *Pride and Prejudice*.
`.npmrc` configures the `@jsr` registry used during installation.

Useful CLI options:

| option | behaviour |
|---|---|
| `-o FILE` | Choose the output PDF path. |
| `--host` | Run entirely on the main thread. |
| `--threads N` | Use a knitting pool with N workers. |
| `--threads auto` (default) | Use the main thread below 400 paragraph tasks; otherwise use available CPUs minus one (at least one worker). |
| `--check` | Compare host and pool PDF bytes before writing. |

The automatic threshold is a heuristic. Pool startup can outweigh the benefit
for small documents; services can reuse an executor to keep the pool warm.
The CLI creates its pool before parsing, so workers boot while the main thread
parses. With `auto`, a source with 400+ blank-line-separated chunks starts one
early; if parsing then finds fewer paragraph tasks, it is closed again.

## What it supports

| area | supported features |
|---|---|
| Structure | Titles, authors, abstracts, chapters, section levels, numbered/starred headings and PDF bookmarks. |
| Text | Emphasis, bold, italic, monospace, small caps, size commands, ligatures, accents and TeX punctuation. |
| Environments | Lists, descriptions, quotations, verse, alignment, verbatim, simplified tables, captions and bibliographies with `\cite`. |
| Math | Inline/display math, `equation`, `align`, Greek letters, operators, smaller raised/lowered scripts and equation numbering. |
| References | `\label`, `\ref`, `\eqref` and footnotes collected as endnotes. |
| Macros | `\newcommand`/`\renewcommand` with arguments and optional defaults, `\def` and `\let`. |
| Spacing and files | Line/page breaks, vertical spacing, fill glue, `\input` and `\include`. |

This is a LaTeX subset. Packages and document classes are accepted but do not
change the layout; images are unsupported, and `tabular` becomes centred rows.
Unsupported commands generally keep their argument text or are ignored, with a
warning once per command. Parser errors include `file:line`.
See [`examples/demo.tex`](examples/demo.tex) for a feature tour.

## How it works

```text
LaTeX source
  → parse and plan paragraphs (main thread)
  → set paragraphs (one worker task per paragraph)
  → stack lines onto pages (main thread)
  → render PDF streams (one worker task per page)
  → assemble PDF objects and write the file (main thread)
```

The pool starts before parsing, so workers load their modules, font metrics
and hyphenation patterns while the main thread parses. knitting sends plain
objects and arrays as JSON, which is how the small paragraph specs travel. Set
paragraphs and pages are mostly positioned word segments (122k in *Pride and
Prejudice*), so they cross as knitting `Envelope`s instead, with numbers in a
`Float64Array` body and text in the header ([`src/wire.mjs`](src/wire.mjs)).
Layout passes the packed segments through without reading them.

Justified paragraphs use boxes, glue and penalties, four fitness classes, and
hyphenation demerits. Line breaking tries a pass without hyphenation (tolerance
100), then with hyphenation (200), then an emergency pass with 3em extra stretch
and a relaxed tolerance. Overfull lines are allowed when needed to finish a
paragraph. Left, right and centred text use greedy line breaking.

Text uses standard PDF fonts with Adobe AFM metrics and kerning. US English
hyphenation patterns use left/right minima of 2/3. Characters outside WinAnsi
fall back to Symbol where supported, then a stand-in or `?`; missing characters
are counted in the CLI summary.

The PDF writer adds no timestamps. The benchmarks compare PDF hashes within
each runtime; they do not establish byte equality across runtimes, where
compression can differ. Date-dependent input such as `\today` also affects
output.

## Benchmarks

### What the results show

On the recorded four-core machine, knitting x4 reduced warm *Pride and
Prejudice* typesetting time by **46% on Node** and **43% on Bun** relative to
the main thread (1.86× and 1.77× speedup). That used **1.71× and 2.08× as much
CPU time**, respectively. Cold knitting x4 runs were slightly slower than the
main thread on both runtimes.

Both pool implementations reduced the longest main-thread timer gap. Piscina
with one task per worker had lower p99 timer gaps than knitting at x2–x4: at
x4, 4.5 versus 7.9 ms on Node and 6.4 versus 8.0 ms on Bun. Piscina's
32-tasks-per-worker setting improved completion time but increased stalls. The choice depends on whether completion time, CPU cost or
responsiveness matters most for the application.

Work stealing helped the Node x4 mixed paragraph batch in all three recorded
seeds. Full-document results and Bun mixed results were less consistent. These
measurements support gains for specific workloads and settings, rather than a
general claim that one scheduler is always faster.

### Method and limits

- Intel Core i5-1135G7: 4 physical cores / 8 logical CPUs. knitting 0.1.73,
  Piscina 5.3.2; runtime versions are listed with each table.
- One cold run per configuration, including executor creation, then five warm
  runs on that executor. Each column is a separate median. Full-document time
  excludes file I/O; mixed time covers only paragraph submission and completion.
- Both pools use the same typesetting functions and input. Piscina uses fixed
  worker counts, with one concurrent task per worker or the separately labelled
  32-task setting. More in-flight tasks do not add CPU cores. Knitting uses its
  defaults unless stealing is disabled.
- Payloads differ by pool. knitting's set paragraphs and pages cross as
  `Envelope`s ([`src/wire.mjs`](src/wire.mjs)), while Piscina structured-clones
  the plain objects. Piscina comparisons therefore include that codec.
- `bench-cli.mjs` starts a fresh process for every run, so each one includes
  runtime start-up, imports and JIT warm-up. Its reports also give the CLI's
  own typesetting total, which excludes start-up and file I/O.
- Configurations run in fixed order in a shared process. Cold runs are not
  isolated fresh-process tests. Knitting prewarms fonts and hyphenation at
  worker import; Piscina's wrapper does not, so setup differences affect cold times.
- Saved reports contain medians, without raw samples or confidence intervals.
  Five runs on one machine cannot establish significance or a universal noise
  threshold. Each mixed seed changes both the sampled tasks and their order.

**Metrics:** speedup = main-thread warm time / measured warm time; time saved =
`100 × (baseline − measured) / baseline`. CPU time sums process user and system
CPU time, including workers. CPU use in the full reports divides CPU time by
elapsed time (100% ≈ one logical CPU).

Stalls are gaps between nominal 1 ms timer ticks, including the final partial
gap: a responsiveness proxy, rather than measured request latency. A fully
blocked run can yield only one gap, making p99 equal to its maximum.

### Full document: Pride and Prejudice

61 chapters, 2,118 paragraph tasks, 8,639 lines, 216 pages. All recorded cold
and warm PDFs matched the reference hash within each runtime. Times are in ms;
**max gap** and **p99 gap** are the median timer-stall statistics.

**Node 24.19.0**

| configuration | cold | warm | speedup | CPU time | max gap | p99 gap |
|---|---:|---:|---:|---:|---:|---:|
| main thread | 606 | 427 | 1.00× | 509 | 427.2 | 427.2 |
| knitting x1 | 760 | 448 | 0.95× | 578 | 51.3 | 2.6 |
| knitting x2 | 588 | 307 | 1.39× | 678 | 55.4 | 4.2 |
| knitting x3 | 549 | 250 | 1.71× | 755 | 59.4 | 7.9 |
| knitting x4 | 632 | 229 | 1.86× | 871 | 60.7 | 7.9 |
| piscina x1 | 869 | 654 | 0.65× | 775 | 62.2 | 2.7 |
| piscina x2 | 608 | 432 | 0.99× | 878 | 66.0 | 2.7 |
| piscina x3 | 593 | 376 | 1.13× | 1029 | 61.3 | 3.6 |
| piscina x4 | 652 | 345 | 1.24× | 1204 | 68.9 | 4.5 |
| piscina x4, 32 tasks/worker | 598 | 317 | 1.34× | 1209 | 97.5 | 87.6 |

Full report: [Node 24.19.0](output/bench/node-24.19.md) ([JSON](output/bench/node-24.19.json)).

**Bun 1.4.0**

| configuration | cold | warm | speedup | CPU time | max gap | p99 gap |
|---|---:|---:|---:|---:|---:|---:|
| main thread | 580 | 449 | 1.00× | 607 | 450.0 | 450.0 |
| knitting x1 | 690 | 459 | 0.98× | 649 | 52.4 | 2.5 |
| knitting x2 | 543 | 312 | 1.44× | 842 | 56.8 | 4.3 |
| knitting x3 | 546 | 267 | 1.68× | 957 | 53.4 | 6.2 |
| knitting x4 | 593 | 254 | 1.77× | 1266 | 52.4 | 8.0 |
| piscina x1 | 894 | 682 | 0.66× | 854 | 48.3 | 1.4 |
| piscina x2 | 631 | 446 | 1.01× | 1000 | 63.8 | 2.6 |
| piscina x3 | 586 | 387 | 1.16× | 1164 | 62.7 | 3.7 |
| piscina x4 | 631 | 362 | 1.24× | 1416 | 64.1 | 6.4 |
| piscina x4, 32 tasks/worker | 608 | 343 | 1.31× | 1497 | 85.6 | 74.4 |

Full report: [Bun 1.4.0](output/bench/bun-1.4.0.md) ([JSON](output/bench/bun-1.4.0.json)).

At x4, knitting used 34% less warm time than Piscina's one-task-per-worker
setting on Node and 30% less on Bun. Against Piscina's 32-task setting, the
reductions were 28% and 26%. Those are whole-implementation comparisons that
include knitting's payload codec; they do not isolate work stealing. One
knitting worker was slightly slower than the main thread on both runtimes
(448 versus 427 ms on Node, 459 versus 449 ms on Bun). Parsing, page layout
and PDF assembly remain on the main thread and limit parallel speedup.

### Cold CLI runs

`bench.mjs` reuses one executor per configuration, so it measures neither a
fresh process nor the pool starting before parsing. `bench-cli.mjs` starts a
fresh process for every run, as a person running the CLI gets. Median process
wall time over five *Pride and Prejudice* runs, in ms:

| mode | Node 24.19.0 | Bun 1.4.0 |
|---|---:|---:|
| `--host` | 658 | 632 |
| `--threads 2` | 756 | 630 |
| `--threads 4` | 807 | 710 |
| `--threads auto` (7 workers here) | 1044 | 980 |

For a single cold run, pools were slower than `--host` on Node; on Bun, two
workers roughly matched it. `auto` uses available CPUs minus one, which is
seven workers on this 4-core/8-thread machine, and was the slowest mode on both
runtimes: every worker warms up its own copy of the code. Pools pay off when an
executor is reused. Reports: [Node](output/bench/node-24.19-cli.md),
[Bun](output/bench/bun-1.4.0-cli.md).

### Work stealing: full documents

The benchmark was repeated with `KNITTING_STEAL=0`. Tom Sawyer has 1,898
paragraph tasks and 130 pages, versus Pride's 2,118 tasks and 216 pages.
Its typical paragraph is shorter (median 84 versus 203 characters); text
length alone does not establish task execution cost.

The table shows warm x4 time in ms; x1–x3, CPU and stalls are in the linked
reports. Positive time saved means stealing on completed sooner.

| document | runtime | stealing on | stealing off | time saved with stealing |
|---|---|---:|---:|---:|
| Pride and Prejudice | Node | 229 | 248 | +7.8% |
| Pride and Prejudice | Bun | 254 | 289 | +12.0% |
| Tom Sawyer | Node | 145 | 141 | -2.4% |
| Tom Sawyer | Bun | 194 | 173 | -12.4% |

Stealing was slower on Tom Sawyer at x2–x4 on Node and at every worker count
on Bun (by 0.5–12.4%); Pride results varied by worker count. The x1 control
differed by up to 5.9% despite having no other worker to steal from. These
runs do not establish a reliable full-document throughput gain from stealing.

Reports (on / off):
[Pride, Node](output/bench/node-24.19.md) / [off](output/bench/node-24.19-no-steal.md),
[Pride, Bun](output/bench/bun-1.4.0.md) / [off](output/bench/bun-1.4.0-no-steal.md),
[Tom Sawyer, Node](output/bench/node-24.19-sawyer.md) / [off](output/bench/node-24.19-sawyer-no-steal.md),
[Tom Sawyer, Bun](output/bench/bun-1.4.0-sawyer.md) / [off](output/bench/bun-1.4.0-sawyer-no-steal.md).

### Work stealing: mixed paragraph batch

Each seed samples 1,692 distinct Pride paragraphs and 423 distinct Tom Sawyer
paragraphs without replacement, then shuffles the 2,115 tasks. The mix is 80/20
by task count, not text size or CPU cost. Every configuration for that seed
receives the same tasks in the same order. Parsing, page layout and rendering
are excluded, so these gains cannot be applied directly to full PDFs.

Warm x4 batch times are in ms. The Piscina baseline here uses one task per
worker and is recorded only on Node.

| runtime | seed | stealing on | stealing off | time saved with stealing | Piscina |
|---|---:|---:|---:|---:|---:|
| Node 24.19.0 | 1729 | 108 | 141 | +23.3% | 163 |
| Node 24.19.0 | 31415 | 114 | 126 | +9.7% | 168 |
| Node 24.19.0 | 271828 | 119 | 145 | +17.8% | 166 |
| Bun 1.4.0 | 1729 | 142 | 159 | +10.3% | — |
| Bun 1.4.0 | 31415 | 134 | 162 | +17.5% | — |
| Bun 1.4.0 | 271828 | 157 | 148 | -5.5% | — |

Node x4 saved 9.7–23.3% of batch time with stealing, with lower p99 gaps in
all three seeds. CPU time was lower in two seeds and about equal in the third;
higher CPU utilisation does not necessarily mean more total CPU work. Bun's
x4 time savings ranged from −5.5% to +17.5%, and p99 gaps improved in one seed.
At x2/x3, the on/off effect changed direction across seeds.

Against Piscina, knitting with stealing saved 23.3–33.7% of batch time across
Node x2–x4 and the three seeds. Batch time includes unpacking knitting's
`Envelope` results on the main thread. At x4, p99 gaps were similar: 2.1–3.5 ms
for knitting with stealing and 2.4–2.9 ms for Piscina, with knitting lower in
two of the three seeds. This compares whole pool implementations; the knitting
on/off comparison more directly tests the stealing setting. All recorded
configurations returned identical paragraph result hashes (knitting results
are compared after unpacking), although this benchmark has no main-thread
reference.

Full reports include all worker counts, cold times, CPU time and timer gaps:

| seed | Node | Bun |
|---|---|---|
| 1729 | [report](output/bench/node-24.19-mixed.md) | [report](output/bench/bun-1.4.0-mixed.md) |
| 31415 | [report](output/bench/node-24.19-mixed-s31415.md) | [report](output/bench/bun-1.4.0-mixed-s31415.md) |
| 271828 | [report](output/bench/node-24.19-mixed-s271828.md) | [report](output/bench/bun-1.4.0-mixed-s271828.md) |

Matching JSON files sit beside each report. Other archived runtime versions
are in [`output/bench`](output/bench); the tables above use the named versions.

### Reproduce

```sh
npm run bench
npm run bench:sawyer
npm run bench:mixed
npm run bench:mixed -- --seed 31415
npm run bench:mixed -- --seed 271828

# Full-document stealing-off comparison
KNITTING_STEAL=0 node scripts/bench.mjs examples/pride-and-prejudice.tex

# Save a report and its numeric results (input is generated by npm run bench)
node scripts/bench.mjs examples/pride-and-prejudice.tex --runs 5 --json results.json > results.md

# Cold CLI runs, a fresh process each
node scripts/bench-cli.mjs examples/pride-and-prejudice.tex --runs 5

# Bun: use the same generated inputs
bun scripts/bench.mjs examples/pride-and-prejudice.tex
bun scripts/bench.mjs examples/tom-sawyer.tex
bun scripts/bench-mixed.mjs --seed 1729
bun scripts/bench-cli.mjs examples/pride-and-prejudice.tex
```

`bench.mjs` accepts another `.tex` path and caps pools at four workers (or fewer
when fewer CPUs are available). `bench-mixed.mjs` explicitly tests x1–x4 with
stealing on and off; on Node it also tests Piscina. `bench-cli.mjs` runs the
CLI with `--host`, `--threads 2`, `--threads 4` and `--threads auto`. All three
scripts accept `--runs N` and `--json FILE`.

## Development notes

Knitting tasks live in [`src/tasks.mjs`](src/tasks.mjs) and use `task()` wrappers.
Paragraph specs are plain objects. Set paragraphs and pages cross as knitting
`Envelope`s ([`src/wire.mjs`](src/wire.mjs)), with numbers in a `Float64Array`
body and text in the header, so positioned segments skip JSON (see
[How it works](#how-it-works)). Layout passes the
packed segments through unread. Rendered page streams return as top-level
`Uint8Array`s. Workers warm fonts and hyphenation at import. Executor errors
include paragraph/page context, and the CLI writes through a temporary file
and rename to avoid truncated PDFs.

| files | purpose |
|---|---|
| `src/cli.mjs`, `src/engine.mjs` | CLI, pipeline and host/knitting executors. |
| `src/parse.mjs`, `src/math.mjs` | LaTeX subset and math parsing. |
| `src/paragraph.mjs`, `src/knuth-plass.mjs`, `src/hyphenate.mjs` | Paragraph setting, line breaking and hyphenation. |
| `src/fonts.mjs`, `src/layout.mjs` | Font metrics, encoding and page layout. |
| `src/render.mjs`, `src/pdf.mjs`, `src/tasks.mjs` | Page streams, PDF assembly and worker tasks. |
| `src/wire.mjs` | Envelope payloads between the host and workers. |
| `scripts/gutenberg*.mjs` | Download and convert the benchmark books. |
| `scripts/bench.mjs`, `scripts/bench-mixed.mjs`, `scripts/bench-cli.mjs` | Full-document, mixed paragraph and cold CLI benchmarks. |

Apache-2.0. The benchmark texts are from Project Gutenberg: [*Pride and
Prejudice*, eBook #1342](https://www.gutenberg.org/ebooks/1342) and [*The
Adventures of Tom Sawyer*, eBook #74](https://www.gutenberg.org/ebooks/74).
Their plain-text downloads are cached on first use.
