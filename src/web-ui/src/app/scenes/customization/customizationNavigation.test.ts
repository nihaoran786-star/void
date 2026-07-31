import { describe, expect, it, vi } from 'vitest';

import {
  CUSTOMIZATION_NAV_ITEMS,
  openCustomizationNavItem,
} from './customizationNavigation';

describe('customization navigation', () => {
  it('提供智能体、技能和连接器三个统一入口', () => {
    expect(CUSTOMIZATION_NAV_ITEMS.map(item => [item.id, item.labelKey])).toEqual([
      ['agents', 'customization.nav.agents'],
      ['skills', 'customization.nav.skills'],
      ['connectors', 'customization.nav.connectors'],
    ]);
  });

  it('三个入口都打开独立场景', () => {
    const openScene = vi.fn();

    openCustomizationNavItem('agents', openScene);
    openCustomizationNavItem('skills', openScene);
    openCustomizationNavItem('connectors', openScene);

    expect(openScene.mock.calls.map(call => call[0])).toEqual([
      'agents',
      'skills',
      'connectors',
    ]);
  });
});
