/**
 * Temporary presentation fixture for visual review of the Flow Chat message
 * surface. It mounts the real renderers over the replayable streaming fixture
 * so the condensed activity, the model summary disclosure and the single turn
 * indicator can be inspected without a provider-backed session.
 *
 * Verifier-only: delete after the review screenshots are recorded.
 */

import { useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '@/infrastructure/i18n';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/infrastructure/contexts/WorkspaceContext';
import { themeService, voidLightTheme, voidDarkTheme } from '@/infrastructure/theme';
import type { ThemeConfig } from '@/infrastructure/theme';
import { FlowChatContext, type FlowChatContextValue } from '../components/modern/FlowChatContext';
import { FlowChatPresentationActivityProvider } from '../components/modern/FlowChatPresentationActivity';
import { VirtualItemRenderer } from '../components/modern/VirtualItemRenderer';
import { ProcessingIndicator } from '../components/modern/ProcessingIndicator';
import { sessionToVirtualItems } from '../store/modernFlowChatStore';
import { buildStreamingReplay } from './streamingReplayFixture';
import '../../app/styles/index.scss';
import '../BeautifulUIFlowBindings.scss';
// The minimal presentation loads lazily in the app; the fixture needs it eagerly.
import '../../app/presentation/minimalWorkspacePresentation.scss';

const isDark = new URLSearchParams(window.location.search).get('theme') === 'dark';
document.documentElement.dataset.theme = isDark ? 'void-dark' : 'void-light';
document.documentElement.dataset.themeType = isDark ? 'dark' : 'light';
document.body.classList.add('void-ui', 'void-ui--minimal');
(themeService as unknown as { injectCSSVariables: (theme: ThemeConfig) => void })
  .injectCSSVariables(isDark ? voidDarkTheme : voidLightTheme);

const unavailable = async (): Promise<never> => {
  throw new Error('Presentation fixture does not connect workspace actions.');
};

const workspaceContext = {
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
  openWorkspace: unavailable,
  createAssistantWorkspace: unavailable,
  closeWorkspace: unavailable,
  closeWorkspaceById: unavailable,
  deleteAssistantWorkspace: unavailable,
  resetAssistantWorkspace: unavailable,
  switchWorkspace: unavailable,
  setActiveWorkspace: unavailable,
  reorderOpenedWorkspacesInSection: unavailable,
  updateWorkspaceRelatedPaths: unavailable,
  scanWorkspaceInfo: async () => null,
  refreshRecentWorkspaces: async () => undefined,
  removeWorkspaceFromRecent: async () => undefined,
  hasWorkspace: false,
  workspaceName: '',
  workspacePath: 'D:/workspace/void',
} as unknown as WorkspaceContextValue;

const replay = buildStreamingReplay({ historyTurns: 2, flushCount: 6 });
const streamingSession = replay.snapshots[3];
const settledSession = {
  ...replay.initialSession,
  dialogTurns: replay.initialSession.dialogTurns.slice(0, 2),
};

function FixtureSurface({ label, session }: { label: string; session: typeof settledSession }) {
  const [exploreGroupStates, setExploreGroupStates] = useState<Map<string, boolean>>(new Map());
  const items = useMemo(() => sessionToVirtualItems(session).slice(), [session]);

  const onExploreGroupToggle = useCallback((groupId: string) => {
    setExploreGroupStates(previous => {
      const next = new Map(previous);
      next.set(groupId, !(previous.get(groupId) ?? false));
      return next;
    });
  }, []);

  const contextValue: FlowChatContextValue = useMemo(() => ({
    sessionId: session.sessionId,
    sessionWorkspacePath: session.config?.workspacePath,
    allowUserMessageRollback: true,
    exploreGroupStates,
    onExploreGroupToggle,
    config: {
      enableMarkdown: true,
      autoScroll: true,
      showTimestamps: false,
      maxHistoryRounds: 50,
      enableVirtualScroll: true,
      theme: isDark ? 'dark' : 'light',
    },
  }), [exploreGroupStates, onExploreGroupToggle, session]);

  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{
        font: '600 12px/1.4 system-ui',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
        padding: '0 3rem',
        margin: '0 0 12px',
      }}>
        {label}
      </h2>
      <FlowChatPresentationActivityProvider isActive>
        <FlowChatContext.Provider value={contextValue}>
          {/* The minimal presentation scopes its message rules under
              .virtual-message-list, so the fixture mounts the same shell. */}
          <div className="modern-flowchat-container flow-chat-typography">
            <div className="virtual-message-list">
              {items.map((item, index) => (
                <VirtualItemRenderer key={`${item.type}-${index}`} item={item} index={index} />
              ))}
              <ProcessingIndicator
                visible
                labelKey="runtimeStatus.waitingForModelResponse"
              />
            </div>
          </div>
        </FlowChatContext.Provider>
      </FlowChatPresentationActivityProvider>
    </section>
  );
}

function FixtureApp() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-flowchat, var(--color-bg-scene))',
      padding: '32px 0',
    }}>
      <FixtureSurface label="Settled turns" session={settledSession} />
      <FixtureSurface label="Streaming turn" session={streamingSession} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <WorkspaceContext.Provider value={workspaceContext}>
      <FixtureApp />
    </WorkspaceContext.Provider>
  </I18nProvider>,
);
