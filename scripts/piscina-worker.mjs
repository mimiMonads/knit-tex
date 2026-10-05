// The same two functions as src/tasks.mjs, exposed the way piscina expects.
import { setParagraph } from "../src/paragraph.mjs";
import { renderPageStream } from "../src/render.mjs";

export const setParagraphTask = (spec) => setParagraph(spec);
export const renderPageTask = (page) => renderPageStream(page);
