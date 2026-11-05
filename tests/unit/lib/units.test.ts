import { describe, expect, it } from "vitest";
import { convertQuantity, quantityDimension, toBaseQuantity } from "@/lib/units";
import { decimalToString } from "@/lib/money";

describe("quantity unit conversions", () => {
  it.each([
    ["1", "kg", "g", "1000"],
    ["1250.5", "g", "kg", "1.2505"],
    ["1.25", "L", "ml", "1250"],
    ["375", "ml", "L", "0.375"],
    ["0.5", "each", "each", "0.5"],
  ] as const)("converts %s %s to %s as %s", (quantity, from, to, result) => {
    expect(convertQuantity(quantity, from, to)).toBe(result);
  });

  it("keeps fractional count quantities and canonical base quantities exact", () => {
    expect(decimalToString(toBaseQuantity("0.125", "each"))).toBe("0.125");
    expect(quantityDimension("kg")).toBe("mass");
    expect(quantityDimension("L")).toBe("volume");
    expect(() => convertQuantity("1", "kg", "ml")).toThrow(/compatible dimension/);
    expect(() => convertQuantity("1", "each", "g")).toThrow(/compatible dimension/);
    expect(() => convertQuantity("NaN", "g", "kg")).toThrow();
  });
});
