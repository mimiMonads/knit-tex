// parse -> set paragraphs (pool) -> layout -> render pages (pool) -> write PDF
import { buildPages, GEOMETRY, planParagraphs } from "./layout.mjs";
import { setParagraph } from "./paragraph.mjs";
import { parseTex } from "./parse.mjs";
import { writePdf } from "./pdf.mjs";
import { renderPageStream } from "./render.mjs";

const VERSION = "0.1.0";

/** knitting rejects with strings and symbols as well as Errors; normalise with context. */
export function asError(e, context) {
  const message = e instanceof Error ? e.message : typeof e === "symbol" ? e.toString() : String(e);
  return new Error(`${context}: ${message}`, { cause: e });
}

const checkSet = (r) => {
  if (r === null || typeof r !== "object" || !Array.isArray(r.lines)) throw new TypeError(`malformed paragraph result: ${JSON.stringify(r)?.slice(0, 120)}`);
  return r;
};
const checkStream = (z) => {
  if (!(z instanceof Uint8Array)) throw new TypeError(`malformed page stream: ${Object.prototype.toString.call(z)}`);
  return z;
};

/** Runs everything on the calling thread. */
export function hostExecutor() {
  return {
    name: "main thread",
    setParagraph: async (spec) => setParagraph(spec),
    renderPage: async (page) => renderPageStream(page),
    close: async () => {},
  };
}

/** A knitting pool running the two tasks in ./tasks.mjs. */
export async function knittingExecutor(threads, poolOptions = {}) {
  const { createPool } = await import("knitting");
  const { setParagraphTask, renderPageTask } = await import("./tasks.mjs");
  const { packPage, unpackSet } = await import("./wire.mjs");
  const pool = createPool({ ...poolOptions, threads })({ setParagraphTask, renderPageTask });
  return {
    name: `knitting x${threads}`,
    setParagraph: (spec) => pool.call.setParagraphTask(spec).then(unpackSet),
    renderPage: (page) => pool.call.renderPageTask(packPage(page)),
    close: () => pool.shutdown(),
  };
}

/** Below this many paragraphs, worker start-up costs more than it saves. */
export const AUTO_POOL_MIN_PARAGRAPHS = 400;

/** Blank-line-separated chunks: a cheap guess at the paragraph count before parsing. */
function roughParagraphCount(source) {
  return (source.match(/\n[ \t]*\r?\n/g)?.length ?? 0) + 1;
}

/**
 * Typeset LaTeX source to PDF bytes.
 * options: { file, readFile, date,
 *            executor: reuse an executor (left open), or
 *            threads: 0 = main thread, N = knitting pool of N, "auto" }
 */
export async function typeset(source, options = {}) {
  const file = options.file ?? "input.tex";
  const timings = {};
  const lap = (name, t0) => {
    timings[name] = performance.now() - t0;
    return performance.now();
  };
  const start = performance.now();
  let t = start;

  let executor = options.executor ?? null;
  const owned = executor === null;
  const threads = options.threads ?? 0;
  const poolThreads = threads === "auto" ? Math.max(1, options.autoThreads ?? 1) : threads;
  try {
    // Start the pool before parsing, so workers boot (modules, font metrics,
    // hyphenation patterns) while the main thread parses. "auto" guesses from
    // blank lines here and settles on the real paragraph count after parsing.
    if (owned && (threads === "auto" ? roughParagraphCount(source) >= AUTO_POOL_MIN_PARAGRAPHS : threads > 0)) {
      executor = await knittingExecutor(poolThreads);
      t = lap("poolStart", t);
    }

    const doc = parseTex(source, { file, readFile: options.readFile, date: options.date });
    t = lap("parse", t);
    const { specs, owners } = planParagraphs(doc.blocks);

    if (owned && threads === "auto") {
      const wantPool = specs.length >= AUTO_POOL_MIN_PARAGRAPHS;
      if (executor !== null && !wantPool) {
        await executor.close();
        executor = null;
      } else if (executor === null && wantPool) {
        executor = await knittingExecutor(poolThreads);
        t = lap("poolStart", t);
      }
    }
    executor ??= hostExecutor();
    const setOne = executor.setParagraph;
    const renderOne = executor.renderPage;

    const set = await Promise.all(
      specs.map((spec, k) =>
        // async wrapper: a synchronous throw from an executor still gets context
        (async () => setOne(spec))().then(checkSet, (e) => {
          throw asError(e, `setting the paragraph at ${file}:${doc.blocks[owners[k]].srcLine}`);
        }),
      ),
    );
    t = lap("paragraphs", t);

    const { pages, outline, stats: layoutStats } = buildPages(doc.blocks, owners, set);
    t = lap("layout", t);

    const streams = await Promise.all(
      pages.map((page, p) =>
        (async () => renderOne(page))().then(checkStream, (e) => {
          throw asError(e, `rendering page ${p + 1}`);
        }),
      ),
    );
    t = lap("render", t);

    const plain = (raw) => (raw ?? "").replace(/\\[A-Za-z]+\s*/g, " ").replace(/[{}~\\]/g, " ").replace(/\s+/g, " ").trim();
    const pdf = writePdf({
      pageSize: { w: GEOMETRY.pageW, h: GEOMETRY.pageH },
      streams,
      outline,
      info: {
        Title: plain(doc.meta.title),
        Author: plain(doc.meta.author),
        Producer: `knit-tex ${VERSION} (Knuth-Plass on knitting)`,
      },
    });
    lap("write", t);
    timings.total = performance.now() - start;

    const stats = { pages: pages.length, paragraphs: specs.length, lines: 0, hyphens: 0, overfull: 0, missing: layoutStats.missing, passes: [0, 0, 0, 0] };
    for (const r of set) {
      stats.lines += r.stats.lines;
      stats.hyphens += r.stats.hyphens;
      stats.overfull += r.stats.overfull;
      stats.missing += r.stats.missing;
      stats.passes[r.stats.pass]++;
    }
    return { pdf, stats, timings, warnings: doc.warnings, executor: executor.name };
  } finally {
    if (owned && executor !== null) await executor.close();
  }
}
