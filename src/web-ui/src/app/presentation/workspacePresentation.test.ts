import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_PRESENTATION,
  readWorkspacePresentation,
  resolveWorkspacePresentation,
  workspacePresentationClassName,
} from './workspacePresentation';

describe('workspace presentation preference', () => {
  it('uses the verified minimal presentation for clean profiles', () => {
    expect(DEFAULT_WORKSPACE_PRESENTATION).toBe('minimal');
    expect(resolveWorkspacePresentation()).toBe('minimal');
    expect(resolveWorkspacePresentation({
      configured: 'unknown',
      search: '?void-ui=unknown',
      stored: 'unknown',
    })).toBe('minimal');
  });

  it('uses the same minimal fallback when browser state is unavailable', () => {
    expect(readWorkspacePresentation()).toBe('minimal');
  });

  it('restores a valid saved presentation, including explicit classic rollback', () => {
    expect(resolveWorkspacePresentation({ stored: 'minimal' })).toBe('minimal');
    expect(resolveWorkspacePresentation({ stored: 'classic' })).toBe('classic');
  });

  it('supports build-time presentation selection and classic rollback', () => {
    expect(resolveWorkspacePresentation({
      configured: 'minimal',
      stored: 'classic',
    })).toBe('minimal');
    expect(resolveWorkspacePresentation({
      configured: 'classic',
      stored: 'minimal',
    })).toBe('classic');
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
