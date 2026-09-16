import type { ProductReviewRepository } from "../application/product-review.ts";
import { LocalMemoryProductReviewRepository } from "../infrastructure/reviews/local-memory-product-review-repository.server.ts";

let sharedRepository: ProductReviewRepository | null = null;
export function getSharedProductReviewRepository(): ProductReviewRepository { sharedRepository ??= new LocalMemoryProductReviewRepository(); return sharedRepository; }
export function resetSharedProductReviewRuntimeForTests(): void { sharedRepository = null; }
