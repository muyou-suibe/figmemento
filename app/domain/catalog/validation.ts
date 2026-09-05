export type CatalogValidationCode =
  | "duplicate"
  | "incomplete"
  | "invalid_format"
  | "invalid_type"
  | "invalid_value"
  | "ownership"
  | "required"
  | "unavailable"
  | "unknown_field";

export interface CatalogValidationIssue {
  path: string;
  code: CatalogValidationCode;
  message: string;
}

export type CatalogValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: CatalogValidationIssue[] };

export function validationSuccess<T>(value: T): CatalogValidationResult<T> {
  return { ok: true, value };
}

export function validationFailure<T = never>(
  ...issues: CatalogValidationIssue[]
): CatalogValidationResult<T> {
  return { ok: false, issues };
}

export function validationIssue(
  path: string,
  code: CatalogValidationCode,
  message: string,
): CatalogValidationIssue {
  return { path, code, message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unknownFieldIssues(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  path = "$",
): CatalogValidationIssue[] {
  const allowed = new Set(allowedFields);
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) =>
      validationIssue(
        `${path}.${field}`,
        "unknown_field",
        `Field '${field}' is not part of this catalog contract.`,
      ),
    );
}

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

export function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

export function isCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value)
  );
}

export function isSkuCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  );
}

export function isNonEmptyString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}
