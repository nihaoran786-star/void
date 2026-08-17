import type {
  CanvasCapabilityInputContext,
  CanvasCapabilityInputResolution,
} from './CanvasCapabilityContributionRegistry';

/**
 * Resolves which agent Agent Studio should open for the current conversation.
 *
 * A session records a persona key, not a definition id, so this walks the
 * read-only lookup added for exactly this purpose. The service and its Desktop
 * adapter are imported lazily so the capability rail carries no static Tauri
 * dependency.
 */
export async function resolveAgentStudioCapabilityInput(
  context: CanvasCapabilityInputContext,
): Promise<CanvasCapabilityInputResolution> {
  const personaKey = context.personaId?.trim();
  if (!personaKey) {
    return {
      status: 'unavailable',
      reason: 'This conversation is not bound to an authored agent.',
    };
  }

  const workspace = context.workspace;
  if (!workspace || workspace.backend === 'remote') {
    return {
      status: 'unavailable',
      reason: 'Agent authoring requires a local workspace.',
    };
  }

  const [{ AgentRevisionService }, { DesktopAgentAuthoringAdapter }] = await Promise.all([
    import('@/shared/services/customization/AgentRevisionService'),
    import('@/shared/services/customization/adapters/DesktopAgentAuthoringAdapter'),
  ]);
  const service = new AgentRevisionService(new DesktopAgentAuthoringAdapter());
  const definition = await service.resolveByPersonaKey({
    scope: {
      level: 'project',
      workspace: {
        backend: 'local',
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
      },
    },
    personaKey,
  });

  return { status: 'resolved', input: { definitionId: definition.definitionId } };
}
