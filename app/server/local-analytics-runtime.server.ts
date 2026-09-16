import type { LocalAnalyticsRepository } from "../application/local-analytics.ts";
import { LocalMemoryAnalyticsRepository } from "../infrastructure/analytics/local-memory-analytics-repository.server.ts";

let sharedRepository: LocalAnalyticsRepository | null = null;

export function getSharedLocalAnalyticsRepository(): LocalAnalyticsRepository {
  sharedRepository ??= new LocalMemoryAnalyticsRepository();
  return sharedRepository;
}

export function resetSharedLocalAnalyticsRepositoryForTests(): void {
  sharedRepository = null;
}
