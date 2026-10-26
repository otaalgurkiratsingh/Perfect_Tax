import { extractPdfText } from "./pdfText";
import { parseStatementLines, type ParseResult } from "./parse";

/** Read a statement PDF. Encrypted/corrupt files come back as manual review, never as guesses. */
export async function extractStatement(bytes: Uint8Array): Promise<ParseResult & { failed?: boolean }> {
  try {
    const text = await extractPdfText(bytes);
    return parseStatementLines(text.lines, { charCount: text.charCount, pages: text.pages });
  } catch (e) {
    return {
      status: "manual_review",
      confidence: "none",
      reason: `This PDF couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}). Needs manual review.`,
      transactions: [],
      openingBalance: null,
      closingBalance: null,
      totalDebits: 0,
      totalCredits: 0,
      reconciled: false,
      failed: true,
    };
  }
}
