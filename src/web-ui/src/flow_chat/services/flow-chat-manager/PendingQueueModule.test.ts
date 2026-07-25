import { afterEach, describe, expect, it } from 'vitest';
import { pendingQueueManager } from './PendingQueueModule';

const SESSION_ID = 'reference-history-queue-test';

describe('PendingQueueModule reference metadata', () => {
  afterEach(() => {
    pendingQueueManager.clear(SESSION_ID);
  });

  it('persists presentation metadata and lets a plain-text edit clear it', () => {
    const userMessageMetadata = {
      composerPresentation: {
        version: 1,
        segments: [{ type: 'skill', name: 'audit' }],
      },
      sessionReferences: [{ sessionId: 'research-1' }],
    };
    const queued = pendingQueueManager.enqueue({
      sessionId: SESSION_ID,
      content: 'expanded prompt',
      displayMessage: '[[void-skill:audit]]',
      userMessageMetadata,
    });

    expect(pendingQueueManager.list(SESSION_ID)[0]?.userMessageMetadata)
      .toEqual(userMessageMetadata);

    pendingQueueManager.update(SESSION_ID, queued.id, {
      content: 'plain replacement',
      displayMessage: 'plain replacement',
      userMessageMetadata: undefined,
    });

    expect(pendingQueueManager.list(SESSION_ID)[0]).toMatchObject({
      content: 'plain replacement',
      displayMessage: 'plain replacement',
      userMessageMetadata: undefined,
    });
  });
});
