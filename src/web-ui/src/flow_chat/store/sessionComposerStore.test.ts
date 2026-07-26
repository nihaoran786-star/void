import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextItem } from '@/shared/types/context';
import {
  clearSessionComposerDraftIfRevision,
  clearSessionComposerDrafts,
  canUseSessionlessComposer,
  consumeEmptyPasteClearGuard,
  countEmptyPasteClearGuards,
  getSessionComposerDraft,
  getSessionComposerDraftRevision,
  isSessionComposerSnapshotCurrent,
  observeSessionComposerQueue,
  resolveSessionComposerHydration,
  resolveSessionComposerScopeId,
  resetSessionComposerDraftsForTests,
  resolveSessionComposerDraftGuard,
  saveSessionComposerDraftIfRevision,
  saveSessionComposerDraft,
  shouldApplySessionComposerHydration,
  shouldApplyGuardedComposerResult,
  shouldClaimSuccessfulSendReceipt,
  shouldDeactivateComposerAfterSend,
  shouldRestoreFailedComposer,
  shouldRestoreFailedComposerContent,
} from './sessionComposerStore';

const fileContext: ContextItem = {
  id: 'file-1',
  type: 'file',
  timestamp: 1,
  filePath: '/workspace/a.ts',
  fileName: 'a.ts',
};

const imageContext: ContextItem = {
  id: 'image-1',
  type: 'image',
  timestamp: 2,
  imagePath: '/workspace/image.png',
  imageName: 'image.png',
  fileSize: 10,
  mimeType: 'image/png',
  source: 'file',
  isLocal: true,
  dataUrl: 'data:image/png;base64,abc',
};

describe('sessionComposerStore', () => {
  beforeEach(() => {
    resetSessionComposerDraftsForTests();
    vi.restoreAllMocks();
  });

  it('keeps independent in-memory drafts for parent, BTW, and subagent sessions', () => {
    saveSessionComposerDraft('parent', {
      value: 'parent draft',
      contexts: [fileContext],
      pendingLargePastes: { '[paste]': 'parent paste' },
    });
    saveSessionComposerDraft('btw-child', {
      value: 'btw draft',
      contexts: [],
      pendingLargePastes: {},
    });
    saveSessionComposerDraft('subagent-child', {
      value: 'subagent draft',
      contexts: [],
      pendingLargePastes: {},
    });

    expect(getSessionComposerDraft('parent')?.value).toBe('parent draft');
    expect(getSessionComposerDraft('btw-child')?.value).toBe('btw draft');
    expect(getSessionComposerDraft('subagent-child')?.value).toBe('subagent draft');
  });

  it('treats each unpersisted new-task draft as its own composer scope', () => {
    expect(resolveSessionComposerScopeId(null, 'draft-1')).toBe('draft:draft-1');
    expect(resolveSessionComposerScopeId(null, 'draft-2')).toBe('draft:draft-2');
    expect(resolveSessionComposerScopeId('session-1', 'draft-2')).toBe('session-1');
    expect(resolveSessionComposerScopeId(null, null)).toBeNull();
  });

  it('restores an existing session draft after visiting an isolated new-task scope', () => {
    saveSessionComposerDraft('session-1', {
      value: 'session-only text',
      contexts: [fileContext],
      pendingLargePastes: {},
    });

    const newTaskScope = resolveSessionComposerScopeId(null, 'draft-1');
    expect(newTaskScope && getSessionComposerDraft(newTaskScope)).toBeUndefined();

    const restoredSessionScope = resolveSessionComposerScopeId('session-1', null);
    expect(restoredSessionScope && getSessionComposerDraft(restoredSessionScope)).toMatchObject({
      value: 'session-only text',
      contexts: [fileContext],
    });
  });

  it('allows a new-task composer to send without a session state machine', () => {
    expect(canUseSessionlessComposer(false, true)).toBe(true);
    expect(canUseSessionlessComposer(false, false)).toBe(false);
    expect(canUseSessionlessComposer(true, false)).toBe(true);
  });

  it('retains all contexts, including unsent images, and returns defensive copies', () => {
    const pendingLargePastes = { '[paste]': 'expanded' };
    saveSessionComposerDraft('session-1', {
      value: 'draft',
      contexts: [fileContext, imageContext],
      pendingLargePastes,
    });

    pendingLargePastes['[paste]'] = 'mutated';
    const first = getSessionComposerDraft('session-1');
    expect(first?.contexts).toEqual([fileContext, imageContext]);
    expect(first?.pendingLargePastes).toEqual({ '[paste]': 'expanded' });

    first?.contexts.splice(0);
    if (first) {
      first.pendingLargePastes['[paste]'] = 'changed';
    }

    expect(getSessionComposerDraft('session-1')).toMatchObject({
      contexts: [fileContext, imageContext],
      pendingLargePastes: { '[paste]': 'expanded' },
    });
  });

  it('timestamps saves and clears every id from a cascade', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    for (const sessionId of ['parent', 'btw-child', 'subagent-child']) {
      saveSessionComposerDraft(sessionId, {
        value: sessionId,
        contexts: [],
        pendingLargePastes: {},
      });
    }

    expect(getSessionComposerDraft('parent')?.updatedAt).toBe(1234);

    clearSessionComposerDrafts(['parent', 'btw-child', 'subagent-child']);

    expect(getSessionComposerDraft('parent')).toBeUndefined();
    expect(getSessionComposerDraft('btw-child')).toBeUndefined();
    expect(getSessionComposerDraft('subagent-child')).toBeUndefined();
  });

  it('assigns a strictly increasing revision to every saved draft', () => {
    saveSessionComposerDraft('session-1', {
      value: 'first',
      contexts: [],
      pendingLargePastes: {},
    });
    const firstRevision = getSessionComposerDraftRevision('session-1');

    saveSessionComposerDraft('session-1', {
      value: 'second',
      contexts: [],
      pendingLargePastes: {},
    });
    const secondRevision = getSessionComposerDraftRevision('session-1');

    expect(firstRevision).toBeGreaterThan(0);
    expect(secondRevision).toBeGreaterThan(firstRevision);

    expect(clearSessionComposerDraftIfRevision({
      sessionId: 'session-1',
      expectedRevision: secondRevision,
    })).toBe(true);
    expect(getSessionComposerDraft('session-1')).toBeUndefined();
    expect(getSessionComposerDraftRevision('session-1')).toBeGreaterThan(
      secondRevision,
    );
  });

  it('ignores empty session ids instead of creating a shared new-session draft', () => {
    saveSessionComposerDraft('', {
      value: 'new session draft',
      contexts: [fileContext],
      pendingLargePastes: {},
    });

    expect(getSessionComposerDraft('')).toBeUndefined();
  });

  it('hydrates queued input before a saved draft and drops mismatched paste mappings', () => {
    saveSessionComposerDraft('session-1', {
      value: '[paste]',
      contexts: [fileContext],
      pendingLargePastes: { '[paste]': 'expanded' },
    });

    expect(resolveSessionComposerHydration(
      'retry this instead',
      getSessionComposerDraft('session-1'),
    )).toEqual({
      value: 'retry this instead',
      contexts: [fileContext],
      pendingLargePastes: {},
    });
  });

  it('keeps paste mappings when queued input and the saved draft match', () => {
    saveSessionComposerDraft('session-1', {
      value: '[paste]',
      contexts: [fileContext],
      pendingLargePastes: { '[paste]': 'expanded' },
    });

    expect(resolveSessionComposerHydration(
      '[paste]',
      getSessionComposerDraft('session-1'),
    )).toEqual({
      value: '[paste]',
      contexts: [fileContext],
      pendingLargePastes: { '[paste]': 'expanded' },
    });
  });

  it('falls back from the saved draft to an empty composer', () => {
    expect(resolveSessionComposerHydration(null, undefined)).toEqual({
      value: '',
      contexts: [],
      pendingLargePastes: {},
    });
  });

  it('observes null queue values so the same value can be restored after x-null-x', () => {
    const initial = { sessionId: 'session-1', value: null };
    const firstX = observeSessionComposerQueue(initial, 'session-1', 'retry');
    const cleared = observeSessionComposerQueue(
      firstX.observation,
      'session-1',
      null,
    );
    const secondX = observeSessionComposerQueue(
      cleared.observation,
      'session-1',
      'retry',
    );

    expect(firstX.shouldHydrate).toBe(true);
    expect(cleared).toEqual({
      observation: { sessionId: 'session-1', value: null },
      shouldHydrate: false,
    });
    expect(secondX.shouldHydrate).toBe(true);
  });

  it('rejects a stale state-machine snapshot before observing its queued input', () => {
    expect(isSessionComposerSnapshotCurrent('session-b', 'session-a')).toBe(false);
    expect(isSessionComposerSnapshotCurrent('session-b', 'session-b')).toBe(true);
    expect(isSessionComposerSnapshotCurrent(null, undefined)).toBe(true);
  });

  it('applies same-session queue hydration only to an empty, different composer value', () => {
    const queueDecision = observeSessionComposerQueue(
      { sessionId: 'session-1', value: null },
      'session-1',
      'retry',
    );

    expect(shouldApplySessionComposerHydration(
      false,
      queueDecision,
      'user is typing',
    )).toBe(false);
    expect(shouldApplySessionComposerHydration(
      false,
      queueDecision,
      'retry',
    )).toBe(false);
    expect(shouldApplySessionComposerHydration(
      false,
      queueDecision,
      '',
    )).toBe(true);
  });

  it('always applies full hydration after a session change', () => {
    const noQueuedInput = observeSessionComposerQueue(
      { sessionId: 'session-1', value: null },
      'session-2',
      null,
    );

    expect(shouldApplySessionComposerHydration(
      true,
      noQueuedInput,
      'current composer',
    )).toBe(true);
  });

  it('counts and consumes both empty renders when hydration retains paste mappings', () => {
    const guardCount = countEmptyPasteClearGuards(true, '', '');
    const first = consumeEmptyPasteClearGuard(guardCount);
    const second = consumeEmptyPasteClearGuard(first.remainingGuardCount);
    const exhausted = consumeEmptyPasteClearGuard(second.remainingGuardCount);

    expect(guardCount).toBe(2);
    expect(first).toEqual({
      shouldSkipClear: true,
      remainingGuardCount: 1,
    });
    expect(second).toEqual({
      shouldSkipClear: true,
      remainingGuardCount: 0,
    });
    expect(exhausted).toEqual({
      shouldSkipClear: false,
      remainingGuardCount: 0,
    });
  });

  it('does not guard empty renders without pending paste mappings', () => {
    expect(countEmptyPasteClearGuards(false, '', '')).toBe(0);
    expect(countEmptyPasteClearGuards(true, 'old', 'hydrated')).toBe(0);
  });

  it('claims an existing-session receipt only while that composer stays active', () => {
    expect(shouldClaimSuccessfulSendReceipt(
      'session-1',
      'session-1',
      'session-1',
    )).toBe(true);
    expect(shouldClaimSuccessfulSendReceipt(
      'session-2',
      'session-1',
      'session-1',
    )).toBe(false);
  });

  it('claims a new-session receipt before or after the created session becomes active', () => {
    expect(shouldClaimSuccessfulSendReceipt(
      null,
      null,
      'session-created',
    )).toBe(true);
    expect(shouldClaimSuccessfulSendReceipt(
      'session-created',
      null,
      'session-created',
    )).toBe(true);
    expect(shouldClaimSuccessfulSendReceipt(
      'session-b',
      null,
      'session-created',
    )).toBe(false);
  });

  it('deactivates only when an owned receipt has no newer composer content', () => {
    const receipt = {
      requestedSessionId: 'session-1',
      sentSessionId: 'session-1',
      submittedContextIds: ['file-1', 'image-1'],
    } as const;

    expect(shouldDeactivateComposerAfterSend(
      'session-1',
      receipt,
      '',
      ['file-1', 'image-1'],
      {},
    )).toBe(true);
    expect(shouldDeactivateComposerAfterSend(
      'session-1',
      receipt,
      'new input',
      ['file-1', 'image-1'],
      {},
    )).toBe(false);
    expect(shouldDeactivateComposerAfterSend(
      'session-1',
      receipt,
      '',
      ['file-1', 'new-file'],
      {},
    )).toBe(false);
    expect(shouldDeactivateComposerAfterSend(
      'session-1',
      receipt,
      '',
      ['file-1', 'image-1'],
      { '[paste]': 'new paste' },
    )).toBe(false);
    expect(shouldDeactivateComposerAfterSend(
      'session-b',
      receipt,
      '',
      ['file-1', 'image-1'],
      {},
    )).toBe(false);
  });

  it('restores a failed existing-session send only to its original composer', () => {
    expect(shouldRestoreFailedComposer(
      'session-1',
      'session-1',
      null,
    )).toBe(true);
    expect(shouldRestoreFailedComposer(
      'session-b',
      'session-1',
      null,
    )).toBe(false);
  });

  it('restores a failed deferred send to null or its created session, but never B', () => {
    expect(shouldRestoreFailedComposer(null, null, null)).toBe(true);
    expect(shouldRestoreFailedComposer(
      null,
      null,
      'session-created',
    )).toBe(true);
    expect(shouldRestoreFailedComposer(
      'session-created',
      null,
      'session-created',
    )).toBe(true);
    expect(shouldRestoreFailedComposer(
      'session-b',
      null,
      'session-created',
    )).toBe(false);
  });

  it('restores failed text only when no newer input or paste exists', () => {
    expect(shouldRestoreFailedComposerContent('', {})).toBe(true);
    expect(shouldRestoreFailedComposerContent('new input', {})).toBe(false);
    expect(shouldRestoreFailedComposerContent('', {
      '[paste]': 'new paste',
    })).toBe(false);
  });

  it('keeps a newer A draft when an older successful send finishes after A to B', () => {
    const sentRevision = getSessionComposerDraftRevision('session-a');
    expect(sentRevision).toBe(0);

    saveSessionComposerDraft('session-a', {
      value: 'new A',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });
    const guard = resolveSessionComposerDraftGuard(
      'session-a',
      null,
      sentRevision,
    );

    expect(guard && clearSessionComposerDraftIfRevision(guard)).toBe(false);
    expect(getSessionComposerDraft('session-a')).toMatchObject({
      value: 'new A',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });
  });

  it('keeps a newer A draft when an older failed send finishes after A to B', () => {
    const sentRevision = getSessionComposerDraftRevision('session-a');
    expect(sentRevision).toBe(0);

    saveSessionComposerDraft('session-a', {
      value: 'new A',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });
    const guard = resolveSessionComposerDraftGuard(
      'session-a',
      null,
      sentRevision,
    );

    expect(guard && saveSessionComposerDraftIfRevision(guard, {
      value: 'old A restored',
      contexts: [fileContext],
      pendingLargePastes: { '[old]': 'old paste' },
    })).toBe(false);
    expect(getSessionComposerDraft('session-a')).toMatchObject({
      value: 'new A',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });
  });

  it('uses revision zero with the created id for a deferred new-session send', () => {
    const guard = resolveSessionComposerDraftGuard(
      null,
      'session-created',
      0,
    );
    expect(guard).toEqual({
      sessionId: 'session-created',
      expectedRevision: 0,
    });

    saveSessionComposerDraft('session-created', {
      value: 'new created-session draft',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });

    expect(guard && clearSessionComposerDraftIfRevision(guard)).toBe(false);
    expect(guard && saveSessionComposerDraftIfRevision(guard, {
      value: 'stale failed input',
      contexts: [fileContext],
      pendingLargePastes: {},
    })).toBe(false);
    expect(getSessionComposerDraft('session-created')).toMatchObject({
      value: 'new created-session draft',
      contexts: [imageContext],
      pendingLargePastes: { '[new]': 'new paste' },
    });
  });

  it('blocks stale async UI cleanup when a guarded draft mutation is rejected', () => {
    const guard = {
      sessionId: 'session-a',
      expectedRevision: 0,
    };

    expect(shouldApplyGuardedComposerResult(guard, false)).toBe(false);
    expect(shouldApplyGuardedComposerResult(guard, true)).toBe(true);
    expect(shouldApplyGuardedComposerResult(null, false)).toBe(true);
  });
});
