// Synthetic bank statements for tests and demo seed data. Numbers are made up;
// layouts mimic common Canadian bank PDFs (right-aligned amount columns).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PNG_1PX } from "./png";

export interface FixtureTxn {
  date: Date;
  description: string[];
  debit: number | null;
  credit: number | null;
}

export interface FixtureStatement {
  bytes: Buffer;
  opening: number;
  closing: number;
  totalDebits: number;
  totalCredits: number;
  count: number;
}

function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const MERCHANTS = [
  ["PETRO-CANADA #4521", "BRAMPTON ON"],
  ["CANADIAN TIRE #0123"],
  ["E-TRANSFER RECEIVED", "FROM: K SINGH LOGISTICS"],
  ["MOBILE DEPOSIT"],
  ["HYDRO ONE NETWORKS", "PRE-AUTHORIZED DEBIT"],
  ["COSTCO WHOLESALE W532"],
  ["CHEQUE #000214"],
  ["RECEIVER GENERAL - HST"],
  ["INTERAC E-TRANSFER SENT", "TO: J DHALIWAL"],
  ["SERVICE CHARGE"],
  ["CUSTOMER PAYMENT INV-1043"],
  ["ROGERS WIRELESS"],
];

export function makeTransactions(seed: number, year: number, quarter: number, n: number): FixtureTxn[] {
  const rnd = prng(seed);
  const startMonth = (quarter - 1) * 3;
  const out: FixtureTxn[] = [];
  for (let i = 0; i < n; i++) {
    const month = startMonth + Math.floor((i / n) * 3);
    const day = 1 + Math.floor(rnd() * 27);
    const isCredit = rnd() < 0.35;
    const amount = Math.round((isCredit ? 500 + rnd() * 6000 : 8 + rnd() * 1800) * 100) / 100;
    out.push({
      date: new Date(Date.UTC(year, month, day)),
      description: MERCHANTS[Math.floor(rnd() * MERCHANTS.length)],
      debit: isCredit ? null : amount,
      credit: isCredit ? amount : null,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

const fmt = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function right(page: PDFPage, font: PDFFont, text: string, xRight: number, y: number, size = 9) {
  page.drawText(text, { x: xRight - font.widthOfTextAtSize(text, size), y, size, font });
}

/**
 * Layout "A": Date | Description | Withdrawals | Deposits | Balance, "Mon DD" dates,
 * a balance on every row, two-line descriptions, repeated header on each page.
 * Layout "B": DD Mon dates printed once per day, balance only on the last row of a day,
 * "Cheques & Debits" / "Deposits & Credits" headers.
 */
export async function makeStatement(opts: {
  layout: "A" | "B";
  seed: number;
  year: number;
  quarter: number;
  count: number;
  opening: number;
  tamperClosing?: number;
  bankName?: string;
}): Promise<FixtureStatement> {
  const txns = makeTransactions(opts.seed, opts.year, opts.quarter, opts.count);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cols = opts.layout === "A" ? { debit: 400, credit: 480, balance: 560 } : { debit: 380, credit: 485, balance: 565 };
  let page = doc.addPage([612, 792]);
  let y = 740;
  const newPage = (first: boolean) => {
    if (!first) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    if (first) {
      page.drawText(opts.bankName ?? "Maple Leaf Bank of Canada", { x: 40, y, size: 14, font: bold });
      y -= 18;
      page.drawText(`Business Chequing Account   Statement period: ${MON[(opts.quarter - 1) * 3]} 1, ${opts.year} to ${MON[(opts.quarter - 1) * 3 + 2]} 30, ${opts.year}`, { x: 40, y, size: 9, font });
      y -= 14;
      page.drawText("Account number: ****-1234", { x: 40, y, size: 9, font });
      y -= 24;
    }
    page.drawText("Date", { x: 40, y, size: 9, font: bold });
    page.drawText("Description", { x: 100, y, size: 9, font: bold });
    if (opts.layout === "A") {
      right(page, bold, "Withdrawals", cols.debit, y);
      right(page, bold, "Deposits", cols.credit, y);
      right(page, bold, "Balance", cols.balance, y);
    } else {
      right(page, bold, "Cheques & Debits ($)", cols.debit, y);
      right(page, bold, "Deposits & Credits ($)", cols.credit, y);
      right(page, bold, "Balance ($)", cols.balance, y);
    }
    page.drawLine({ start: { x: 40, y: y - 4 }, end: { x: 572, y: y - 4 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    y -= 16;
  };
  newPage(true);
  let balance = opts.opening;
  page.drawText(opts.layout === "A" ? "Balance forward" : "Opening balance", { x: 100, y, size: 9, font });
  right(page, font, fmt(balance), cols.balance, y);
  y -= 14;
  let lastDay = "";
  let totalDebits = 0;
  let totalCredits = 0;
  txns.forEach((t, i) => {
    if (y < 80) newPage(false);
    balance = Math.round((balance - (t.debit ?? 0) + (t.credit ?? 0)) * 100) / 100;
    totalDebits += t.debit ?? 0;
    totalCredits += t.credit ?? 0;
    const d = t.date;
    const dateText = opts.layout === "A" ? `${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}` : `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
    const showDate = opts.layout === "A" || dateText !== lastDay;
    lastDay = dateText;
    if (showDate) page.drawText(dateText, { x: 40, y, size: 9, font });
    page.drawText(t.description[0], { x: 100, y, size: 9, font });
    if (t.debit !== null) right(page, font, fmt(t.debit), cols.debit, y);
    if (t.credit !== null) right(page, font, fmt(t.credit), cols.credit, y);
    const next = txns[i + 1];
    const lastOfDay = !next || next.date.getTime() !== t.date.getTime();
    if (opts.layout === "A" || lastOfDay) right(page, font, fmt(balance), cols.balance, y);
    y -= 12;
    for (const extra of t.description.slice(1)) {
      page.drawText(extra, { x: 100, y, size: 8, font });
      y -= 12;
    }
  });
  if (y < 80) newPage(false);
  const closingPrinted = opts.tamperClosing ?? balance;
  page.drawText("Closing balance", { x: 100, y, size: 9, font: bold });
  right(page, bold, fmt(closingPrinted), cols.balance, y);
  return {
    bytes: Buffer.from(await doc.save()),
    opening: opts.opening,
    closing: Math.round(balance * 100) / 100,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    count: txns.length,
  };
}

/** A "scanned" statement: one page that is only an image, no text layer. */
export async function makeScannedStatement(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const img = await doc.embedPng(PNG_1PX);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  return Buffer.from(await doc.save());
}
