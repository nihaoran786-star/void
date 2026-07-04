import React from 'react';
import {
  Aperture,
  AppWindow,
  Box,
  GitPullRequest,
  Grid3x3,
  Regex,
  Sparkles,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getMiniAppIconGradient, renderMiniAppIcon } from './miniAppIcons';

function expectIconType(node: React.ReactNode, expectedType: unknown) {
  expect(React.isValidElement(node)).toBe(true);
  if (!React.isValidElement(node)) {
    return;
  }

  expect(node.type).toBe(expectedType);
}

describe('miniAppIcons', () => {
  it.each([
    ['app-window', AppWindow],
    ['aperture', Aperture],
    ['git-pull-request', GitPullRequest],
    ['grid3x3', Grid3x3],
    ['regex', Regex],
    ['sparkles', Sparkles],
  ])('renders known icon %s without using the fallback', (name, expectedType) => {
    expectIconType(renderMiniAppIcon(name), expectedType);
  });

  it('falls back safely for unknown icons', () => {
    expectIconType(renderMiniAppIcon('unknown-icon'), Box);
  });

  it('returns theme-owned gradient tokens', () => {
    expect(getMiniAppIconGradient('regex')).toMatch(/^var\(--miniapp-icon-gradient-\d\)$/);
  });
});
