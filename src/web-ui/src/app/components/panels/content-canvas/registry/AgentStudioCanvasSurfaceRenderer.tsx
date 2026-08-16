import React from 'react';

import type {
  AgentDefinitionRecord,
  AgentDefinitionScope,
} from '@/shared/services/customization/AgentAuthoringGateway';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

interface AgentStudioSurfaceInput {
  definitionId: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; definition: AgentDefinitionRecord }
  | { status: 'failed'; reason: string };

/**
 * Reads one agent definition through the Customization Module Interface.
 *
 * The service and its Desktop adapter are constructed lazily so that this
 * surface adds no startup cost and no static Tauri dependency to the Canvas
 * host bundle.
 */
async function loadDefinition(
  scope: AgentDefinitionScope,
  definitionId: string,
): Promise<AgentDefinitionRecord> {
  const [{ AgentRevisionService }, { DesktopAgentAuthoringAdapter }] = await Promise.all([
    import('@/shared/services/customization/AgentRevisionService'),
    import('@/shared/services/customization/adapters/DesktopAgentAuthoringAdapter'),
  ]);
  const service = new AgentRevisionService(new DesktopAgentAuthoringAdapter());
  return service.get({ scope, definitionId });
}

export const AgentStudioCanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = ({
  content,
}) => {
  const workspace = useCanvasWorkspaceFacts();
  const input = content.data as Partial<AgentStudioSurfaceInput> | undefined;
  const definitionId = input?.definitionId?.trim();
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });

  const workspaceReady = workspace.status === 'ready' && workspace.backend !== 'remote';
  const workspaceId = workspaceReady ? workspace.workspaceId : undefined;
  const workspacePath = workspaceReady ? workspace.workspacePath : undefined;

  React.useEffect(() => {
    if (!definitionId || !workspaceId || !workspacePath) return;

    let cancelled = false;
    setState({ status: 'loading' });
    loadDefinition(
      { level: 'project', workspace: { backend: 'local', workspaceId, workspacePath } },
      definitionId,
    ).then(
      definition => {
        if (!cancelled) setState({ status: 'ready', definition });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'The agent definition could not be read.',
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [definitionId, workspaceId, workspacePath]);

  if (!definitionId || !workspaceReady) {
    return (
      <div
        className="void-flexible-panel__unknown-content"
        data-canvas-surface-state="unavailable"
      >
        <h3>Agent Studio</h3>
        <p>Agent authoring requires a local workspace and an agent definition.</p>
      </div>
    );
  }

  if (state.status === 'loading') {
    return <div className="void-flexible-panel__loading">Reading agent revisions…</div>;
  }

  if (state.status === 'failed') {
    return (
      <div
        className="void-flexible-panel__unknown-content"
        data-canvas-surface-state="failed"
      >
        <h3>Agent Studio</h3>
        <p>{state.reason}</p>
      </div>
    );
  }

  const { definition } = state;
  const defaultRevisionId = definition.defaultRevisionId;
  const latestPublishedRevisionId = definition.latestPublishedRevisionId;

  return (
    <div className="void-agent-studio-surface" data-canvas-surface-state="ready">
      <header className="void-agent-studio-surface__header">
        <h3>{definition.personaKey}</h3>
        <dl>
          <dt>Default revision</dt>
          <dd>{defaultRevisionId ?? 'None published'}</dd>
          <dt>Latest published</dt>
          <dd>{latestPublishedRevisionId ?? 'None published'}</dd>
        </dl>
      </header>

      <section className="void-agent-studio-surface__revisions">
        <h4>Published revisions</h4>
        {definition.revisions.length === 0
          ? <p>No revision has been published yet.</p>
          : (
              <ul>
                {definition.revisions.map(revision => (
                  <li key={revision.revisionId} data-revision-id={revision.revisionId}>
                    <span>{revision.content.displayName}</span>
                    <span>{revision.createdAt}</span>
                    {revision.revisionId === defaultRevisionId ? <span>Default</span> : null}
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="void-agent-studio-surface__drafts">
        <h4>Drafts</h4>
        {definition.drafts.length === 0
          ? <p>No open draft.</p>
          : (
              <ul>
                {definition.drafts.map(draft => (
                  <li key={draft.draftId} data-draft-id={draft.draftId}>
                    <span>{draft.content.displayName}</span>
                    <span>{draft.status}</span>
                    <span>{draft.updatedAt}</span>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </div>
  );
};
