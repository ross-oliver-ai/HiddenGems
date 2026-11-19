// Reporting periods. All dates are plain YYYY-MM-DD strings (UK dates, no timezone maths).

export type PeriodId = "week" | "month" | "quarter" | "taxyear" | "year" | "all" | "custom";
export type Bucket = "day" | "week" | "month";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "taxyear", label: "Tax year" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

const DAY = 86_400_000;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmt(new Date(parse(s).getTime() + n * DAY));
const daysIn = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY) + 1;
const mondayOf = (s: string) => {
  const d = parse(s);
  return fmt(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
};
const monthStart = (y: number, m0: number) => fmt(new Date(Date.UTC(y, m0, 1)));
const monthEnd = (y: number, m0: number) => fmt(new Date(Date.UTC(y, m0 + 1, 0)));
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dayLabel = (s: string) => `${Number(s.slice(8))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
const fullDay = (s: string) => `${dayLabel(s)} ${s.slice(0, 4)}`;

export type Period = {
  id: PeriodId;
  offset: number;
  from: string;
  to: string;
  label: string;
  bucket: Bucket;
  navigable: boolean;
};

export type PeriodInput = { p?: string; o?: string; from?: string; to?: string; at?: string };

/** How many periods back from today a given date falls (0 = this period, never positive). */
function offsetFor(id: PeriodId, at: string, today: string): number {
  const ay = Number(at.slice(0, 4));
  const am0 = Number(at.slice(5, 7)) - 1;
  const ty = Number(today.slice(0, 4));
  const tm0 = Number(today.slice(5, 7)) - 1;
  const taxStart = (d: string, yy: number) => (d >= `${yy}-04-06` ? yy : yy - 1);
  let n = 0;
  switch (id) {
    case "week":
      n = Math.round((parse(mondayOf(at)).getTime() - parse(mondayOf(today)).getTime()) / (7 * DAY));
      break;
    case "month":
      n = (ay - ty) * 12 + (am0 - tm0);
      break;
    case "quarter":
      n = ay * 4 + Math.floor(am0 / 3) - (ty * 4 + Math.floor(tm0 / 3));
      break;
    case "year":
      n = ay - ty;
      break;
    case "taxyear":
      n = taxStart(at, ay) - taxStart(today, ty);
      break;
  }
  return Math.min(0, Math.max(-1200, n));
}

export function resolvePeriod(input: PeriodInput, today: string, earliest: string | null): Period {
  const id = (PERIODS.find((x) => x.id === input.p)?.id ?? "month") as PeriodId;
  let offset = Math.min(0, Math.max(-120, Math.trunc(Number(input.o) || 0)));
  if (isDate(input.at) && id !== "all" && id !== "custom") offset = offsetFor(id, input.at, today);
  const y = Number(today.slice(0, 4));
  const m0 = Number(today.slice(5, 7)) - 1;

  let from: string;
  let to: string;
  let label: string;
  let navigable = true;

  switch (id) {
    case "week": {
      from = addDays(mondayOf(today), offset * 7);
      to = addDays(from, 6);
      label = `${dayLabel(from)} – ${fullDay(to)}`;
      break;
    }
    case "month": {
      const d = new Date(Date.UTC(y, m0 + offset, 1));
      from = monthStart(d.getUTCFullYear(), d.getUTCMonth());
      to = monthEnd(d.getUTCFullYear(), d.getUTCMonth());
      label = `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      break;
    }
    case "quarter": {
      const q = Math.floor(m0 / 3) + offset;
      const qy = y + Math.floor(q / 4);
      const qi = ((q % 4) + 4) % 4;
      from = monthStart(qy, qi * 3);
      to = monthEnd(qy, qi * 3 + 2);
      label = `Q${qi + 1} ${qy} (${MONTHS[qi * 3]}–${MONTHS[qi * 3 + 2]})`;
      break;
    }
    case "taxyear": {
      const startsThisYear = today >= `${y}-04-06`;
      const sy = (startsThisYear ? y : y - 1) + offset;
      from = `${sy}-04-06`;
      to = `${sy + 1}-04-05`;
      label = `Tax year ${sy}/${String(sy + 1).slice(2)}`;
      break;
    }
    case "year": {
      const cy = y + offset;
      from = `${cy}-01-01`;
      to = `${cy}-12-31`;
      label = String(cy);
      break;
    }
    case "all": {
      from = earliest && earliest < today ? earliest : today;
      to = today;
      label = "All time";
      navigable = false;
      break;
    }
    default: {
      navigable = false;
      if (isDate(input.from) && isDate(input.to) && input.from <= input.to && daysIn(input.from, input.to) <= 3660) {
        from = input.from;
        to = input.to;
      } else {
        from = addDays(today, -29);
        to = today;
      }
      label = `${fullDay(from)} – ${fullDay(to)}`;
    }
  }

  const n = daysIn(from, to);
  const bucket: Bucket = n <= 35 ? "day" : n <= 150 ? "week" : "month";
  return { id, offset: navigable ? offset : 0, from, to, label, bucket, navigable };
}

export type BucketInfo = { key: string; label: string; full: string };

export function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === "day") return date;
  if (bucket === "week") return mondayOf(date);
  return date.slice(0, 7);
}

const weekdayDay = (s: string) =>
  parse(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function listBuckets(from: string, to: string, bucket: Bucket): BucketInfo[] {
  const out: BucketInfo[] = [];
  if (bucket === "day") {
    // "8 Nov" on the axis (so the month is always visible), "Sat 8 Nov 2026" in the tooltip
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, label: dayLabel(d), full: weekdayDay(d) });
  } else if (bucket === "week") {
    for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push({ key: d, label: dayLabel(d), full: `Week of ${fullDay(d)}` });
  } else {
    // Plain month names within one calendar year, "Nov 26" once the range crosses a year end
    const crossesYear = from.slice(0, 4) !== to.slice(0, 4);
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7)) - 1;
    const endKey = to.slice(0, 7);
    for (;;) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      out.push({
        key,
        label: crossesYear ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m],
        full: `${MONTHS_LONG[m]} ${y}`,
      });
      if (key >= endKey) break;
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  return out;
}
