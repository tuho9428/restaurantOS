import { describe, expect, it } from "vitest";
import {
  INT64_MAX,
  allocateCents,
  decimalToString,
  divideDecimal,
  parseCents,
  parseDecimal,
  quantizeDecimal,
} from "@/lib/money";

describe("money and decimal primitives", () => {
  it("parses cents strictly and enforces PostgreSQL bigint bounds", () => {
    expect(parseCents("1250")).toBe(1250n);
    expect(parseCents("-1250")).toBe(-1250n);
    expect(() => parseCents("1.00")).toThrow();
    expect(() => parseCents("1e3")).toThrow();
    expect(() => parseCents("01")).toThrow();
    expect(() => parseCents((INT64_MAX + 1n).toString())).toThrow(/bigint bounds/);
  });

  it.each([
    ["1.005", 2, "1.01"],
    ["-1.005", 2, "-1.01"],
    ["-1.004", 2, "-1"],
    ["0.005", 2, "0.01"],
    ["-0.005", 2, "-0.01"],
  ])("quantizes %s to %i places as %s", (input, scale, expected) => {
    expect(decimalToString(quantizeDecimal(parseDecimal(input), scale as number))).toBe(expected);
  });

  it("retains exact decimal precision and divides to 50 significant digits", () => {
    const quotient = divideDecimal(parseDecimal("1"), parseDecimal("3"));
    expect(quotient.scale).toBe(50);
    expect(decimalToString(quotient)).toBe(`0.${"3".repeat(50)}`);
    expect(decimalToString(quantizeDecimal(parseDecimal("0.0000005"), 6), false)).toBe("0.000001");
    expect(() => parseDecimal("1.0001", 3)).toThrow(/fractional places/);
    expect(() => parseDecimal("1e4")).toThrow(/Invalid decimal/);
    expect(() => divideDecimal(parseDecimal("1"), parseDecimal("0"))).toThrow(/zero/);
    expect(decimalToString(parseDecimal("1234567890123456789012345678901234567890"))).toBe(
      "1234567890123456789012345678901234567890",
    );
  });

  it("allocates one cent deterministically and preserves signed totals", () => {
    const equalWeights = [parseDecimal("1"), parseDecimal("1"), parseDecimal("1")];
    expect(allocateCents(1n, equalWeights)).toEqual([1n, 0n, 0n]);
    expect(allocateCents(-1n, equalWeights)).toEqual([-1n, 0n, 0n]);
    expect(allocateCents(101n, [parseDecimal("1"), parseDecimal("2")])).toEqual([34n, 67n]);
    expect(() => allocateCents(1n, [])).toThrow();
    expect(() => allocateCents(1n, [parseDecimal("0"), parseDecimal("0")])).toThrow();
    expect(() => allocateCents(1n, [parseDecimal("-1")])).toThrow();
  });
});
