import {
  emitCompactChatPresentation,
  subscribeCompactChatPresentationSource,
} from './CompactChatPresentationBridge';

type Unsubscribe = () => void;
type CancelScheduled = () => void;

export interface CompactChatPresentationPublisherDeps {
  subscribe: (handler: () => void) => Unsubscribe;
  publish: (isCurrent: () => boolean) => Promise<void> | void;
  schedule: (callback: () => void) => CancelScheduled;
}

/**
 * Owns presentation-only work for the Compact Chat mirror.
 * FlowChat business state continues independently while this publisher sleeps.
 */
export class CompactChatPresentationPublisher {
  private active = false;
  private destroyed = false;
  private dirty = false;
  private publishing = false;
  private generation = 0;
  private cancelScheduled: CancelScheduled | null = null;
  private unsubscribe: Unsubscribe | null = null;

  constructor(private readonly deps: CompactChatPresentationPublisherDeps) {}

  activate(): void {
    if (this.destroyed) return;

    if (!this.active) {
      this.active = true;
      this.generation += 1;
      this.unsubscribe = this.deps.subscribe(() => this.requestUpdate());
    }

    this.requestUpdate();
  }

  requestUpdate(): void {
    if (!this.active || this.destroyed) return;

    this.dirty = true;
    if (!this.publishing && this.cancelScheduled === null) {
      this.cancelScheduled = this.deps.schedule(() => {
        this.cancelScheduled = null;
        void this.publishLatest(this.generation);
      });
    }
  }

  suspend(): void {
    this.active = false;
    this.generation += 1;
    this.dirty = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.suspend();
    this.destroyed = true;
  }

  private isCurrent(generation: number): boolean {
    return this.active && !this.destroyed && this.generation === generation;
  }

  private async publishLatest(generation: number): Promise<void> {
    if (!this.isCurrent(generation) || this.publishing) return;

    this.dirty = false;
    this.publishing = true;
    try {
      await this.deps.publish(() => this.isCurrent(generation));
    } finally {
      this.publishing = false;
      if (this.active && this.dirty) {
        this.requestUpdate();
      }
    }
  }
}

const compactChatPresentationPublisher = new CompactChatPresentationPublisher({
  subscribe: subscribeCompactChatPresentationSource,
  publish: emitCompactChatPresentation,
  schedule: callback => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) callback();
    });
    return () => {
      cancelled = true;
    };
  },
});

export const activateCompactChatPresentationPublishing = () => {
  compactChatPresentationPublisher.activate();
};

export const requestCompactChatPresentationUpdate = () => {
  compactChatPresentationPublisher.requestUpdate();
};

export const suspendCompactChatPresentationPublishing = () => {
  compactChatPresentationPublisher.suspend();
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    compactChatPresentationPublisher.destroy();
  });
}
