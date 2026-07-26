import type { SubscriptionProvider } from '@/infrastructure/api/service-api/SubscriptionAuthAPI';

export interface SubscriptionLoginOperation {
  id: number;
  provider: SubscriptionProvider;
  sessionId: string;
  cancelled: boolean;
  startSettled: boolean;
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure session identifiers are unavailable');
  }
  return globalThis.crypto.randomUUID();
}

export class SubscriptionLoginCoordinator {
  private nextId = 0;
  private active: SubscriptionLoginOperation | null = null;

  constructor(private readonly createId: () => string = createSessionId) {}

  begin(provider: SubscriptionProvider): SubscriptionLoginOperation | null {
    if (this.active) {
      return null;
    }
    const operation: SubscriptionLoginOperation = {
      id: ++this.nextId,
      provider,
      sessionId: this.createId(),
      cancelled: false,
      startSettled: false,
    };
    this.active = operation;
    return operation;
  }

  current(): SubscriptionLoginOperation | null {
    return this.active;
  }

  owns(operation: SubscriptionLoginOperation): boolean {
    return this.active === operation;
  }

  isCurrent(operation: SubscriptionLoginOperation): boolean {
    return this.active === operation && !operation.cancelled;
  }

  settleStart(operation: SubscriptionLoginOperation): boolean {
    if (!this.owns(operation)) {
      return false;
    }
    operation.startSettled = true;
    return !operation.cancelled;
  }

  requestCancel(): SubscriptionLoginOperation | null {
    if (!this.active) {
      return null;
    }
    this.active.cancelled = true;
    return this.active;
  }

  complete(operation: SubscriptionLoginOperation): boolean {
    if (!this.owns(operation)) {
      return false;
    }
    this.active = null;
    return true;
  }
}
