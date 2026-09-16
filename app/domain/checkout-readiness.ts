export type CheckoutReadinessState = "ready" | "blocked" | "unavailable";

export type CheckoutReadinessIssueCode =
  | "EMPTY_CART"
  | "CART_UNAVAILABLE"
  | "ITEM_UNAVAILABLE"
  | "CATALOG_CHANGED"
  | "PRICE_CHANGED"
  | "CURRENCY_CHANGED"
  | "OPTIONS_CHANGED"
  | "FULFILLMENT_CHANGED"
  | "CUSTOMIZATION_INVALID"
  | "CUSTOMIZATION_STALE"
  | "UPLOAD_UNAVAILABLE"
  | "UPLOAD_INVALID"
  | "ORDER_PERSISTENCE_UNAVAILABLE"
  | "SHIPPING_UNAVAILABLE"
  | "TAX_UNAVAILABLE"
  | "DISCOUNT_UNAVAILABLE"
  | "PAYMENT_UNAVAILABLE"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_UNAVAILABLE";

export interface CheckoutReadinessIssue {
  readonly code: CheckoutReadinessIssueCode;
  readonly message: string;
}

export type CheckoutReadinessDependencyName =
  | "order_persistence"
  | "shipping"
  | "tax"
  | "discount"
  | "payment";

export type CheckoutReadinessDependencyStatus =
  | "satisfied"
  | "not_activated"
  | "unavailable";

export interface CheckoutReadinessDependency {
  readonly name: CheckoutReadinessDependencyName;
  readonly status: CheckoutReadinessDependencyStatus;
  readonly issue?: CheckoutReadinessIssue;
}

export interface CheckoutReadinessLine {
  readonly lineId: string;
  readonly productName: string;
  readonly skuCode: string;
  readonly state: CheckoutReadinessState;
  readonly issues: readonly CheckoutReadinessIssue[];
}

export interface CheckoutReadinessReport {
  readonly state: CheckoutReadinessState;
  readonly issues: readonly CheckoutReadinessIssue[];
  readonly lines: readonly CheckoutReadinessLine[];
  readonly dependencies: readonly CheckoutReadinessDependency[];
  readonly evaluatedAt: string;
}

const issueMessages: Readonly<Record<CheckoutReadinessIssueCode, string>> = {
  EMPTY_CART: "Your Cart is empty.",
  CART_UNAVAILABLE: "Your Cart is temporarily unavailable.",
  ITEM_UNAVAILABLE: "One item in your Cart needs review.",
  CATALOG_CHANGED: "A product in your Cart has changed and needs review.",
  PRICE_CHANGED: "A Cart price has changed and needs review.",
  CURRENCY_CHANGED: "A Cart currency has changed and needs review.",
  OPTIONS_CHANGED: "A Cart option selection has changed and needs review.",
  FULFILLMENT_CHANGED: "A Cart fulfillment detail has changed and needs review.",
  CUSTOMIZATION_INVALID: "A personalization needs review.",
  CUSTOMIZATION_STALE: "A personalization configuration has changed and needs review.",
  UPLOAD_UNAVAILABLE: "An image personalization cannot be revalidated yet.",
  UPLOAD_INVALID: "An image personalization needs review.",
  ORDER_PERSISTENCE_UNAVAILABLE: "Order preparation is not available yet.",
  SHIPPING_UNAVAILABLE: "Shipping preparation is not available yet.",
  TAX_UNAVAILABLE: "Tax preparation is not available yet.",
  DISCOUNT_UNAVAILABLE: "Discount preparation is not available yet.",
  PAYMENT_UNAVAILABLE: "Payment preparation is not available yet.",
  DEPENDENCY_UNAVAILABLE: "A required checkout dependency is temporarily unavailable.",
  INTERNAL_UNAVAILABLE: "Readiness cannot be evaluated right now.",
};

export function readinessIssue(code: CheckoutReadinessIssueCode): CheckoutReadinessIssue {
  return { code, message: issueMessages[code] };
}

export function readinessIssueMessage(code: CheckoutReadinessIssueCode): string {
  return issueMessages[code];
}

function dependencyIssue(
  name: CheckoutReadinessDependencyName,
  status: Exclude<CheckoutReadinessDependencyStatus, "satisfied">,
): CheckoutReadinessIssue {
  if (status === "unavailable") return readinessIssue("DEPENDENCY_UNAVAILABLE");
  switch (name) {
    case "order_persistence": return readinessIssue("ORDER_PERSISTENCE_UNAVAILABLE");
    case "shipping": return readinessIssue("SHIPPING_UNAVAILABLE");
    case "tax": return readinessIssue("TAX_UNAVAILABLE");
    case "discount": return readinessIssue("DISCOUNT_UNAVAILABLE");
    case "payment": return readinessIssue("PAYMENT_UNAVAILABLE");
  }
}

export function classifyDependency(
  name: CheckoutReadinessDependencyName,
  status: CheckoutReadinessDependencyStatus,
): CheckoutReadinessDependency {
  return status === "satisfied"
    ? { name, status }
    : { name, status, issue: dependencyIssue(name, status) };
}

function uniqueIssues(issues: readonly CheckoutReadinessIssue[]): readonly CheckoutReadinessIssue[] {
  const seen = new Set<CheckoutReadinessIssueCode>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) return false;
    seen.add(issue.code);
    return true;
  });
}

export function readinessStateForIssues(
  issues: readonly CheckoutReadinessIssue[],
): CheckoutReadinessState {
  return issues.some((issue) => issue.code === "DEPENDENCY_UNAVAILABLE"
    || issue.code === "CART_UNAVAILABLE"
    || issue.code === "INTERNAL_UNAVAILABLE"
    || issue.code === "UPLOAD_UNAVAILABLE")
    ? "unavailable"
    : issues.length > 0 ? "blocked" : "ready";
}

export function aggregateCheckoutReadiness(input: {
  readonly evaluatedAt: string;
  readonly lines: readonly CheckoutReadinessLine[];
  readonly issues?: readonly CheckoutReadinessIssue[];
  readonly dependencies?: readonly CheckoutReadinessDependency[];
}): CheckoutReadinessReport {
  // Dependency status is authoritative. Caller-supplied issue objects are
  // normalized so an unavailable dependency cannot be downgraded to blocked.
  const dependencies = (input.dependencies ?? []).map((dependency) =>
    classifyDependency(dependency.name, dependency.status));
  const lineIssues = input.lines.flatMap((line) => line.issues);
  const dependencyIssues = dependencies.flatMap((dependency) => dependency.issue ? [dependency.issue] : []);
  const issues = uniqueIssues([
    ...(input.issues ?? []),
    ...lineIssues,
    ...dependencyIssues,
  ]);
  return {
    state: readinessStateForIssues(issues),
    issues,
    lines: input.lines,
    dependencies,
    evaluatedAt: input.evaluatedAt,
  };
}

export function emptyCartReadiness(evaluatedAt: string): CheckoutReadinessReport {
  const issue = readinessIssue("EMPTY_CART");
  return aggregateCheckoutReadiness({ evaluatedAt, lines: [], issues: [issue] });
}

export function unavailableReadiness(
  evaluatedAt: string,
  code: "CART_UNAVAILABLE" | "INTERNAL_UNAVAILABLE" | "UPLOAD_UNAVAILABLE" = "INTERNAL_UNAVAILABLE",
): CheckoutReadinessReport {
  return aggregateCheckoutReadiness({
    evaluatedAt,
    lines: [],
    issues: [readinessIssue(code)],
  });
}
