import type { ContextItem } from '@/shared/types/context';

export type PendingLargePasteMap = Record<string, string>;

export interface SessionComposerDraft {
  value: string;
  contexts: ContextItem[];
  pendingLargePastes: PendingLargePasteMap;
  updatedAt: number;
  revision: number;
}

export interface SessionComposerHydration {
  value: string;
  contexts: ContextItem[];
  pendingLargePastes: PendingLargePasteMap;
}

export interface SessionComposerQueueObservation {
  sessionId: string | null;
  value: string | null;
}

export interface SessionComposerQueueDecision {
  observation: SessionComposerQueueObservation;
  shouldHydrate: boolean;
}

export interface SessionComposerSendReceipt {
  requestedSessionId: string | null;
  sentSessionId: string;
  submittedContextIds: readonly string[];
}

export interface SessionComposerDraftGuard {
  sessionId: string;
  expectedRevision: number;
}

const drafts = new Map<string, SessionComposerDraft>();
const draftRevisions = new Map<string, number>();
let nextDraftRevision = 0;

export function resolveSessionComposerScopeId(
  sessionId: string | null,
  newSessionDraftId: string | null,
): string | null {
  if (sessionId) {
    return sessionId;
  }
  return newSessionDraftId ? `draft:${newSessionDraftId}` : null;
}

export function canUseSessionlessComposer(
  hasDerivedSessionState: boolean,
  isNewSessionDraft: boolean,
): boolean {
  return hasDerivedSessionState || isNewSessionDraft;
}

function cloneDraft(draft: SessionComposerDraft): SessionComposerDraft {
  return {
    ...draft,
    contexts: [...draft.contexts],
    pendingLargePastes: { ...draft.pendingLargePastes },
  };
}

export function saveSessionComposerDraft(
  sessionId: string,
  draft: Omit<SessionComposerDraft, 'updatedAt' | 'revision'>,
): void {
  if (!sessionId) {
    return;
  }

  const revision = ++nextDraftRevision;
  drafts.set(sessionId, {
    value: draft.value,
    contexts: [...draft.contexts],
    pendingLargePastes: { ...draft.pendingLargePastes },
    updatedAt: Date.now(),
    revision,
  });
  draftRevisions.set(sessionId, revision);
}

export function getSessionComposerDraft(sessionId: string): SessionComposerDraft | undefined {
  const draft = drafts.get(sessionId);
  return draft ? cloneDraft(draft) : undefined;
}

export function getSessionComposerDraftRevision(sessionId: string | null): number {
  return sessionId ? draftRevisions.get(sessionId) ?? 0 : 0;
}

export function resolveSessionComposerDraftGuard(
  requestedSessionId: string | null,
  createdSessionId: string | null,
  expectedRevision: number,
): SessionComposerDraftGuard | null {
  const sessionId = requestedSessionId ?? createdSessionId;
  return sessionId ? { sessionId, expectedRevision } : null;
}

export function clearSessionComposerDraftIfRevision(
  guard: SessionComposerDraftGuard,
): boolean {
  if (getSessionComposerDraftRevision(guard.sessionId) !== guard.expectedRevision) {
    return false;
  }

  drafts.delete(guard.sessionId);
  draftRevisions.set(guard.sessionId, ++nextDraftRevision);
  return true;
}

export function saveSessionComposerDraftIfRevision(
  guard: SessionComposerDraftGuard,
  draft: Omit<SessionComposerDraft, 'updatedAt' | 'revision'>,
): boolean {
  if (getSessionComposerDraftRevision(guard.sessionId) !== guard.expectedRevision) {
    return false;
  }

  saveSessionComposerDraft(guard.sessionId, draft);
  return true;
}

export function shouldApplyGuardedComposerResult(
  guard: SessionComposerDraftGuard | null,
  mutationApplied: boolean,
): boolean {
  return guard === null || mutationApplied;
}

export function resolveSessionComposerHydration(
  queuedInput: string | null | undefined,
  draft: SessionComposerDraft | undefined,
): SessionComposerHydration {
  const queuedValue = queuedInput?.trim() ? queuedInput : undefined;
  const value = queuedValue ?? draft?.value ?? '';
  const canReusePendingLargePastes = Boolean(
    draft && value === draft.value,
  );

  return {
    value,
    contexts: draft ? [...draft.contexts] : [],
    pendingLargePastes: canReusePendingLargePastes
      ? { ...draft!.pendingLargePastes }
      : {},
  };
}

export function observeSessionComposerQueue(
  previous: SessionComposerQueueObservation,
  sessionId: string | null,
  queuedInput: string | null | undefined,
): SessionComposerQueueDecision {
  const value = queuedInput?.trim() ? queuedInput : null;
  const sessionChanged = previous.sessionId !== sessionId;
  const hasNewQueuedInput = Boolean(
    sessionId
    && value
    && (
      previous.sessionId !== sessionId
      || previous.value !== value
    ),
  );

  return {
    observation: { sessionId, value },
    shouldHydrate: sessionChanged || hasNewQueuedInput,
  };
}

export function isSessionComposerSnapshotCurrent(
  currentSessionId: string | null,
  snapshotSessionId: string | null | undefined,
): boolean {
  return currentSessionId === (snapshotSessionId ?? null);
}

export function shouldApplySessionComposerHydration(
  sessionChanged: boolean,
  queueDecision: SessionComposerQueueDecision,
  currentValue: string,
): boolean {
  if (sessionChanged) {
    return true;
  }

  const queuedValue = queueDecision.observation.value;
  return Boolean(
    queueDecision.shouldHydrate
    && queuedValue
    && currentValue.trim() === ''
    && currentValue !== queuedValue,
  );
}

export function countEmptyPasteClearGuards(
  hasPendingLargePastes: boolean,
  oldRenderedValue: string,
  hydratedValue: string,
): number {
  if (!hasPendingLargePastes) {
    return 0;
  }

  return Number(oldRenderedValue === '') + Number(hydratedValue === '');
}

export function consumeEmptyPasteClearGuard(guardCount: number): {
  shouldSkipClear: boolean;
  remainingGuardCount: number;
} {
  const normalizedCount = Math.max(0, Math.floor(guardCount));
  return {
    shouldSkipClear: normalizedCount > 0,
    remainingGuardCount: Math.max(0, normalizedCount - 1),
  };
}

export function shouldClaimSuccessfulSendReceipt(
  activeComposerSessionId: string | null,
  requestedSessionId: string | null,
  sentSessionId: string,
): boolean {
  if (requestedSessionId === null) {
    return activeComposerSessionId === null
      || activeComposerSessionId === sentSessionId;
  }

  return activeComposerSessionId === requestedSessionId
    || activeComposerSessionId === sentSessionId;
}

export function shouldDeactivateComposerAfterSend(
  activeComposerSessionId: string | null,
  receipt: SessionComposerSendReceipt,
  currentValue: string,
  currentContextIds: readonly string[],
  currentPendingLargePastes: PendingLargePasteMap,
): boolean {
  if (!shouldClaimSuccessfulSendReceipt(
    activeComposerSessionId,
    receipt.requestedSessionId,
    receipt.sentSessionId,
  )) {
    return false;
  }

  const submittedContextIds = new Set(receipt.submittedContextIds);
  const hasNewContext = currentContextIds.some(id => !submittedContextIds.has(id));

  return currentValue === ''
    && !hasNewContext
    && Object.keys(currentPendingLargePastes).length === 0;
}

export function shouldRestoreFailedComposer(
  activeComposerSessionId: string | null,
  requestedSessionId: string | null,
  createdSessionId: string | null,
): boolean {
  if (requestedSessionId !== null) {
    return activeComposerSessionId === requestedSessionId;
  }

  if (createdSessionId !== null) {
    return activeComposerSessionId === null
      || activeComposerSessionId === createdSessionId;
  }

  return activeComposerSessionId === null;
}

export function shouldRestoreFailedComposerContent(
  currentValue: string,
  currentPendingLargePastes: PendingLargePasteMap,
): boolean {
  return currentValue === ''
    && Object.keys(currentPendingLargePastes).length === 0;
}

export function clearSessionComposerDrafts(sessionIds: Iterable<string>): void {
  for (const sessionId of sessionIds) {
    drafts.delete(sessionId);
    draftRevisions.set(sessionId, ++nextDraftRevision);
  }
}

export function resetSessionComposerDraftsForTests(): void {
  drafts.clear();
  draftRevisions.clear();
  nextDraftRevision = 0;
}
