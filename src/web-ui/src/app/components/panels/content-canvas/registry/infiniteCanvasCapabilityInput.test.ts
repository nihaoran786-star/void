import { describe, expect, it } from 'vitest';

import { infiniteCanvasDomainRefKey } from '@/shared/services/infinite-canvas';
import { validateInfiniteCanvasSurfaceInput } from './infiniteCanvasCapabilityInput';

const DOMAIN_REF = {
  moduleId: 'short-drama',
  kind: 'character',
  id: 'artifact-1',
  role: 'refine',
} as const;

describe('validateInfiniteCanvasSurfaceInput', () => {
  it('keeps the pre-K3 behaviour: nothing to carry is still valid', () => {
    for (const input of [undefined, null, {}]) {
      expect(validateInfiniteCanvasSurfaceInput(input))
        .toEqual({ status: 'valid', value: {} });
    }
  });

  it('accepts a short-drama handoff and trims every field', () => {
    expect(validateInfiniteCanvasSurfaceInput({
      domainRef: {
        moduleId: ' short-drama ',
        kind: ' storyboard ',
        id: ' artifact-9 ',
        role: ' refine ',
      },
      requestId: ' req-9 ',
    })).toEqual({
      status: 'valid',
      value: {
        domainRef: {
          moduleId: 'short-drama',
          kind: 'storyboard',
          id: 'artifact-9',
          role: 'refine',
        },
        requestId: 'req-9',
      },
    });
  });

  it.each([
    ['a non-object payload', 'doc'],
    ['an array payload', [1, 2]],
    ['a surplus key', { domainRef: DOMAIN_REF, requestId: 'r', extra: 1 }],
    ['a surplus domainRef key', {
      domainRef: { ...DOMAIN_REF, projectId: 'p' },
      requestId: 'r',
    }],
    ['a handoff without its request id', { domainRef: DOMAIN_REF }],
    ['a request id without a reference', { requestId: 'r' }],
    ['a foreign module', {
      domainRef: { ...DOMAIN_REF, moduleId: 'workspace-media' },
      requestId: 'r',
    }],
    ['an asset kind that cannot be refined', {
      domainRef: { ...DOMAIN_REF, kind: 'video' },
      requestId: 'r',
    }],
    ['a blank asset id', { domainRef: { ...DOMAIN_REF, id: '  ' }, requestId: 'r' }],
    ['a role K3 does not define', {
      domainRef: { ...DOMAIN_REF, role: 'reference' },
      requestId: 'r',
    }],
    ['a non-object domainRef', { domainRef: 'artifact-1', requestId: 'r' }],
    ['a blank request id', { domainRef: DOMAIN_REF, requestId: '   ' }],
  ])('rejects %s with a reason', (_label, input) => {
    const result = validateInfiniteCanvasSurfaceInput(input);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('infiniteCanvasDomainRefKey', () => {
  it('ignores the role, so one asset has exactly one refinement slot', () => {
    expect(infiniteCanvasDomainRefKey(DOMAIN_REF))
      .toBe(infiniteCanvasDomainRefKey({ ...DOMAIN_REF, role: 'reference' }));
    expect(infiniteCanvasDomainRefKey(DOMAIN_REF))
      .not.toBe(infiniteCanvasDomainRefKey({ ...DOMAIN_REF, id: 'artifact-2' }));
  });
});
