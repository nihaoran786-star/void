import { describe, expect, it } from 'vitest';
import {
  createSkillPromptReferenceToken,
  expandSkillPromptReferences,
  getSkillPromptReferenceMatches,
  parseSkillPromptReferenceToken,
} from './skillPromptReference';

describe('skillPromptReference', () => {
  it('round trips names without exposing unsafe delimiters', () => {
    const token = createSkillPromptReferenceToken('review docs/中文');
    expect(parseSkillPromptReferenceToken(token)).toBe('review docs/中文');
    expect(getSkillPromptReferenceMatches(`before ${token} after`)[0]).toMatchObject({
      name: 'review docs/中文',
    });
  });

  it('expands a pill token to the existing Skill prompt contract', () => {
    expect(expandSkillPromptReferences(createSkillPromptReferenceToken('audit'))).toBe(
      'Please use the Skill tool with command "audit".',
    );
  });

  it('rejects malformed tokens', () => {
    expect(parseSkillPromptReferenceToken('[[void-skill:%E0%A4%A]]')).toBeNull();
  });
});
