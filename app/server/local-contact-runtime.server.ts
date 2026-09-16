import type { ContactMessageRepository } from "../application/contact-message.ts";
import {
  readTrustedLocalContactConfig,
  type LocalContactConfiguration,
} from "../config/local-contact-runtime.ts";
import { LocalMemoryContactMessageRepository } from "../infrastructure/contact/local-memory-contact-message-repository.server.ts";

export interface LocalContactRuntime {
  readonly configuration: LocalContactConfiguration;
  readonly repository: LocalMemoryContactMessageRepository | ContactMessageRepository;
  readonly createId: () => string;
  readonly now: () => string;
}

export function createLocalContactRuntime(options: {
  readonly configuration?: LocalContactConfiguration;
  readonly repository?: LocalMemoryContactMessageRepository | ContactMessageRepository;
  readonly createId?: () => string;
  readonly now?: () => string;
} = {}): LocalContactRuntime {
  const repository = options.repository ?? new LocalMemoryContactMessageRepository();
  const createId = options.createId ?? (() => repository instanceof LocalMemoryContactMessageRepository
    ? repository.createId()
    : `contact-${globalThis.crypto.randomUUID()}`);
  return {
    configuration: options.configuration ?? readTrustedLocalContactConfig(),
    repository,
    createId,
    now: options.now ?? (() => new Date().toISOString()),
  };
}

let sharedRuntime: LocalContactRuntime | null = null;

export function getSharedLocalContactRuntime(): LocalContactRuntime {
  sharedRuntime ??= createLocalContactRuntime();
  return sharedRuntime;
}

export function resetSharedLocalContactRuntimeForTests(): void {
  sharedRuntime = null;
}
