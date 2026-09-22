/** Canonical plain decimal values use four fixed fractional places internally. */
export function parseExactDecimal(value: unknown): { canonical: string; scaled: bigint } | null {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const scale = BigInt(10000);
  const zero = BigInt(0);
  const scaled = (BigInt(whole) * scale + BigInt(fraction.padEnd(4, "0"))) * (negative ? -BigInt(1) : BigInt(1));
  const absolute = scaled < zero ? -scaled : scaled;
  const integral = absolute / scale;
  const decimals = (absolute % scale).toString().padStart(4, "0").replace(/0+$/, "");
  return { canonical: `${scaled < zero ? "-" : ""}${integral}${decimals ? `.${decimals}` : ""}`, scaled };
}
