/** Exact decimal and money primitives. Never pass JS numbers into accounting helpers. */

export interface DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;
}

export const INT64_MIN = -(1n << 63n);
export const INT64_MAX = (1n << 63n) - 1n;
const MAX_DECIMAL_DIGITS = 1000;

function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_DECIMAL_DIGITS) {
    throw new RangeError("Decimal precision is out of range");
  }
  return 10n ** BigInt(exponent);
}

function roundQuotientHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Denominator must not be zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Parses a strict, non-exponent decimal string without binary floating-point conversion. */
export function parseDecimal(value: string, maxScale?: number): DecimalValue {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DECIMAL_DIGITS + 2) {
    throw new TypeError("Expected a decimal string");
  }
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new TypeError("Invalid decimal string");
  const fraction = match[3] ?? "";
  if (maxScale !== undefined && fraction.length > maxScale) {
    throw new RangeError(`Decimal supports at most ${maxScale} fractional places`);
  }
  const digits = `${match[2]}${fraction}`;
  const coefficient = BigInt(`${match[1]}${digits}`);
  return { coefficient, scale: fraction.length };
}

export function decimalFromInteger(value: bigint): DecimalValue {
  return { coefficient: value, scale: 0 };
}

export function addDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * pow10(scale - left.scale) + right.coefficient * pow10(scale - right.scale),
    scale,
  };
}

export function subtractDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  return addDecimal(left, { coefficient: -right.coefficient, scale: right.scale });
}

export function multiplyDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  return { coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale };
}

/** Divides to the requested significant precision (50 by default), rounding HALF_UP. */
export function divideDecimal(
  numerator: DecimalValue,
  denominator: DecimalValue,
  significantDigits = 50,
): DecimalValue {
  if (denominator.coefficient === 0n) throw new RangeError("Denominator must not be zero");
  if (!Number.isInteger(significantDigits) || significantDigits < 1 || significantDigits > 100) {
    throw new RangeError("Significant precision must be between 1 and 100");
  }
  const negative = numerator.coefficient < 0n !== denominator.coefficient < 0n;
  const n = numerator.coefficient < 0n ? -numerator.coefficient : numerator.coefficient;
  const d = denominator.coefficient < 0n ? -denominator.coefficient : denominator.coefficient;
  if (n === 0n) return { coefficient: 0n, scale: significantDigits - 1 };

  // Estimate the quotient's base-10 exponent, then correct the estimate exactly.
  let exponent = n.toString().length - d.toString().length + denominator.scale - numerator.scale;
  const compareAtExponent = (candidate: number): number => {
    const shift = denominator.scale - numerator.scale - candidate;
    const lhs = shift >= 0 ? n * pow10(shift) : n;
    const rhs = shift < 0 ? d * pow10(-shift) : d;
    return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
  };
  while (compareAtExponent(exponent) < 0) exponent--;
  while (compareAtExponent(exponent + 1) >= 0) exponent++;
  const scale = Math.max(0, significantDigits - 1 - exponent);
  const shift = denominator.scale + scale - numerator.scale;
  const scaledNumerator = shift >= 0 ? n * pow10(shift) : n;
  const scaledDenominator = shift < 0 ? d * pow10(-shift) : d;
  const coefficient = roundQuotientHalfUp(scaledNumerator, scaledDenominator);
  return { coefficient: negative ? -coefficient : coefficient, scale };
}

/** Quantizes to a fixed number of fractional places using ties away from zero. */
export function quantizeDecimal(value: DecimalValue, targetScale: number): DecimalValue {
  if (!Number.isInteger(targetScale) || targetScale < 0 || targetScale > MAX_DECIMAL_DIGITS) {
    throw new RangeError("Target scale is out of range");
  }
  if (value.scale <= targetScale) {
    return {
      coefficient: value.coefficient * pow10(targetScale - value.scale),
      scale: targetScale,
    };
  }
  return {
    coefficient: roundQuotientHalfUp(value.coefficient, pow10(value.scale - targetScale)),
    scale: targetScale,
  };
}

export function decimalToString(value: DecimalValue, trimTrailingZeros = true): string {
  const negative = value.coefficient < 0n;
  let digits = (negative ? -value.coefficient : value.coefficient).toString();
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  digits = digits.padStart(value.scale + 1, "0");
  const point = digits.length - value.scale;
  let fraction = digits.slice(point);
  if (trimTrailingZeros) fraction = fraction.replace(/0+$/, "");
  const whole = digits.slice(0, point);
  return `${negative ? "-" : ""}${whole}${fraction.length ? `.${fraction}` : ""}`;
}

/** Strict JSON cents parser: signed base-10 integer string within PostgreSQL bigint bounds. */
export function parseCents(value: string): bigint {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d*)$/.test(value)) {
    throw new TypeError("Cents must be a signed base-10 integer string");
  }
  const cents = BigInt(value);
  if (cents < INT64_MIN || cents > INT64_MAX) throw new RangeError("Cents exceed bigint bounds");
  return cents;
}

export function centsToJson(value: bigint): string {
  if (value < INT64_MIN || value > INT64_MAX) throw new RangeError("Cents exceed bigint bounds");
  return value.toString();
}

/** Distributes every cent proportionally; largest remainders break ties by input order. */
export function allocateCents(total: bigint, weights: readonly DecimalValue[]): bigint[] {
  if (total < INT64_MIN || total > INT64_MAX) throw new RangeError("Cents exceed bigint bounds");
  if (weights.length === 0) {
    if (total === 0n) return [];
    throw new RangeError("Cannot allocate a nonzero total without recipients");
  }
  if (weights.some((weight) => weight.coefficient < 0n)) {
    throw new RangeError("Allocation weights must be nonnegative");
  }
  const scale = Math.max(...weights.map((weight) => weight.scale));
  const integers = weights.map((weight) => weight.coefficient * pow10(scale - weight.scale));
  const sum = integers.reduce((acc, weight) => acc + weight, 0n);
  if (sum === 0n) throw new RangeError("Allocation weights must have a positive sum");
  const sign = total < 0n ? -1n : 1n;
  const magnitude = total < 0n ? -total : total;
  const shares = integers.map((weight) => (magnitude * weight) / sum);
  const remainders = integers.map((weight, index) => ({
    index,
    remainder: (magnitude * weight) % sum,
  }));
  let residual = magnitude - shares.reduce((acc, share) => acc + share, 0n);
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let i = 0; residual > 0n; i++, residual--)
    shares[remainders[i % remainders.length]!.index]!++;
  return shares.map((share) => {
    const allocation = sign * share;
    if (allocation < INT64_MIN || allocation > INT64_MAX) {
      throw new RangeError("Allocated cents exceed bigint bounds");
    }
    return allocation;
  });
}
