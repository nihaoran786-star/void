import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkLoadRecovery';

describe('chunkLoadRecovery', () => {
  it.each([
    new TypeError('Failed to fetch dynamically imported module'),
    new Error('Importing a module script failed'),
    new Error('Unable to preload CSS for /assets/tool-card.css'),
    Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' }),
  ])('classifies recoverable module and CSS chunk failures', error => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('does not turn ordinary tool-card render errors into page reloads', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });
});
