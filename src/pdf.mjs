// Minimal PDF 1.7 writer: base-14 fonts, pre-deflated content streams,
// nested bookmarks, classic xref table. Output is deterministic.
import { Buffer } from "node:buffer";
import { FONT_NAMES } from "./fonts.mjs";
import { num } from "./render.mjs";

/** PDF text string: literal for printable ASCII, UTF-16BE hex otherwise. */
export function pdfText(str) {
  if (/^[\x20-\x7e]*$/.test(str)) return `(${str.replace(/[\\()]/g, (c) => "\\" + c)})`;
  let hex = "FEFF";
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/**
 * pages:   [{ w, h }]               (all pages share geometry here)
 * streams: [Uint8Array]             deflated content stream per page
 * outline: [{ level, title, page, y }]
 * info:    { Title?, Author?, Producer?, Creator? }
 */
export function writePdf({ pageSize, streams, outline = [], info = {} }) {
  if (streams.length === 0) throw new Error("the document produced no pages (is the input empty?)");
  const chunks = [];
  const offsets = [0];
  let size = 0;
  const write = (data) => {
    const bytes = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    chunks.push(bytes);
    size += bytes.length;
  };
  const fontKeys = Object.keys(FONT_NAMES);
  // object numbers: 1 catalog, 2 pages, fonts, then (page, content) pairs, outline, info
  const fontObj = new Map(fontKeys.map((k, i) => [k, 3 + i]));
  const firstPage = 3 + fontKeys.length;
  const pageObj = (p) => firstPage + p * 2;
  const outlineRoot = firstPage + streams.length * 2;
  const outlineFirst = outlineRoot + 1;
  const infoObj = outlineFirst + outline.length;
  const objCount = infoObj;

  const object = (n, body) => {
    offsets[n] = size;
    write(`${n} 0 obj\n${body}\nendobj\n`);
  };

  write("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");
  object(1, `<< /Type /Catalog /Pages 2 0 R${outline.length > 0 ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : ""} >>`);
  const kids = streams.map((_, p) => `${pageObj(p)} 0 R`).join(" ");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`);
  for (const k of fontKeys) {
    const enc = k === "S" ? "" : " /Encoding /WinAnsiEncoding";
    object(fontObj.get(k), `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAMES[k]}${enc} >>`);
  }
  const fontRes = fontKeys.map((k) => `/${k} ${fontObj.get(k)} 0 R`).join(" ");
  const box = `[0 0 ${num(pageSize.w)} ${num(pageSize.h)}]`;
  streams.forEach((stream, p) => {
    if (!(stream instanceof Uint8Array)) throw new TypeError(`page ${p + 1}: content stream is ${Object.prototype.toString.call(stream)}, expected Uint8Array`);
    object(pageObj(p), `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /Resources << /Font << ${fontRes} >> /ProcSet [/PDF /Text] >> /Contents ${pageObj(p) + 1} 0 R >>`);
    offsets[pageObj(p) + 1] = size;
    write(`${pageObj(p) + 1} 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`);
    write(stream);
    write("\nendstream\nendobj\n");
  });

  if (outline.length > 0) {
    // tree from levels: each entry's parent is the nearest earlier entry with a lower level
    const nodes = outline.map((o, i) => ({ ...o, obj: outlineFirst + i, parent: null, kids: [] }));
    const roots = [];
    const stack = [];
    for (const node of nodes) {
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length === 0) roots.push(node);
      else {
        node.parent = stack[stack.length - 1];
        node.parent.kids.push(node);
      }
      stack.push(node);
    }
    const descendants = (n) => n.kids.reduce((s, k) => s + 1 + descendants(k), 0);
    const total = roots.reduce((s, r) => s + 1 + descendants(r), 0);
    object(outlineRoot, `<< /Type /Outlines /First ${roots[0].obj} 0 R /Last ${roots[roots.length - 1].obj} 0 R /Count ${total} >>`);
    const emit = (siblings, parentObj) => {
      siblings.forEach((n, i) => {
        const parts = [`/Title ${pdfText(n.title)}`, `/Parent ${parentObj} 0 R`, `/Dest [${pageObj(n.page)} 0 R /XYZ 0 ${num(n.y)} 0]`];
        if (i > 0) parts.push(`/Prev ${siblings[i - 1].obj} 0 R`);
        if (i < siblings.length - 1) parts.push(`/Next ${siblings[i + 1].obj} 0 R`);
        if (n.kids.length > 0) parts.push(`/First ${n.kids[0].obj} 0 R /Last ${n.kids[n.kids.length - 1].obj} 0 R /Count ${descendants(n)}`);
        object(n.obj, `<< ${parts.join(" ")} >>`);
        emit(n.kids, n.obj);
      });
    };
    emit(roots, outlineRoot);
  } else {
    object(outlineRoot, "<< /Type /Outlines /Count 0 >>");
  }

  const infoParts = Object.entries(info)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k, v]) => `/${k} ${pdfText(v)}`);
  object(infoObj, `<< ${infoParts.join(" ")} >>`);

  // objects were written in ascending order except outline children, which
  // follow their parents; the xref only needs every offset to be right
  const xrefAt = size;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objCount; n++) {
    if (offsets[n] === undefined) throw new Error(`PDF object ${n} was never written`);
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
