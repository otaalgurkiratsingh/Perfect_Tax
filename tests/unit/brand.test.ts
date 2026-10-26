import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { firmConfig } from "@firm/config";

// White-label check: the firm's name must not appear anywhere outside
// firm.config.ts (and seed data / docs). Hardcoding it is a defect.
describe("white-label", () => {
  it("firm name and contact details only live in firm.config.ts", () => {
    const needles = [firmConfig.firm.name, firmConfig.firm.shortName, firmConfig.firm.phone, firmConfig.firm.email, firmConfig.firm.addressLines[0]];
    for (const needle of needles) {
      const out = execSync(
        `git grep --untracked -n -I -F ${JSON.stringify(needle)} -- . ':!firm.config.ts' ':!scripts/seed*' ':!*.md' ':!intake-source' || true`,
        { encoding: "utf8" },
      );
      expect(out.trim(), `"${needle}" found outside config:\n${out}`).toBe("");
    }
  });
});
