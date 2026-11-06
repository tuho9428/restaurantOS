import { describe, expect, it } from "vitest";
import {
  businessDateForInstant,
  businessDateRangeWindow,
  businessDayBoundary,
  businessDayWindow,
  effectiveBusinessTimePolicy,
  localDateTimeToInstant,
  type BusinessTimePolicy,
} from "@/lib/business-time";

const defaultPolicy: BusinessTimePolicy = {
  timezone: "America/Los_Angeles",
  cutoff: "03:00",
  effectiveFrom: "2020-01-01T00:00:00.000Z",
  effectiveTo: null,
};

describe("restaurant business time", () => {
  it("uses the cutoff as an inclusive business-date boundary", () => {
    expect(businessDateForInstant("2026-01-01T10:59:59.000Z", defaultPolicy)).toBe("2025-12-31");
    expect(businessDateForInstant("2026-01-01T11:00:00.000Z", defaultPolicy)).toBe("2026-01-01");
    expect(businessDateForInstant("2026-01-01T11:00:01.000Z", defaultPolicy)).toBe("2026-01-01");
    expect(businessDayWindow("2026-01-01", defaultPolicy)).toEqual({
      from: "2026-01-01T11:00:00.000Z",
      to: "2026-01-02T11:00:00.000Z",
    });
  });

  it("computes 23-hour and 25-hour calendar business days without 24-hour arithmetic", () => {
    const spring = businessDayWindow("2026-03-07", defaultPolicy);
    const fall = businessDayWindow("2026-10-31", defaultPolicy);
    expect(Date.parse(spring.to) - Date.parse(spring.from)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(fall.to) - Date.parse(fall.from)).toBe(25 * 60 * 60 * 1000);
  });

  it("resolves a nonexistent cutoff to the first valid local minute after the gap", () => {
    const policy = { timezone: "America/Los_Angeles", cutoff: "02:30" };
    expect(businessDayBoundary("2026-03-08", policy).toISOString()).toBe(
      "2026-03-08T10:00:00.000Z",
    );
  });

  it.each([
    ["02:30:30", "2026-03-08T10:00:00.000Z"],
    ["02:59:59", "2026-03-08T10:00:00.000Z"],
  ])("drops nonexistent cutoff seconds for %s", (cutoff, expected) => {
    expect(
      businessDayBoundary("2026-03-08", { timezone: "America/Los_Angeles", cutoff }).toISOString(),
    ).toBe(expected);
  });

  it("resolves a non-one-hour DST gap without timezone-specific transition rules", () => {
    expect(
      businessDayBoundary("2026-10-04", {
        timezone: "Australia/Lord_Howe",
        cutoff: "02:15:45",
      }).toISOString(),
    ).toBe("2026-10-03T15:30:00.000Z");
  });

  it("chooses the earlier occurrence for a repeated business cutoff", () => {
    const policy = { timezone: "America/Los_Angeles", cutoff: "01:30" };
    expect(businessDayBoundary("2026-11-01", policy).toISOString()).toBe(
      "2026-11-01T08:30:00.000Z",
    );
  });

  it("rejects nonexistent local times and requires an offset for repeated times", () => {
    expect(() => localDateTimeToInstant("2026-03-08T02:30:00", "America/Los_Angeles")).toThrow(
      /does not exist/,
    );
    expect(() => localDateTimeToInstant("2026-11-01T01:30:00", "America/Los_Angeles")).toThrow(
      /requires an explicit offset/,
    );
    expect(localDateTimeToInstant("2026-11-01T01:30:00", "America/Los_Angeles", "-07:00")).toBe(
      "2026-11-01T08:30:00.000Z",
    );
    expect(localDateTimeToInstant("2026-11-01T01:30:00", "America/Los_Angeles", "-08:00")).toBe(
      "2026-11-01T09:30:00.000Z",
    );
    expect(() =>
      localDateTimeToInstant("2026-11-01T01:30:00", "America/Los_Angeles", "-06:00"),
    ).toThrow(/does not match/);
  });

  it("preserves valid local times immediately before and after the spring gap", () => {
    expect(localDateTimeToInstant("2026-03-08T01:59:59", "America/Los_Angeles")).toBe(
      "2026-03-08T09:59:59.000Z",
    );
    expect(localDateTimeToInstant("2026-03-08T03:00:00", "America/Los_Angeles")).toBe(
      "2026-03-08T10:00:00.000Z",
    );
  });

  it("assigns instants around a gap-normalized business cutoff to the correct business dates", () => {
    const gapCutoff = {
      ...defaultPolicy,
      cutoff: "02:30:30",
    };
    expect(businessDateForInstant("2026-03-08T09:59:59.999Z", gapCutoff)).toBe("2026-03-07");
    expect(businessDateForInstant("2026-03-08T10:00:00.000Z", gapCutoff)).toBe("2026-03-08");
    expect(businessDateForInstant("2026-03-08T10:00:00.001Z", gapCutoff)).toBe("2026-03-08");
  });

  it("selects effective policy versions and produces half-open date ranges", () => {
    const prior = { ...defaultPolicy, effectiveTo: "2026-01-01T00:00:00.000Z" };
    const next = {
      ...defaultPolicy,
      timezone: "UTC",
      cutoff: "00:00",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    };
    expect(effectiveBusinessTimePolicy("2025-12-31T23:59:59.999Z", [prior, next])).toBe(prior);
    expect(effectiveBusinessTimePolicy("2026-01-01T00:00:00.000Z", [prior, next])).toBe(next);
    const range = businessDateRangeWindow("2026-01-01", "2026-01-03", defaultPolicy);
    expect(range).toEqual({ from: "2026-01-01T11:00:00.000Z", to: "2026-01-03T11:00:00.000Z" });
    expect(() => businessDateRangeWindow("2026-01-03", "2026-01-03", defaultPolicy)).toThrow(
      /increasing/,
    );
    expect(() =>
      effectiveBusinessTimePolicy("2026-01-01T00:00:00Z", [defaultPolicy, defaultPolicy]),
    ).toThrow(/overlap/);
    expect(() => effectiveBusinessTimePolicy("2026-01-01T00:00:00", [defaultPolicy])).toThrow(
      /explicit UTC offset/,
    );
  });

  it.each([
    "2025-02-30T12:00:00Z",
    "2025-02-29T12:00:00Z",
    "2026-04-31T12:00:00Z",
    "2026-13-01T12:00:00Z",
    "2026-01-00T12:00:00Z",
  ])("rejects invalid calendar date in an instant: %s", (instant) => {
    expect(() => effectiveBusinessTimePolicy(instant, [defaultPolicy])).toThrow(/calendar date/);
  });

  it("accepts a valid leap-day instant", () => {
    expect(effectiveBusinessTimePolicy("2024-02-29T12:00:00Z", [defaultPolicy])).toBe(
      defaultPolicy,
    );
  });

  it("handles month and year rollover and rejects invalid zones/dates", () => {
    expect(
      businessDayWindow("2025-12-31", { ...defaultPolicy, timezone: "UTC", cutoff: "00:00" }).to,
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(() => businessDayWindow("2026-02-30", defaultPolicy)).toThrow(/date/i);
    expect(() =>
      businessDayBoundary("2026-01-01", { timezone: "Not/AZone", cutoff: "03:00" }),
    ).toThrow(/timezone/);
  });
});
