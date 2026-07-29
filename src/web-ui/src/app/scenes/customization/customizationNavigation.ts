import {
  Bot,
  Plug,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type CustomizationTopNavItem = 'agents' | 'skills' | 'connectors';

export interface CustomizationTopNavDefinition {
  id: CustomizationTopNavItem;
  labelKey: string;
  icon: LucideIcon;
}

export const CUSTOMIZATION_NAV_ITEMS: readonly CustomizationTopNavDefinition[] = [
  { id: 'agents', labelKey: 'customization.nav.agents', icon: Bot },
  { id: 'skills', labelKey: 'customization.nav.skills', icon: Wrench },
  { id: 'connectors', labelKey: 'customization.nav.connectors', icon: Plug },
];

export function openCustomizationNavItem(
  item: CustomizationTopNavItem,
  openScene: (scene: 'agents' | 'skills' | 'settings') => void,
  setSettingsActiveTab: (tab: 'mcp-tools') => void,
): void {
  if (item === 'connectors') {
    setSettingsActiveTab('mcp-tools');
    openScene('settings');
    return;
  }
  openScene(item);
}
