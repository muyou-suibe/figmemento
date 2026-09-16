import type { ProductReview } from "../domain/product-review.ts";

export interface ProductReviewRepository {
  listPublished(productId: string): readonly ProductReview[];
  create(input: Omit<ProductReview, "id" | "status">): { readonly status: "created" | "duplicate"; readonly value?: ProductReview };
}
