export type ComposerSubmissionIntent =
  | 'submit'
  | 'retry'
  | 'split_submit'
  | 'cancel'
  | 'split_cancel'
  | 'escape_cancel';

const CANCELLATION_INTENTS = new Set<ComposerSubmissionIntent>([
  'cancel',
  'split_cancel',
  'escape_cancel',
]);

export function isComposerActionAllowed(
  customizationPersistencePending: boolean,
  intent: ComposerSubmissionIntent,
): boolean {
  return !customizationPersistencePending || CANCELLATION_INTENTS.has(intent);
}
