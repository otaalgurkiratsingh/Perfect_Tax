// Calendar quarters: Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface QuarterInfo {
  year: number;
  quarter: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}

export function quarterInfo(year: number, quarter: number): QuarterInfo {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid year");
  if (![1, 2, 3, 4].includes(quarter)) throw new Error("Invalid quarter");
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year,
    quarter,
    label: `${year}-Q${quarter}`,
    periodStart: `${year}-${pad(startMonth + 1)}-01`,
    periodEnd: `${year}-${pad(endMonth + 1)}-${pad(lastDay)}`,
    periodLabel: `${MONTHS[startMonth]} to ${MONTHS[endMonth]} ${year}`,
  };
}

/** The quarter that most recently ended (what firms usually collect for). */
export function previousQuarter(now = new Date()): { year: number; quarter: number } {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return q === 1 ? { year: now.getUTCFullYear() - 1, quarter: 4 } : { year: now.getUTCFullYear(), quarter: q - 1 };
}

export function currentQuarter(now = new Date()): { year: number; quarter: number } {
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}
