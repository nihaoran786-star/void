import { describe, expect, it } from 'vitest';
import { computeAgentDraftFingerprint, type AgentDebugDraft } from './AgentDebugDraft';

const base: AgentDebugDraft = {
  displayName: '测试智能体',
  description: 'desc',
  prompt: 'You are a helper.',
  tools: ['Read', 'Grep'],
  readonly: true,
  review: false,
};

describe('computeAgentDraftFingerprint', () => {
  it('is stable for identical drafts', () => {
    expect(computeAgentDraftFingerprint(base)).toBe(computeAgentDraftFingerprint(base));
  });
  it('changes when the prompt changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, prompt: 'You are a writer.' }),
    );
  });
  it('changes when tools, readonly, or displayName changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, tools: ['Read'] }),
    );
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, readonly: false }),
    );
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, displayName: '其他' }),
    );
  });
  it('changes when the description changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, description: 'different' }),
    );
  });
  it('changes when review changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, review: true }),
    );
  });
  it('treats tool dedupe and reordering as equivalent', () => {
    expect(computeAgentDraftFingerprint({ ...base, tools: ['Read', 'Read', 'Grep'] })).toBe(
      computeAgentDraftFingerprint({ ...base, tools: ['Grep', 'Read'] }),
    );
  });
  it('ignores blank tools', () => {
    expect(computeAgentDraftFingerprint({ ...base, tools: ['Read', ''] })).toBe(
      computeAgentDraftFingerprint({ ...base, tools: ['Read'] }),
    );
  });
  it('ignores trailing whitespace differences', () => {
    expect(computeAgentDraftFingerprint(base)).toBe(
      computeAgentDraftFingerprint({ ...base, prompt: 'You are a helper.  ' }),
    );
  });
});
