import { describe, expect, it } from 'vitest';

import {
  isComposerActionAllowed,
  type ComposerSubmissionIntent,
} from './composerSubmissionGuard';

describe('composerSubmissionGuard', () => {
  it.each([
    'submit',
    'retry',
    'split_submit',
  ] satisfies ComposerSubmissionIntent[])(
    'pending 时阻止 %s',
    intent => {
      expect(isComposerActionAllowed(true, intent)).toBe(false);
    },
  );

  it.each([
    'cancel',
    'split_cancel',
    'escape_cancel',
  ] satisfies ComposerSubmissionIntent[])(
    'pending 时仍允许 %s',
    intent => {
      expect(isComposerActionAllowed(true, intent)).toBe(true);
    },
  );

  it.each([
    'submit',
    'retry',
    'split_submit',
    'cancel',
    'split_cancel',
    'escape_cancel',
  ] satisfies ComposerSubmissionIntent[])(
    '非 pending 时允许 %s',
    intent => {
      expect(isComposerActionAllowed(false, intent)).toBe(true);
    },
  );
});
