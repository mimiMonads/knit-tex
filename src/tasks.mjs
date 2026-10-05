// knitting tasks. Workers re-import this module, so it stays lean: only the
// worker-side code (fonts, hyphenation, line breaking, rendering) loads here.
// They are task() wrappers rather than plain functions because plain
// functions are only discoverable from the module that calls createPool.
import { isMain, task } from "knitting";
import { setParagraph, warmUp } from "./paragraph.mjs";
import { renderPageStream } from "./render.mjs";
import { packSet, unpackPage } from "./wire.mjs";

// Results and pages cross as packed strings rather than JSON (see wire.mjs).
export const setParagraphTask = task({ f: (spec) => packSet(setParagraph(spec)) });
export const renderPageTask = task({ f: (wire) => renderPageStream(unpackPage(wire)) });

// Workers import this module at boot; pay for metrics and patterns there.
if (!isMain) warmUp();
