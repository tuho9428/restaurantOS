export interface BusinessTimePolicy {
  readonly timezone: string;
  /** Local wall clock cutoff in HH:mm or HH:mm:ss form. */
  readonly cutoff: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface InstantWindow {
  readonly from: string;
  readonly to: string;
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timezone);
  if (!value) {
    try {
      value = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
      // Force IANA zone validation eagerly.
      value.format(new Date(0));
    } catch {
      throw new RangeError(`Invalid IANA timezone: ${timezone}`);
    }
    formatterCache.set(timezone, value);
  }
  return value;
}

function partsAt(instant: number, timezone: string): WallTime {
  const parts = formatter(timezone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (!part) throw new RangeError("Unable to resolve zoned date-time parts");
    return Number(part);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function wallEpoch(wall: WallTime): number {
  const date = new Date(0);
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, 0);
  return date.valueOf();
}

function instantEpoch(value: string | Date): number {
  if (value instanceof Date) {
    const epoch = value.valueOf();
    if (!Number.isFinite(epoch)) throw new TypeError("Invalid instant");
    return epoch;
  }
  if (!INSTANT_PATTERN.test(value)) {
    throw new TypeError("Instant must include Z or an explicit UTC offset");
  }
  // Date.parse normalizes some invalid dates (for example February 30), so validate the
  // civil calendar portion before parsing the offset-bearing timestamp.
  parseDate(value.slice(0, 10));
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new TypeError("Invalid instant");
  return epoch;
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new TypeError("Date must use YYYY-MM-DD");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid calendar date");
  }
  return { year, month, day };
}

function formatDate(date: { year: number; month: number; day: number }): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number): string {
  const { year, month, day } = parseDate(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day + days);
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function parseWall(value: string): WallTime {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) throw new TypeError("Local date-time must use YYYY-MM-DDTHH:mm:ss");
  const wall = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
  parseDate(formatDate(wall));
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) {
    throw new RangeError("Invalid local time");
  }
  return wall;
}

function offsetAt(instant: number, timezone: string): number {
  const wall = partsAt(instant, timezone);
  return wallEpoch(wall) - instant;
}

function candidateInstants(wall: WallTime, timezone: string): number[] {
  const nominal = wallEpoch(wall);
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(offsetAt(nominal + hours * 3_600_000, timezone));
  }
  return [...offsets]
    .map((offset) => nominal - offset)
    .filter((candidate) => sameWall(partsAt(candidate, timezone), wall))
    .sort((a, b) => a - b);
}

function parseOffset(value: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new TypeError("UTC offset must use ±HH:mm");
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw new RangeError("UTC offset is out of range");
  }
  return (match[1] === "+" ? 1 : -1) * (hours * 60 + minutes) * 60_000;
}

/** Converts a local wall time. Gaps are rejected; repeated times require their explicit offset. */
export function localDateTimeToInstant(
  localDateTime: string,
  timezone: string,
  explicitOffset?: string,
): string {
  const wall = parseWall(localDateTime);
  const candidates = candidateInstants(wall, timezone);
  if (candidates.length === 0)
    throw new RangeError("Local date-time does not exist in this timezone");
  if (explicitOffset !== undefined) {
    const wanted = parseOffset(explicitOffset);
    const matching = candidates.find((candidate) => offsetAt(candidate, timezone) === wanted);
    if (matching === undefined) throw new RangeError("Offset does not match this local date-time");
    return new Date(matching).toISOString();
  }
  if (candidates.length > 1)
    throw new RangeError("Ambiguous local date-time requires an explicit offset");
  return new Date(candidates[0]!).toISOString();
}

function parseCutoff(value: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new TypeError("Cutoff must use HH:mm or HH:mm:ss");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new RangeError("Invalid business cutoff");
  return { hour, minute, second };
}

/** Resolves business cutoff: repeated time chooses earlier occurrence; a gap advances to first valid minute. */
export function businessDayBoundary(
  date: string,
  policy: Pick<BusinessTimePolicy, "timezone" | "cutoff">,
): Date {
  const calendar = parseDate(date);
  const cutoff = parseCutoff(policy.cutoff);
  const target: WallTime = { ...calendar, ...cutoff };
  let candidates = candidateInstants(target, policy.timezone);
  if (candidates.length > 0) return new Date(candidates[0]!);

  // In a gap, search whole local minutes from :00. This drops the nonexistent cutoff's
  // seconds and resolves to the transition's first valid minute, regardless of gap length.
  const searchStart = wallEpoch({ ...target, second: 0 });
  const maxSearchMinutes = 48 * 60;
  for (let minute = 0; minute <= maxSearchMinutes; minute++) {
    const next = new Date(searchStart + minute * 60_000);
    const nextWall: WallTime = {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: next.getUTCHours(),
      minute: next.getUTCMinutes(),
      second: next.getUTCSeconds(),
    };
    candidates = candidateInstants(nextWall, policy.timezone);
    if (candidates.length > 0) return new Date(candidates[0]!);
  }
  throw new RangeError("Could not resolve business cutoff within 48 hours");
}

export function businessDayWindow(
  businessDate: string,
  policy: Pick<BusinessTimePolicy, "timezone" | "cutoff">,
): InstantWindow {
  const nextDate = shiftDate(businessDate, 1);
  return {
    from: businessDayBoundary(businessDate, policy).toISOString(),
    to: businessDayBoundary(nextDate, policy).toISOString(),
  };
}

/** Creates the half-open UTC range for [fromBusinessDate, toBusinessDate). */
export function businessDateRangeWindow(
  fromBusinessDate: string,
  toBusinessDate: string,
  policy: Pick<BusinessTimePolicy, "timezone" | "cutoff">,
): InstantWindow {
  parseDate(fromBusinessDate);
  parseDate(toBusinessDate);
  if (fromBusinessDate >= toBusinessDate)
    throw new RangeError("Date range must be nonempty and increasing");
  return {
    from: businessDayBoundary(fromBusinessDate, policy).toISOString(),
    to: businessDayBoundary(toBusinessDate, policy).toISOString(),
  };
}

/** Returns the policy whose effective instant range contains the supplied instant. */
export function effectiveBusinessTimePolicy(
  instant: string | Date,
  policies: readonly BusinessTimePolicy[],
): BusinessTimePolicy {
  const timestamp = instantEpoch(instant);
  const matches = policies.filter((policy) => {
    const from = instantEpoch(policy.effectiveFrom);
    const to =
      policy.effectiveTo === null ? Number.POSITIVE_INFINITY : instantEpoch(policy.effectiveTo);
    if (from >= to) throw new RangeError("Business time policy interval must be increasing");
    return from <= timestamp && timestamp < to;
  });
  if (matches.length !== 1) {
    throw new RangeError(
      matches.length ? "Business time policies overlap" : "No effective business time policy",
    );
  }
  // Validate the policy's timezone and cutoff before returning it.
  formatter(matches[0]!.timezone);
  parseCutoff(matches[0]!.cutoff);
  return matches[0]!;
}

/** Determines a business date from an absolute instant and its effective policy. */
export function businessDateForInstant(instant: string | Date, policy: BusinessTimePolicy): string {
  const epoch = instantEpoch(instant);
  effectiveBusinessTimePolicy(new Date(epoch), [policy]);
  const local = partsAt(epoch, policy.timezone);
  const localDate = formatDate(local);
  const cutoffInstant = businessDayBoundary(localDate, policy).valueOf();
  return epoch < cutoffInstant ? shiftDate(localDate, -1) : localDate;
}
