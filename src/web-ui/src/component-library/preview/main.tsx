/**
 * Component preview entry
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PreviewApp } from './PreviewApp';
import { I18nProvider } from '@/infrastructure/i18n';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/infrastructure/contexts/WorkspaceContext';
import { themeService, voidLightTheme } from '@/infrastructure/theme';
import type { ThemeConfig } from '@/infrastructure/theme';
import './preview.css';
import './flowchat-cards-preview.css';

import '../../app/styles/index.scss';

document.documentElement.dataset.theme = 'void-light';
document.documentElement.dataset.themeType = 'light';
(themeService as unknown as { injectCSSVariables: (theme: ThemeConfig) => void })
  .injectCSSVariables(voidLightTheme);

const unavailableWorkspaceAction = async (): Promise<never> => {
  throw new Error('Standalone component preview does not connect workspace actions.');
};

const previewWorkspaceContext: WorkspaceContextValue = {
  currentWorkspace: null,
  openedWorkspaces: new Map(),
  activeWorkspaceId: null,
  lastUsedWorkspaceId: null,
  recentWorkspaces: [],
  loading: false,
  error: null,
  activeWorkspace: null,
  openedWorkspacesList: [],
  normalWorkspacesList: [],
  assistantWorkspacesList: [],
  openWorkspace: unavailableWorkspaceAction,
  createAssistantWorkspace: unavailableWorkspaceAction,
  closeWorkspace: unavailableWorkspaceAction,
  closeWorkspaceById: unavailableWorkspaceAction,
  deleteAssistantWorkspace: unavailableWorkspaceAction,
  resetAssistantWorkspace: unavailableWorkspaceAction,
  switchWorkspace: unavailableWorkspaceAction,
  setActiveWorkspace: unavailableWorkspaceAction,
  reorderOpenedWorkspacesInSection: unavailableWorkspaceAction,
  updateWorkspaceRelatedPaths: unavailableWorkspaceAction,
  scanWorkspaceInfo: async () => null,
  refreshRecentWorkspaces: async () => undefined,
  removeWorkspaceFromRecent: async () => undefined,
  hasWorkspace: false,
  workspaceName: '',
  workspacePath: '',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <WorkspaceContext.Provider value={previewWorkspaceContext}>
        <PreviewApp />
      </WorkspaceContext.Provider>
    </I18nProvider>
  </React.StrictMode>
);
