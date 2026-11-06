import { describe, expect, it } from "vitest";
import {
  BusinessDateSchema,
  CentsSchema,
  CurrencySchema,
  FractionSchema,
  InstantSchema,
  QuantitySchema,
  RateSchema,
} from "@/contracts/scalars";

describe("shared scalar schemas", () => {
  it("accepts and rejects cents at the bigint boundary", () => {
    expect(CentsSchema.safeParse("-9223372036854775808").success).toBe(true);
    expect(CentsSchema.safeParse("9223372036854775808").success).toBe(false);
    expect(CentsSchema.safeParse("1.00").success).toBe(false);
  });

  it("enforces quantity, rate, fraction and currency contracts", () => {
    expect(QuantitySchema.safeParse("1000000000").success).toBe(true);
    expect(QuantitySchema.safeParse("1000000000.000001").success).toBe(false);
    expect(QuantitySchema.safeParse("0.0000001").success).toBe(false);
    expect(RateSchema.safeParse("999999999999.999999999999").success).toBe(true);
    expect(RateSchema.safeParse("1000000000000").success).toBe(false);
    expect(FractionSchema.safeParse("0.99999999").success).toBe(true);
    expect(FractionSchema.safeParse("1").success).toBe(false);
    expect(CurrencySchema.safeParse("USD").success).toBe(true);
    expect(CurrencySchema.safeParse("CAD").success).toBe(false);
  });

  it("requires valid business dates and explicit offsets on instants", () => {
    expect(BusinessDateSchema.safeParse("2024-02-29").success).toBe(true);
    expect(BusinessDateSchema.safeParse("2025-02-29").success).toBe(false);
    expect(InstantSchema.safeParse("2026-11-01T01:30:00-07:00").success).toBe(true);
    expect(InstantSchema.safeParse("2026-11-01T01:30:00").success).toBe(false);
    expect(InstantSchema.safeParse("2025-02-30T12:00:00Z").success).toBe(false);
    expect(InstantSchema.safeParse("2025-02-29T12:00:00Z").success).toBe(false);
    expect(InstantSchema.safeParse("2024-02-29T12:00:00Z").success).toBe(true);
    expect(InstantSchema.safeParse("2026-04-31T12:00:00Z").success).toBe(false);
    expect(InstantSchema.safeParse("2026-13-01T12:00:00Z").success).toBe(false);
    expect(InstantSchema.safeParse("2026-01-00T12:00:00Z").success).toBe(false);
    expect(InstantSchema.safeParse("2026-01-01T12:00:00Z").success).toBe(true);
    expect(InstantSchema.safeParse("2026-01-01T12:00:00+05:30").success).toBe(true);
  });
});
