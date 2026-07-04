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
});
