/**
 * Phase-1 image tool implementation: the contract-mandated placeholder.
 *
 * Per K0-2, the only legal phase-1 behaviour is a typed
 * `{ status: 'failed', error: { kind: 'unavailable', message: 'phase-2' } }`
 * result. Zero network calls, zero providers, zero credentials. Operation IDs
 * are idempotent: repeating one returns the recorded result without a second
 * execution.
 */
import type {
  ImageToolGateway,
  ImageToolInvocation,
  ImageToolResult,
} from './ImageToolTypes';

export const IMAGE_TOOL_UNAVAILABLE_MESSAGE = 'phase-2';

export function createPlaceholderImageToolGateway(): ImageToolGateway {
  const resultsByOperationId = new Map<string, ImageToolResult>();

  return {
    async invoke(invocation: ImageToolInvocation): Promise<ImageToolResult> {
      const recorded = resultsByOperationId.get(invocation.operationId);
      if (recorded) return recorded;

      const result: ImageToolResult = {
        operationId: invocation.operationId,
        status: 'failed',
        error: { kind: 'unavailable', message: IMAGE_TOOL_UNAVAILABLE_MESSAGE },
      };
      resultsByOperationId.set(invocation.operationId, result);
      return result;
    },
  };
}

/** Shared placeholder instance for the phase-1 UI. */
export const placeholderImageToolGateway = createPlaceholderImageToolGateway();
