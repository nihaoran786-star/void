import type { AgentDefinitionScope } from '@/shared/services/customization/AgentAuthoringGateway';

/**
 * Stops the legacy creation page from writing an agent the catalog now owns.
 *
 * Agent Studio authors through the revision catalog while this page still writes
 * the old `.md` source. Once an agent has been imported, writing that source
 * again makes catalog authoring fail closed, so the two paths must not both be
 * live for the same agent.
 *
 * The page deliberately does not learn to publish instead. Publishing requires a
 * passing trial run, and a page that saves directly would have to bypass that
 * rule to keep its current behaviour. Refusing the write and pointing at the
 * studio keeps the rule intact.
 *
 * The decision turns on whether the catalog actually answered:
 *
 * - It answered "no such agent": nothing owns it, so the legacy write is safe.
 * - It could not be reached at all: the legacy write cannot reach its own
 *   backend either, so there is no dual write to prevent and blocking would only
 *   break editing in an environment where nothing can be saved anyway.
 * - It answered with a real catalog failure (locked, corrupt, wrong scope): the
 *   catalog exists and its contents are unknown, so this fails closed. Not
 *   knowing whether it owns an agent is not the same as knowing it does not.
 */

// Codes that mean the request never reached a working catalog. The legacy write
// path shares the same transport, so it will fail on its own.
const UNREACHABLE_CODES = new Set(['unsupported_transport']);

export interface LegacyAgentWriteCheck {
  scope: AgentDefinitionScope;
  personaKey: string;
  resolveByPersonaKey: (input: {
    scope: AgentDefinitionScope;
    personaKey: string;
  }) => Promise<{ definitionId: string }>;
}

export type LegacyAgentWriteDecision =
  | { status: 'allowed' }
  | { status: 'blocked'; definitionId: string }
  | { status: 'unknown'; reason: string };

function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function checkLegacyAgentWriteAllowed(
  check: LegacyAgentWriteCheck,
): Promise<LegacyAgentWriteDecision> {
  const personaKey = check.personaKey.trim();
  if (!personaKey) {
    // A brand new agent has no persona key yet, so there is nothing the catalog
    // could already own.
    return { status: 'allowed' };
  }

  try {
    const definition = await check.resolveByPersonaKey({
      scope: check.scope,
      personaKey,
    });
    return { status: 'blocked', definitionId: definition.definitionId };
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === 'not_found' || (code && UNREACHABLE_CODES.has(code))) {
      return { status: 'allowed' };
    }
    return {
      status: 'unknown',
      reason: error instanceof Error && error.message
        ? error.message
        : 'The agent catalog could not be read.',
    };
  }
}
