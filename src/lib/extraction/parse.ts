// Bank statement parser (beta). Works on text-based PDFs only. It never guesses
// numbers: every amount must come from the page, every row is checked against
// the running balance where one is printed, and the whole statement is checked
// with opening + credits − debits = closing. Anything that doesn't add up lowers
// the confidence and is flagged for a person to check.

import type { Line, Token } from "./pdfText";

export interface Transaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  page: number;
  flag: string | null;
}

export type Confidence = "high" | "medium" | "low" | "none";

export interface ParseResult {
  status: "extracted" | "manual_review";
  confidence: Confidence;
  reason: string;
  transactions: Transaction[];
  openingBalance: number | null;
  closingBalance: number | null;
  totalDebits: number;
  totalCredits: number;
  reconciled: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fevr: 2, févr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, août: 8, déc: 12,
};

const AMOUNT = /^\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:-|CR|DR)?$|^\(?-?\$?\d+\.\d{2}\)?(?:-|CR|DR)?$/i;

export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!AMOUNT.test(t)) return null;
  const negative = /^\(|^-|-$|\)$|DR$/i.test(t);
  const n = Number(t.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** Recognise a date at the start of a line; returns ISO date and how many tokens it used. */
export function parseLeadingDate(tokens: Token[], fallbackYear: number): { iso: string; used: number } | null {
  const t = tokens.map((x) => x.text.replace(/[.,]$/, ""));
  const mk = (y: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { iso: `${y}-${pad(m)}-${pad(d)}` } : null;
  if (!t[0]) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t[0]))) {
    const r = mk(+m[1], +m[2], +m[3]);
    return r ? { ...r, used: 1 } : null;
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t[0]))) {
    // Canadian bank exports are usually MM/DD/YYYY; when the first part is > 12 it must be DD/MM.
    const a = +m[1];
    const b = +m[2];
    const r = a > 12 ? mk(+m[3], b, a) : mk(+m[3], a, b);
    return r ? { ...r, used: 1 } : null;
  }
  const month = (s: string | undefined) => (s ? MONTHS[s.toLowerCase().replace(/\.$/, "")] : undefined);
  // "Oct 03" / "Oct 3 2026" / "Oct 03, 2026"
  if (month(t[0]) && t[1] && /^\d{1,2}$/.test(t[1])) {
    const year = t[2] && /^\d{4}$/.test(t[2]) ? +t[2] : null;
    const r = mk(year ?? fallbackYear, month(t[0])!, +t[1]);
    return r ? { ...r, used: year ? 3 : 2 } : null;
  }
  // "03 Oct" / "03 Oct 2026"
  if (/^\d{1,2}$/.test(t[0]) && month(t[1])) {
    const year = t[2] && /^\d{4}$/.test(t[2]) ? +t[2] : null;
    const r = mk(year ?? fallbackYear, month(t[1])!, +t[0]);
    return r ? { ...r, used: year ? 3 : 2 } : null;
  }
  // "03Oct" / "Oct03"
  if ((m = /^(\d{1,2})([A-Za-z]{3,4})$/.exec(t[0])) && month(m[2])) {
    const r = mk(fallbackYear, month(m[2])!, +m[1]);
    return r ? { ...r, used: 1 } : null;
  }
  if ((m = /^([A-Za-z]{3,4})(\d{1,2})$/.exec(t[0])) && month(m[1])) {
    const r = mk(fallbackYear, month(m[1])!, +m[2]);
    return r ? { ...r, used: 1 } : null;
  }
  return null;
}

type Column = "debit" | "credit" | "balance";

interface Header {
  columns: { kind: Column; x: number; xEnd: number }[];
  page: number;
  y: number;
}

const DEBIT_WORDS = /^(withdrawals?|debits?|cheques|payments|withdrawn|paid)$/i;
const CREDIT_WORDS = /^(deposits?|credits?|received)$/i;
const BALANCE_WORDS = /^(balance)$/i;

function findHeaders(lines: Line[]): Header[] {
  const headers: Header[] = [];
  for (const line of lines) {
    const lower = line.text.toLowerCase();
    if (!/\bdate\b/.test(lower) || !/\bbalance\b/.test(lower)) continue;
    // Group header words into phrases ("Cheques & Debits ($)") by the gaps between them;
    // a phrase's right edge is where its right-aligned amounts end.
    const phrases: Token[][] = [];
    for (const tok of line.tokens) {
      const last = phrases[phrases.length - 1];
      if (last && tok.x - last[last.length - 1].xEnd < 6) last.push(tok);
      else phrases.push([tok]);
    }
    const columns: Header["columns"] = [];
    for (const phrase of phrases) {
      const words = phrase.map((t) => t.text.replace(/[^A-Za-z]/g, ""));
      const kinds = new Set<Column>();
      if (words.some((w) => DEBIT_WORDS.test(w))) kinds.add("debit");
      if (words.some((w) => CREDIT_WORDS.test(w))) kinds.add("credit");
      if (words.some((w) => BALANCE_WORDS.test(w))) kinds.add("balance");
      if (kinds.size !== 1) continue; // none, or ambiguous: never guess
      const kind = [...kinds][0];
      if (columns.some((c) => c.kind === kind)) continue;
      columns.push({ kind, x: phrase[0].x, xEnd: phrase[phrase.length - 1].xEnd });
    }
    if (columns.some((c) => c.kind === "balance") && (columns.some((c) => c.kind === "debit") || columns.some((c) => c.kind === "credit"))) {
      headers.push({ columns, page: line.page, y: line.y });
    }
  }
  return headers;
}

function nearestColumn(header: Header, tok: Token): Column | null {
  // Amounts sit under their header phrase (usually right-aligned to it).
  let best: { kind: Column; d: number } | null = null;
  for (const c of header.columns) {
    const overlaps = tok.xEnd > c.x - 4 && tok.x < c.xEnd + 4;
    const d = overlaps ? Math.abs(tok.xEnd - c.xEnd) / 100 : Math.min(Math.abs(tok.xEnd - c.xEnd), Math.abs(tok.x - c.x));
    if (!best || d < best.d) best = { kind: c.kind, d };
  }
  return best && best.d < 60 ? best.kind : null;
}

function guessYear(lines: Line[]): number {
  const text = lines.slice(0, 40).map((l) => l.text).join(" ");
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  if (years.length) return Math.max(...years);
  return new Date().getFullYear();
}

const OPENING = /(opening|previous|beginning|starting)\s+balance|balance\s+(forward|brought forward|b\/f)/i;
const CLOSING = /(closing|ending|new)\s+balance|balance\s+(carried forward|c\/f)/i;
const SKIP = /^(total|totals|subtotal|page\s+\d|continued|statement|account\s+(number|summary))/i;

export function parseStatementLines(lines: Line[], opts: { charCount: number; pages: number }): ParseResult {
  const base: ParseResult = {
    status: "manual_review",
    confidence: "none",
    reason: "",
    transactions: [],
    openingBalance: null,
    closingBalance: null,
    totalDebits: 0,
    totalCredits: 0,
    reconciled: false,
  };
  // Scanned / image-only statement: there is no text layer to read. Never guess.
  if (opts.charCount < 40 * Math.max(1, opts.pages) * 0.25 || lines.length < 3) {
    return { ...base, reason: "No readable text in this PDF (scanned or photographed statement). Needs manual review." };
  }

  const headers = findHeaders(lines);
  if (!headers.length) {
    return { ...base, reason: "Couldn't find a transaction table (Date / Withdrawals / Deposits / Balance). Needs manual review." };
  }
  const year = guessYear(lines);
  const headerFor = (line: Line) => {
    const samePage = headers.filter((h) => h.page === line.page && h.y >= line.y);
    if (samePage.length) return samePage.sort((a, b) => a.y - b.y)[0];
    const earlier = headers.filter((h) => h.page < line.page);
    return earlier.length ? earlier[earlier.length - 1] : null;
  };

  const txns: Transaction[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let lastDate: string | null = null;
  let unassigned = 0;

  for (const line of lines) {
    const header = headerFor(line);
    if (!header || (line.page === header.page && line.y >= header.y)) continue; // above the table header
    const amounts = line.tokens.map((t) => ({ t, v: parseAmount(t.text) })).filter((a) => a.v !== null);

    if (OPENING.test(line.text) && amounts.length) {
      if (opening === null) opening = amounts[amounts.length - 1].v;
      continue;
    }
    if (CLOSING.test(line.text) && amounts.length) {
      closing = amounts[amounts.length - 1].v;
      continue;
    }
    if (SKIP.test(line.text)) continue;

    const date = parseLeadingDate(line.tokens, year);
    if (!date && amounts.length === 0) {
      // Description continued on the next line.
      const prev = txns[txns.length - 1];
      if (prev && prev.page === line.page && line.text.length < 80 && !/^\d+$/.test(line.text)) prev.description = `${prev.description} ${line.text}`.trim();
      continue;
    }
    if (!amounts.length) continue;
    const iso: string | null = date?.iso ?? lastDate;
    if (!iso) continue;
    lastDate = iso;

    const used = date?.used ?? 0;
    const amountTokens = new Set(amounts.map((a) => a.t));
    const description = line.tokens
      .slice(used)
      .filter((t) => !amountTokens.has(t))
      .map((t) => t.text)
      .join(" ")
      .trim();

    const txn: Transaction = { date: iso, description, debit: null, credit: null, balance: null, page: line.page, flag: null };
    for (const a of amounts) {
      const col = nearestColumn(header, a.t);
      const v = a.v!;
      if (col === "balance") txn.balance = v;
      else if (col === "debit") txn.debit = round(Math.abs(v));
      else if (col === "credit") txn.credit = round(Math.abs(v));
      else {
        unassigned++;
        txn.flag = "Amount not under a known column";
      }
    }
    if (txn.debit === null && txn.credit === null) {
      txn.flag = txn.flag ?? "No withdrawal or deposit amount found";
    }
    txns.push(txn);
  }

  if (!txns.length) return { ...base, reason: "No transactions found. Needs manual review." };

  // Running balance check: carry a computed balance through every row, and
  // compare it wherever the statement prints one (some banks print it once a day).
  let running = opening;
  let rowsChecked = 0;
  let rowMismatches = 0;
  for (const t of txns) {
    if (running !== null) running = round(running - (t.debit ?? 0) + (t.credit ?? 0));
    if (t.balance !== null) {
      if (running !== null) {
        rowsChecked++;
        if (Math.abs(running - t.balance) > 0.005) {
          rowMismatches++;
          t.flag = t.flag ?? `Balance doesn't follow (expected ${running.toFixed(2)})`;
        }
      }
      running = t.balance;
    }
  }

  const totalDebits = round(txns.reduce((s, t) => s + (t.debit ?? 0), 0));
  const totalCredits = round(txns.reduce((s, t) => s + (t.credit ?? 0), 0));
  if (closing === null) {
    const lastWithBalance = [...txns].reverse().find((t) => t.balance !== null);
    closing = lastWithBalance?.balance ?? null;
  }
  const reconciled = opening !== null && closing !== null && Math.abs(round(opening + totalCredits - totalDebits) - closing) < 0.005;
  const flagged = txns.filter((t) => t.flag).length;

  let confidence: Confidence;
  let reason: string;
  if (reconciled && rowMismatches === 0 && flagged === 0 && unassigned === 0) {
    confidence = "high";
    reason = `Totals reconcile: opening ${opening!.toFixed(2)} + deposits ${totalCredits.toFixed(2)} − withdrawals ${totalDebits.toFixed(2)} = closing ${closing!.toFixed(2)}. ${rowsChecked} running balances checked.`;
  } else if (reconciled) {
    confidence = "medium";
    reason = `Totals reconcile, but ${flagged} row(s) are flagged — check them against the statement.`;
  } else {
    confidence = "low";
    reason =
      opening === null || closing === null
        ? "Couldn't find the opening and closing balance, so totals can't be confirmed. Check against the statement."
        : `Totals do NOT reconcile (expected closing ${round(opening + totalCredits - totalDebits).toFixed(2)}, statement says ${closing.toFixed(2)}). Check every flagged row.`;
  }
  return { status: "extracted", confidence, reason, transactions: txns, openingBalance: opening, closingBalance: closing, totalDebits, totalCredits, reconciled };
}

export function transactionsCsvRows(rows: { file: string; confidence: string; t: Transaction }[]): string[][] {
  return [
    ["Source file", "Date", "Description", "Withdrawal (debit)", "Deposit (credit)", "Balance", "Page", "File confidence", "Needs checking"],
    ...rows.map(({ file, confidence, t }) => [
      file,
      t.date,
      t.description,
      t.debit === null ? "" : t.debit.toFixed(2),
      t.credit === null ? "" : t.credit.toFixed(2),
      t.balance === null ? "" : t.balance.toFixed(2),
      String(t.page),
      confidence,
      t.flag ?? "",
    ]),
  ];
}
