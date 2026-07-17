import { describe, expect, it } from 'vitest';
import {
  resolveWorkspacePresentation,
  workspacePresentationClassName,
} from './workspacePresentation';

describe('workspace presentation preference', () => {
  it('keeps the verified classic view as the safe default', () => {
    expect(resolveWorkspacePresentation()).toBe('classic');
    expect(resolveWorkspacePresentation({ search: '?void-ui=unknown', stored: 'unknown' })).toBe('classic');
  });

  it('restores a valid saved presentation', () => {
    expect(resolveWorkspacePresentation({ stored: 'minimal' })).toBe('minimal');
    expect(resolveWorkspacePresentation({ stored: 'classic' })).toBe('classic');
  });

  it('supports a build-time visual verification override', () => {
    expect(resolveWorkspacePresentation({
      configured: 'minimal',
      stored: 'classic',
    })).toBe('minimal');
    expect(resolveWorkspacePresentation({
      configured: 'invalid',
      stored: 'minimal',
    })).toBe('minimal');
  });

  it('lets an explicit query override provide a no-code rollback', () => {
    expect(resolveWorkspacePresentation({
      configured: 'minimal',
      search: '?void-ui=classic',
      stored: 'minimal',
    })).toBe('classic');
    expect(resolveWorkspacePresentation({
      search: '?void-ui=minimal',
      stored: 'classic',
    })).toBe('minimal');
  });

  it('maps presentation state to a scoped root class', () => {
    expect(workspacePresentationClassName('minimal')).toBe('void-ui--minimal');
    expect(workspacePresentationClassName('classic')).toBe('void-ui--classic');
  });
});
