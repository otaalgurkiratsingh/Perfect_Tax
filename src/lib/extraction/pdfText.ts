// Text + position extraction from a PDF using pdf.js (no network, no third party).

export interface Token {
  text: string;
  x: number;
  xEnd: number;
}

export interface Line {
  page: number;
  y: number;
  tokens: Token[];
  text: string;
}

export interface PdfText {
  pages: number;
  lines: Line[];
  charCount: number;
}

interface PdfjsItem {
  str: string;
  transform: number[];
  width: number;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Load the worker in-process (explicit import so bundlers include it).
  const g = globalThis as unknown as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return pdfjs;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdfjs = await loadPdfjs();
  // pdf.js needs a plain Uint8Array (not a Node Buffer), and may detach it — pass a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const lines: Line[] = [];
  let charCount = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as PdfjsItem[]).filter((i) => typeof i.str === "string" && i.str.trim() !== "");
    // Group items into visual lines by their baseline (y), top to bottom.
    const rows: { y: number; items: PdfjsItem[] }[] = [];
    for (const item of items) {
      const y = item.transform[5];
      const row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
      if (row) row.items.push(item);
      else rows.push({ y, items: [item] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);
      // Merge items separated by tiny gaps into one token (pdf.js splits words oddly).
      const tokens: Token[] = [];
      for (const it of row.items) {
        const x = it.transform[4];
        const xEnd = x + it.width;
        const prev = tokens[tokens.length - 1];
        if (prev && x - prev.xEnd < 1.5) {
          prev.text += it.str;
          prev.xEnd = xEnd;
        } else {
          tokens.push({ text: it.str.trim(), x, xEnd });
        }
        charCount += it.str.trim().length;
      }
      // Split tokens that contain wide internal spaces into words.
      const words: Token[] = [];
      for (const t of tokens) {
        const parts = t.text.split(/\s+/).filter(Boolean);
        if (parts.length <= 1) {
          if (t.text) words.push(t);
          continue;
        }
        const per = (t.xEnd - t.x) / Math.max(1, t.text.length);
        let offset = 0;
        for (const part of parts) {
          const idx = t.text.indexOf(part, offset);
          words.push({ text: part, x: t.x + idx * per, xEnd: t.x + (idx + part.length) * per });
          offset = idx + part.length;
        }
      }
      lines.push({ page: p, y: row.y, tokens: words, text: words.map((w) => w.text).join(" ") });
    }
  }
  const pages = doc.numPages;
  await task.destroy();
  return { pages, lines, charCount };
}
