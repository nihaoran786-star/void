/**
 * useSceneManager — thin wrapper around the shared sceneStore.
 *
 * All consumers (SceneBar, SceneViewport, NavPanel, …) now read from and
 * write to the same Zustand store, so state is always in sync.
 */

import { useMemo } from 'react';
import { SCENE_TAB_REGISTRY, getMiniAppSceneDef } from '../scenes/registry';
import type { SceneTabDef, SceneTabId } from '../components/SceneBar/types';
import { useSceneStore } from '../stores/sceneStore';
import { useMiniAppStore } from '../scenes/miniapps/miniAppStore';
import { pickLocalizedString } from '../scenes/miniapps/utils/pickLocalizedString';
import { useI18n } from '@/infrastructure/i18n';

export interface UseSceneManagerReturn {
  openTabs: ReturnType<typeof useSceneStore.getState>['openTabs'];
  activeTabId: ReturnType<typeof useSceneStore.getState>['activeTabId'];
  tabDefs: SceneTabDef[];
  activateScene: (id: SceneTabId) => void;
  openScene: (id: SceneTabId) => void;
  closeScene: (id: SceneTabId) => void;
}

export function useSceneManager(): UseSceneManagerReturn {
  const openTabs = useSceneStore((state) => state.openTabs);
  const activeTabId = useSceneStore((state) => state.activeTabId);
  const activateScene = useSceneStore((state) => state.activateScene);
  const openScene = useSceneStore((state) => state.openScene);
  const closeScene = useSceneStore((state) => state.closeScene);
  const apps = useMiniAppStore((s) => s.apps);
  const { currentLanguage } = useI18n();

  const tabDefs = useMemo(() => {
    const appsById = new Map(apps.map((app) => [app.id, app]));
    const miniAppDefs: SceneTabDef[] = openTabs
      .filter((tab) => typeof tab.id === 'string' && tab.id.startsWith('miniapp:'))
      .map((tab) => {
        const appId = (tab.id as string).slice('miniapp:'.length);
        const app = appsById.get(appId);
        const localizedName = app
          ? pickLocalizedString(app, currentLanguage, 'name')
          : undefined;
        return getMiniAppSceneDef(appId, localizedName ?? app?.name);
      });
    return [...SCENE_TAB_REGISTRY, ...miniAppDefs];
  }, [apps, currentLanguage, openTabs]);

  return {
    openTabs,
    activeTabId,
    tabDefs,
    activateScene,
    openScene,
    closeScene,
  };
}
