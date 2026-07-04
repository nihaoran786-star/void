import { describe, expect, it } from 'vitest';
import { parseIdentityDocument, serializeIdentityDocument } from './identityDocument';

describe('identityDocument frontmatter preservation', () => {
  it('keeps unknown frontmatter fields when known identity fields are edited', () => {
    const parsed = parseIdentityDocument(`---
name: Ada
creature: fox
vibe: precise
emoji: 🧭
modelPrimary: claude-sonnet
reviewPolicy:
  requireTests: true
tags:
  - reviewer
---

Original body
`);

    const serialized = serializeIdentityDocument({
      ...parsed,
      vibe: 'careful',
      body: 'Updated body',
    });

    expect(serialized).toContain('vibe: careful');
    expect(serialized).toContain('reviewPolicy:');
    expect(serialized).toContain('requireTests: true');
    expect(serialized).toContain('- reviewer');
    expect(serialized).toContain('Updated body');
  });

  it('preserves unknown frontmatter comments and relative order', () => {
    const parsed = parseIdentityDocument(`---
name: Ada
# release policy must stay with reviewPolicy
reviewPolicy:
  requireTests: true
tags:
  - reviewer
creature: fox
vibe: precise
emoji: 🧭
customBlock:
  owner: platform
---

Original body
`);

    const serialized = serializeIdentityDocument({
      ...parsed,
      name: 'Ada Lovelace',
    });

    const reviewPolicyIndex = serialized.indexOf('reviewPolicy:');
    const tagsIndex = serialized.indexOf('tags:');
    const customBlockIndex = serialized.indexOf('customBlock:');

    expect(serialized).toContain('# release policy must stay with reviewPolicy');
    expect(reviewPolicyIndex).toBeGreaterThan(-1);
    expect(tagsIndex).toBeGreaterThan(reviewPolicyIndex);
    expect(customBlockIndex).toBeGreaterThan(tagsIndex);
  });
});
