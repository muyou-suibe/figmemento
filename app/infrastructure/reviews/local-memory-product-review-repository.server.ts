import type { ProductReviewRepository } from "../../application/product-review.ts";
import type { ProductReview } from "../../domain/product-review.ts";

function clone(review: ProductReview): ProductReview { return { ...review }; }

/** Local review records are process-memory and are never fabricated marketing data. */
export class LocalMemoryProductReviewRepository implements ProductReviewRepository {
  private readonly reviews: ProductReview[] = [];

  listPublished(productId: string): readonly ProductReview[] {
    return this.reviews.filter((review) => review.productId === productId && review.status === "published").map(clone);
  }

  create(input: Omit<ProductReview, "id" | "status">): { readonly status: "created" | "duplicate"; readonly value?: ProductReview } {
    if (this.reviews.some((review) => review.customerId === input.customerId && review.orderItemId === input.orderItemId)) return { status: "duplicate" };
    const review: ProductReview = { ...input, id: `review-${globalThis.crypto.randomUUID()}`, status: "published" };
    this.reviews.push(review);
    return { status: "created", value: clone(review) };
  }
}
