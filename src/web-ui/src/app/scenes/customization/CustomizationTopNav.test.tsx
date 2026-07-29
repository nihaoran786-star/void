import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('CustomizationTopNav', () => {
  it('组件模块只导出 React 组件，导航规则由独立模块承载', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./CustomizationTopNav.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('export type CustomizationTopNavItem');
    expect(source).not.toContain('export const CUSTOMIZATION_NAV_ITEMS');
    expect(source).not.toContain('export function openCustomizationNavItem');
    expect(source).toContain('export default CustomizationTopNav');
  });
});
