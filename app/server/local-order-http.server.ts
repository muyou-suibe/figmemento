import {
  LocalOrderCreationService,
  type LocalOrderCreationDependencies,
} from "../application/local-order-creation.ts";
import {
  projectLocalOrderSnapshot,
  parseLocalOrderCreateRequest,
  isLocalOrderPublicReference,
  type LocalOrderPublicProjection,
} from "../domain/local-order.ts";
import type { LocalOrderBrowserCapability } from "../application/local-order-repository.ts";
import { readTrustedLocalOrderConfig } from "../config/local-order-runtime.ts";
import { createServerCatalogRepository } from "../infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../infrastructure/customization/server-customization-field-repository.ts";
import {
  resolveLocalCouponFixture,
  resolveLocalShippingFixture,
} from "../infrastructure/local-checkout/local-checkout-fixtures.ts";
import { getShoppingCartProvider, readShoppingCartId } from "./shopping-cart-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { resolveLocalCustomerUploadReceiptAuthority } from "./customer-upload-runtime.server.ts";
import { getSharedLocalOrderRepository } from "./local-order-runtime.server.ts";
import { readAuthenticatedCustomer } from "./customer-auth-http.server.ts";
import { evaluateLocalPromotion } from "../application/local-promotion.ts";
import { readLocalCustomerCommerceContext } from "./local-commerce-context.server.ts";
import { getSharedCustomerPointsRepository } from "./customer-points-runtime.server.ts";
import type { LocalOrderRepository } from "../application/local-order-repository.ts";
import { getSharedLocalNotificationOutbox } from "./local-notification-runtime.server.ts";
import { persistentOrderCreateHttp, type PersistentOrderHttpDependencies } from "./local-persistent-order-http.server.ts";
import { readPersistentOrderHistory } from "./local-persistent-order-history.server.ts";

export const LOCAL_ORDER_ACCESS_COOKIE_NAME = "figmemento-local-order-access";
const MAX_CREATE_BODY_BYTES = 32 * 1024;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

type LocalOrderPublicFailure = {
  readonly status: "blocked" | "unavailable";
  readonly issues: readonly { readonly code: string; readonly message: string }[];
};

function jsonResponse(value: LocalOrderPublicProjection | LocalOrderPublicFailure, status: number, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function safeFailure(
  status: "blocked" | "unavailable",
  code: string,
  message: string,
  httpStatus: number,
): Response {
  return jsonResponse({ status, issues: [{ code, message }] }, httpStatus);
}

function parseCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  let value: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (!entry.startsWith(`${name}=`)) continue;
    try {
      const candidate = decodeURIComponent(entry.slice(name.length + 1));
      if (candidate.length <= 200) value = candidate;
    } catch {
      value = null;
    }
  }
  return value;
}

export function readLocalOrderBrowserCapability(request: Request): LocalOrderBrowserCapability | undefined {
  const value = parseCookieValue(request, LOCAL_ORDER_ACCESS_COOKIE_NAME);
  return value && CAPABILITY_PATTERN.test(value) ? value as LocalOrderBrowserCapability : undefined;
}

function localOrderAccessCookieHeader(capability: LocalOrderBrowserCapability): string {
  return `${LOCAL_ORDER_ACCESS_COOKIE_NAME}=${encodeURIComponent(capability)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > MAX_CREATE_BODY_BYTES) {
    throw new Error("body_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CREATE_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function parserFailure(issues: readonly { readonly path: string; readonly code: string }[]): Response {
  return jsonResponse({
    status: "blocked",
    issues: issues.map((entry) => ({
      code: "INVALID_CHECKOUT_INPUT",
      message: `Checkout input is invalid (${entry.code}).`,
    })),
  }, 400);
}

export interface LocalOrderHttpHandlerDependencies {
  readonly persistent?: PersistentOrderHttpDependencies;
  readonly readConfig?: typeof readTrustedLocalOrderConfig;
  readonly getCartProvider?: typeof getShoppingCartProvider;
  readonly createCatalogRepository?: typeof createServerCatalogRepository;
  readonly createCustomizationRepository?: typeof createServerCustomizationFieldRepository;
  readonly resolveUploadAuthority?: typeof resolveLocalCustomerUploadReceiptAuthority;
  readonly getRepository?: () => LocalOrderRepository;
  readonly createService?: (dependencies: LocalOrderCreationDependencies) => LocalOrderCreationService;
}

function sourceFailure(): Response {
  return safeFailure("unavailable", "LOCAL_ORDER_UNAVAILABLE", "Local Order is temporarily unavailable.", 503);
}

export function createLocalOrderCreateHttpHandler(
  overrides: LocalOrderHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalOrderConfig;
  const getCartProvider = overrides.getCartProvider ?? getShoppingCartProvider;
  const createCatalogRepository = overrides.createCatalogRepository ?? createServerCatalogRepository;
  const createCustomizationRepository = overrides.createCustomizationRepository ?? createServerCustomizationFieldRepository;
  const resolveUploadAuthority = overrides.resolveUploadAuthority ?? resolveLocalCustomerUploadReceiptAuthority;
  const getRepository = overrides.getRepository ?? getSharedLocalOrderRepository;
  const createService = overrides.createService ?? ((dependencies) => new LocalOrderCreationService(dependencies));

  return async function handleLocalOrderCreate(request: Request): Promise<Response> {
    if (request.method !== "POST") return safeFailure("blocked", "METHOD_NOT_ALLOWED", "Method not allowed.", 405);
    if (!isSameOriginCartMutation(request)) return safeFailure("blocked", "LOCAL_ORDER_UNAVAILABLE", "Local Order request was not allowed.", 403);

    let rawInput: unknown;
    try {
      rawInput = await readBoundedJson(request);
    } catch {
      return safeFailure("blocked", "INVALID_CHECKOUT_INPUT", "Checkout input is invalid.", 400);
    }
    // Preserve the original fake parser-before-source failure ordering.
    if (process.env.LOCAL_ORDER_SOURCE?.trim() !== "local_persistent") {
      const legacyParsed = parseLocalOrderCreateRequest(rawInput);
      if (!legacyParsed.ok) return parserFailure(legacyParsed.issues);
    }
    let configuration;
    try {
      configuration = readConfig();
    } catch {
      return sourceFailure();
    }
    if (configuration.source === "local_persistent") {
      return persistentOrderCreateHttp(request, rawInput, { ...process.env, NODE_ENV: configuration.runtimeMode }, overrides.persistent);
    }
    const parsed = parseLocalOrderCreateRequest(rawInput);
    if (!parsed.ok) return parserFailure(parsed.issues);
    if (configuration.source !== "local_fake") return sourceFailure();

    const authenticatedCustomer = await readAuthenticatedCustomer(request);
    const commerceContext = await readLocalCustomerCommerceContext(request, parsed.value.address.email);

    const cartId = readShoppingCartId(request);
    const cartProvider = getCartProvider();
    if (!cartProvider) return safeFailure("unavailable", "CART_UNAVAILABLE", "Your Cart is temporarily unavailable.", 503);

    let uploadAuthority;
    try {
      uploadAuthority = await resolveUploadAuthority(request);
    } catch {
      uploadAuthority = null;
    }

    let catalogSource;
    try {
      catalogSource = await createCatalogRepository();
    } catch {
      return safeFailure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }
    if (catalogSource.status !== "found") {
      return safeFailure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }

    let customizationSource;
    try {
      customizationSource = createCustomizationRepository();
    } catch {
      return safeFailure("unavailable", "CUSTOMIZATION_UNAVAILABLE", "Customization cannot be verified.", 503);
    }
    if (customizationSource.source !== catalogSource.value.source) {
      return safeFailure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }

    const service = createService({
      repository: getRepository(),
      ...(authenticatedCustomer ? { customerId: authenticatedCustomer.id } : {}),
      promotionResolver: evaluateLocalPromotion,
      firstOrderEligible: commerceContext.firstOrderEligible,
      pointsBalance: commerceContext.pointsBalance,
      pointsRepository: getSharedCustomerPointsRepository(),
      cartReader: cartProvider,
      catalogRepository: catalogSource.value.repository,
      customizationFieldRepository: customizationSource.repository,
      shippingResolver: resolveLocalShippingFixture,
      couponResolver: resolveLocalCouponFixture,
      ...(uploadAuthority
        ? {
            receiptRepository: uploadAuthority.receiptRepository,
            verifiedOwnerId: uploadAuthority.ownerId,
          }
        : {}),
    });

    const result = await service.create(cartId, parsed.value, readLocalOrderBrowserCapability(request));
    if ("issues" in result) {
      if (result.status === "conflict") return jsonResponse({ status: "blocked", issues: result.issues }, 409);
      if (result.status === "failed") return sourceFailure();
      return jsonResponse({ status: result.status, issues: result.issues }, result.status === "blocked" ? 409 : 503);
    }

    if (result.status === "created") {
      getSharedLocalNotificationOutbox().enqueue({
        recipient: result.snapshot.contact.email,
        type: "order_created",
        reference: result.snapshot.publicReference,
        payload: {
          email: result.snapshot.contact.email,
          totalCents: String(result.snapshot.commercial.localArithmeticTotalCents),
        },
        createdAt: result.snapshot.createdAt,
      });
    }
    const projection = projectLocalOrderSnapshot(result.snapshot);
    const currentCapability = readLocalOrderBrowserCapability(request);
    const shouldSetCookie = currentCapability !== result.browserCapability || result.capabilityStatus !== "unchanged";
    return jsonResponse(
      projection,
      200,
      shouldSetCookie ? { "set-cookie": localOrderAccessCookieHeader(result.browserCapability) } : undefined,
    );
  };
}

export function createLocalOrderReadHttpHandler(
  overrides: Pick<LocalOrderHttpHandlerDependencies, "readConfig" | "getRepository"> = {},
): (request: Request, publicReference: string) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalOrderConfig;
  const getRepository = overrides.getRepository ?? getSharedLocalOrderRepository;

  return async function handleLocalOrderRead(request: Request, publicReference: string): Promise<Response> {
    if (request.method !== "GET") return safeFailure("blocked", "METHOD_NOT_ALLOWED", "Method not allowed.", 405);
    if (!isLocalOrderPublicReference(publicReference)) return safeFailure("unavailable", "LOCAL_ORDER_UNAVAILABLE", "Local Order is unavailable.", 404);
    if (process.env.LOCAL_ORDER_SOURCE?.trim() === "local_persistent") {
      const history = await readPersistentOrderHistory(request, { publicReference }, process.env);
      return history.status === "found"
        ? Response.json(history.value, { headers: { "cache-control": "no-store" } })
        : safeFailure("unavailable", "LOCAL_ORDER_UNAVAILABLE", "Local Order is unavailable.", 404);
    }
    try {
      if (readConfig().source !== "local_fake") return sourceFailure();
    } catch {
      return sourceFailure();
    }
    const capability = readLocalOrderBrowserCapability(request);
    if (!capability) return safeFailure("unavailable", "LOCAL_ORDER_UNAVAILABLE", "Local Order is unavailable.", 404);
    try {
      const result = await getRepository().findAuthorizedSnapshot(publicReference, capability);
      return result.status === "found"
        ? jsonResponse(projectLocalOrderSnapshot(result.snapshot), 200)
        : safeFailure("unavailable", "LOCAL_ORDER_UNAVAILABLE", "Local Order is unavailable.", 404);
    } catch {
      return sourceFailure();
    }
  };
}
