import ReactDOM from 'react-dom/client';
import { I18nProvider } from '@/infrastructure/i18n';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/infrastructure/contexts/WorkspaceContext';
import { themeService, voidLightTheme } from '@/infrastructure/theme';
import type { ThemeConfig } from '@/infrastructure/theme';
import { FlowChatComparisonPrototype } from './FlowChatComparisonPrototype';
import '../../../app/styles/index.scss';
import '../../../flow_chat/components/ChatInput.scss';
import './flow-chat-comparison-prototype.css';
import './beautiful-ui-primitives.css';

document.documentElement.dataset.theme = 'void-light';
document.documentElement.dataset.themeType = 'light';

// The standalone preview has no config adapter. Project the existing light
// theme variables without reading or persisting the user's app preference.
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
  <I18nProvider>
    <WorkspaceContext.Provider value={previewWorkspaceContext}>
      <FlowChatComparisonPrototype />
    </WorkspaceContext.Provider>
  </I18nProvider>,
);
