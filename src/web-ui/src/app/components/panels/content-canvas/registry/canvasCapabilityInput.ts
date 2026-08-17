import type { CanvasCapabilityContribution } from './CanvasCapabilityContributionRegistry';

/**
 * Lets a capability derive its own open input from session context.
 *
 * Short Drama and Workspace Media open on the workspace alone, but Agent Studio
 * has to know which agent it is inspecting, and that comes from the persona the
 * conversation is bound to. Putting the derivation on the contribution keeps the
 * capability rail from having to know anything about a specific surface, which
 * is what the P0-B migration removed from the central components.
 */

export interface CanvasCapabilityInputContext {
  sourceSessionId?: string;
  personaId?: string;
}

export type CanvasCapabilityInputResolution =
  | { status: 'resolved'; input: unknown }
  | { status: 'unavailable'; reason: string };

export async function resolveCanvasCapabilityInput(
  contribution: CanvasCapabilityContribution,
  callerInput: unknown,
  context: CanvasCapabilityInputContext,
): Promise<CanvasCapabilityInputResolution> {
  // An explicit input is a decision the caller already made; a restore or a
  // deep link must not be second-guessed by a resolver.
  if (callerInput !== undefined) {
    return { status: 'resolved', input: callerInput };
  }
  if (!contribution.resolveInput) {
    return { status: 'resolved', input: undefined };
  }
  try {
    return await contribution.resolveInput(context);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error && error.message
        ? error.message
        : 'This capability could not resolve what to open.',
    };
  }
}
