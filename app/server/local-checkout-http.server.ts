import {
  LocalCheckoutEvaluator,
  type LocalCheckoutEvaluatorDependencies,
} from "../application/local-checkout-evaluator.ts";
import {
  projectLocalCheckoutResult,
  type LocalCheckoutPublicProjection,
} from "../application/local-checkout-public.ts";
import { readTrustedLocalCheckoutConfig } from "../config/local-checkout-runtime.ts";
import {
  parseLocalCheckoutRequest,
  type LocalCheckoutIssue,
} from "../domain/local-checkout.ts";
import { createServerCatalogRepository } from "../infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../infrastructure/customization/server-customization-field-repository.ts";
import { getShoppingCartProvider, readShoppingCartId } from "./shopping-cart-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { resolveLocalCustomerUploadReceiptAuthority } from "./customer-upload-runtime.server.ts";
import {
  resolveLocalCouponFixture,
  resolveLocalShippingFixture,
} from "../infrastructure/local-checkout/local-checkout-fixtures.ts";
import { evaluateLocalPromotion } from "../application/local-promotion.ts";
import { readLocalCustomerCommerceContext } from "./local-commerce-context.server.ts";
import { persistentCheckoutHttp } from "./local-persistent-checkout-http.server.ts";

export interface LocalCheckoutHttpHandlerDependencies {
  readonly readConfig?: typeof readTrustedLocalCheckoutConfig;
  readonly getCartProvider?: typeof getShoppingCartProvider;
  readonly createCatalogRepository?: typeof createServerCatalogRepository;
  readonly createCustomizationRepository?: typeof createServerCustomizationFieldRepository;
  readonly resolveUploadAuthority?: typeof resolveLocalCustomerUploadReceiptAuthority;
  readonly createEvaluator?: (dependencies: LocalCheckoutEvaluatorDependencies) => LocalCheckoutEvaluator;
}

const safeHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function response(value: LocalCheckoutPublicProjection, status: number): Response {
  return Response.json(value, { status, headers: safeHeaders });
}

function failure(
  status: "blocked" | "unavailable",
  code: LocalCheckoutIssue["code"],
  message: string,
  httpStatus: number,
): Response {
  return response({ status, issues: [{ code, message }] }, httpStatus);
}

function validationFailure(issues: readonly LocalCheckoutIssue[]): Response {
  return response({ status: "blocked", issues: issues.map((entry) => ({ code: entry.code, message: entry.message })) }, 400);
}

function safeJsonBody(value: unknown): unknown {
  return value;
}

export function createLocalCheckoutHttpHandler(
  overrides: LocalCheckoutHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalCheckoutConfig;
  const getCartProvider = overrides.getCartProvider ?? getShoppingCartProvider;
  const createCatalogRepository = overrides.createCatalogRepository ?? createServerCatalogRepository;
  const createCustomizationRepository = overrides.createCustomizationRepository ?? createServerCustomizationFieldRepository;
  const resolveUploadAuthority = overrides.resolveUploadAuthority ?? resolveLocalCustomerUploadReceiptAuthority;
  const createEvaluator = overrides.createEvaluator ?? ((dependencies) => new LocalCheckoutEvaluator(dependencies));

  return async function handleLocalCheckout(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return response({ status: "blocked", issues: [{ code: "INVALID_CHECKOUT_INPUT", message: "Method not allowed." }] }, 405);
    }
    if (!isSameOriginCartMutation(request)) {
      return failure("blocked", "CHECKOUT_UNAVAILABLE", "Checkout request was not allowed.", 403);
    }

    let body: unknown;
    try {
      body = safeJsonBody(await request.json());
    } catch {
      return failure("blocked", "INVALID_CHECKOUT_INPUT", "Checkout input is invalid.", 400);
    }
    if (process.env.LOCAL_CHECKOUT_SOURCE?.trim() === "local_persistent") return persistentCheckoutHttp(request, body);
    const parsed = parseLocalCheckoutRequest(body);
    if (!parsed.ok) return validationFailure(parsed.issues);

    let configuration;
    try {
      configuration = readConfig();
    } catch {
      return failure("unavailable", "CHECKOUT_UNAVAILABLE", "Local Checkout is unavailable in this runtime.", 503);
    }
    if (configuration.source !== "local_fake") {
      return failure("unavailable", "CHECKOUT_UNAVAILABLE", "Local Checkout is not enabled in this runtime.", 503);
    }

    const commerceContext = await readLocalCustomerCommerceContext(request, parsed.value.address.email);

    const cartId = readShoppingCartId(request);
    const provider = getCartProvider();
    if (!provider) return failure("unavailable", "CART_UNAVAILABLE", "Your Cart is temporarily unavailable.", 503);

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
      return failure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }
    if (catalogSource.status !== "found") {
      return failure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }

    let customizationSource;
    try {
      customizationSource = createCustomizationRepository();
    } catch {
      return failure("unavailable", "CUSTOMIZATION_UNAVAILABLE", "Customization cannot be verified.", 503);
    }
    if (customizationSource.source !== catalogSource.value.source) {
      return failure("unavailable", "CATALOG_UNAVAILABLE", "The current catalog cannot be verified.", 503);
    }

    const evaluator = createEvaluator({
      cartReader: provider,
      catalogRepository: catalogSource.value.repository,
      customizationFieldRepository: customizationSource.repository,
      shippingResolver: resolveLocalShippingFixture,
      couponResolver: resolveLocalCouponFixture,
      promotionResolver: evaluateLocalPromotion,
      firstOrderEligible: commerceContext.firstOrderEligible,
      pointsBalance: commerceContext.pointsBalance,
      ...(uploadAuthority
        ? {
            receiptRepository: uploadAuthority.receiptRepository,
            verifiedOwnerId: uploadAuthority.ownerId,
          }
        : {}),
    });

    try {
      const result = await evaluator.evaluate(cartId, parsed.value, new Date().toISOString());
      const projection = projectLocalCheckoutResult(result);
      return response(
        projection,
        result.status === "accepted" ? 200 : result.status === "blocked" ? 409 : 503,
      );
    } catch {
      return failure("unavailable", "CHECKOUT_UNAVAILABLE", "Checkout cannot be evaluated right now.", 503);
    }
  };
}
