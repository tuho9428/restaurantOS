import { z } from "zod";
import { INT64_MAX, INT64_MIN, parseCents, parseDecimal } from "@/lib/money";

const decimalText = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimalFits(value: string, scale: number, maxIntegerDigits: number, signed: boolean) {
  if (!decimalText.test(value) || (!signed && value.startsWith("-"))) return false;
  const [, , whole, fraction = ""] = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value) ?? [];
  if (whole === undefined || fraction.length > scale || whole.length > maxIntegerDigits)
    return false;
  try {
    parseDecimal(value, scale);
    return true;
  } catch {
    return false;
  }
}

/** JSON Cents scalar, bounded by PostgreSQL bigint. */
export const CentsSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/)
  .refine((value) => {
    try {
      const parsed = parseCents(value);
      return parsed >= INT64_MIN && parsed <= INT64_MAX;
    } catch {
      return false;
    }
  }, "Cents must fit PostgreSQL bigint");

/** JSON Qty scalar: <=6 decimal places and absolute value <= 1,000,000,000. */
export const QuantitySchema = z
  .string()
  .refine((value) => decimalFits(value, 6, 10, true), "Quantity must be a decimal with <=6 places")
  .refine((value) => {
    try {
      const parsed = parseDecimal(value);
      return (
        parsed.coefficient <= 1_000_000_000n * 10n ** BigInt(parsed.scale) &&
        parsed.coefficient >= -1_000_000_000n * 10n ** BigInt(parsed.scale)
      );
    } catch {
      return false;
    }
  }, "Quantity exceeds the supported range");

/** JSON Rate scalar: nonnegative numeric(24,12). */
export const RateSchema = z
  .string()
  .refine((value) => decimalFits(value, 12, 12, false), "Rate must be nonnegative with <=12 places")
  .refine((value) => {
    try {
      const parsed = parseDecimal(value);
      return (
        parsed.coefficient <=
        999_999_999_999n * 10n ** BigInt(parsed.scale) + (10n ** BigInt(parsed.scale) - 1n)
      );
    } catch {
      return false;
    }
  }, "Rate exceeds numeric(24,12)");

/** JSON Fraction scalar: [0,1), with at most eight fractional places. */
export const FractionSchema = z
  .string()
  .refine(
    (value) => decimalFits(value, 8, 1, false),
    "Fraction must be nonnegative with <=8 places",
  )
  .refine((value) => {
    try {
      const parsed = parseDecimal(value);
      return parsed.coefficient < 10n ** BigInt(parsed.scale);
    } catch {
      return false;
    }
  }, "Fraction must be less than one");

export const CurrencySchema = z.literal("USD");

/** Strict business-calendar date; interpretation always requires an explicit IANA zone. */
export const BusinessDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "BusinessDate must be a valid YYYY-MM-DD date");

export const InstantSchema = z.string().refine((value) => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    ,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59 ||
    (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}, "Instant must be RFC3339 with Z or an explicit UTC offset");
