import { decimalToString, multiplyDecimal, parseDecimal, type DecimalValue } from "./money";

export type QuantityUnit = "g" | "kg" | "ml" | "L" | "each";
type UnitDimension = "mass" | "volume" | "count";

const unitDefinition: Readonly<
  Record<QuantityUnit, { dimension: UnitDimension; basePower: number }>
> = {
  g: { dimension: "mass", basePower: 0 },
  kg: { dimension: "mass", basePower: 3 },
  ml: { dimension: "volume", basePower: 0 },
  L: { dimension: "volume", basePower: 3 },
  each: { dimension: "count", basePower: 0 },
};

/** Converts an exact decimal quantity; mass/volume conversions never infer density. */
export function convertQuantity(value: string, from: QuantityUnit, to: QuantityUnit): string {
  const source = unitDefinition[from];
  const target = unitDefinition[to];
  if (source.dimension !== target.dimension) {
    throw new RangeError(`Cannot convert ${from} to ${to} without a compatible dimension`);
  }
  const quantity = parseDecimal(value);
  const shift = source.basePower - target.basePower;
  const converted =
    shift >= 0
      ? { coefficient: quantity.coefficient * 10n ** BigInt(shift), scale: quantity.scale }
      : { coefficient: quantity.coefficient, scale: quantity.scale - shift };
  return decimalToString(converted);
}

/** Converts quantity to canonical base units: g, ml, or each. */
export function toBaseQuantity(value: string, unit: QuantityUnit): DecimalValue {
  const definition = unitDefinition[unit];
  return multiplyDecimal(parseDecimal(value), {
    coefficient: 10n ** BigInt(definition.basePower),
    scale: 0,
  });
}

export function quantityDimension(unit: QuantityUnit): UnitDimension {
  return unitDefinition[unit].dimension;
}
