import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { AgentStudio } from '@/app/scenes/agent-studio/createAgentStudio';
import type { AgentStudioState } from '@/app/scenes/agent-studio/agentStudioSession';
import type { AgentRevisionContent } from '@/shared/services/customization/AgentAuthoringGateway';
import type { AgentActivationAction } from '@/shared/services/customization/AgentRevisionActivation';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

// Lazy so the canvas registry keeps no static dependency on the authoring
// services or the legacy debug chat; importing them eagerly pulled that whole
// graph into every canvas render path.
const AgentStudioPanel = React.lazy(() => (
  import('@/app/scenes/agent-studio/AgentStudioPanel').then(module => ({
    default: module.AgentStudioPanel,
  }))
));

interface AgentStudioSurfaceInput {
  definitionId: string;
  workspacePath: string;
}

const CLOSED_STATE: AgentStudioState = {
  phase: 'closed',
  trial: 'untried',
  draft: null,
  canPublish: false,
};

type Notice = { tone: 'info' | 'error'; message: string } | null;

/**
 * Hosts the studio for one agent definition.
 *
 * The studio is built lazily so the canvas bundle keeps no static dependency on
 * the authoring services, and it is disposed on unmount so closing the tab
 * releases the trial session rather than leaking a temporary agent.
 */
export const AgentStudioCanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = ({
  content,
}) => {
  const { t } = useI18n('components');
  const workspace = useCanvasWorkspaceFacts();
  const input = content.data as Partial<AgentStudioSurfaceInput> | undefined;
  const definitionId = input?.definitionId?.trim();
  const sourceSessionId = typeof content.metadata?.sourceSessionId === 'string'
    ? content.metadata.sourceSessionId
    : '';

  const studioRef = React.useRef<AgentStudio | null>(null);
  const [state, setState] = React.useState<AgentStudioState>(CLOSED_STATE);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [debugSessionId, setDebugSessionId] = React.useState<string | null>(null);

  const ready = workspace.status === 'ready'
    && workspace.backend !== 'remote'
    && Boolean(definitionId)
    && Boolean(sourceSessionId);
  const workspaceId = ready ? workspace.workspaceId : undefined;
  const workspacePath = ready ? workspace.workspacePath : undefined;

  React.useEffect(() => {
    if (!ready || !definitionId || !workspaceId || !workspacePath) return;

    let cancelled = false;
    let disposed: AgentStudio | null = null;
    setBusy(true);

    void (async () => {
      const { createAgentStudio } = await import('@/app/scenes/agent-studio/createAgentStudio');
      const studio = await createAgentStudio();
      if (cancelled) {
        void studio.dispose();
        return;
      }
      studioRef.current = studio;
      disposed = studio;
      studio.session.subscribe(next => {
        setState(next);
        setDebugSessionId(studio.currentDebugSessionId());
      });
      const opened = await studio.session.open(
        {
          scope: {
            level: 'project',
            workspace: { backend: 'local', workspaceId, workspacePath },
          },
          definitionId,
        },
        sourceSessionId,
      );
      if (cancelled) return;
      if (opened.status !== 'open') {
        setNotice({ tone: 'error', message: opened.reason });
      }
      setBusy(false);
    })();

    return () => {
      cancelled = true;
      studioRef.current = null;
      void disposed?.dispose();
    };
  }, [definitionId, ready, sourceSessionId, workspaceId, workspacePath]);

  const runAction = React.useCallback(
    async (action: () => Promise<{ status: string; reason?: string }>) => {
      setBusy(true);
      setNotice(null);
      const result = await action();
      if (result.status !== 'open'
        && result.status !== 'saved'
        && result.status !== 'ready'
        && result.status !== 'activated') {
        setNotice({
          tone: 'error',
          message: result.reason ?? t('agentStudio.publish.untriedHint'),
        });
      }
      setDebugSessionId(studioRef.current?.currentDebugSessionId() ?? null);
      setBusy(false);
    },
    [t],
  );

  const onSave = React.useCallback((next: AgentRevisionContent) => {
    const studio = studioRef.current;
    if (!studio) return;
    void runAction(() => studio.session.save(next));
  }, [runAction]);

  const onStartTrial = React.useCallback(() => {
    const studio = studioRef.current;
    if (!studio) return;
    void runAction(() => studio.session.startTrial());
  }, [runAction]);

  const onPublish = React.useCallback((action: AgentActivationAction) => {
    const studio = studioRef.current;
    if (!studio) return;
    void runAction(() => studio.session.publish(action));
  }, [runAction]);

  if (!ready) {
    return (
      <div
        className="void-flexible-panel__unknown-content"
        data-canvas-surface-state="unavailable"
      >
        <h3>{t('agentStudio.publish.title')}</h3>
        <p>{t('agentStudio.empty')}</p>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<div className="void-flexible-panel__loading" />}>
      <AgentStudioPanel
        state={state}
        debugSessionId={debugSessionId}
        busy={busy}
        notice={notice}
        onSave={onSave}
        onStartTrial={onStartTrial}
        onPublish={onPublish}
      />
    </React.Suspense>
  );
};

AgentStudioCanvasSurfaceRenderer.displayName = 'AgentStudioCanvasSurfaceRenderer';
