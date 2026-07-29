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

  it('连接器沿用 MCP 设置入口，其他入口沿用原场景', () => {
    const openScene = vi.fn();
    const setSettingsActiveTab = vi.fn();

    openCustomizationNavItem('agents', openScene, setSettingsActiveTab);
    openCustomizationNavItem('skills', openScene, setSettingsActiveTab);
    openCustomizationNavItem('connectors', openScene, setSettingsActiveTab);

    expect(openScene.mock.calls.map(call => call[0])).toEqual([
      'agents',
      'skills',
      'settings',
    ]);
    expect(setSettingsActiveTab).toHaveBeenCalledWith('mcp-tools');
  });
});
