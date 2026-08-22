import { describe, expect, it } from 'vitest';

import {
  createPlaceholderImageToolGateway,
  IMAGE_TOOL_UNAVAILABLE_MESSAGE,
} from './ImageToolPlaceholderGateway';
import { IMAGE_TOOL_DEFINITIONS } from './ImageToolTypes';

describe('image tool contract (K0-2 placeholder)', () => {
  it('declares exactly the five phase-1 tools, none auto-run', () => {
    expect(IMAGE_TOOL_DEFINITIONS.map(definition => definition.toolId)).toEqual([
      'upscale', 'expand', 'inpaint', 'erase', 'matting',
    ]);
    for (const definition of IMAGE_TOOL_DEFINITIONS) {
      expect(definition.autoRun).toBe(false);
      expect(definition.instructionTemplate).toContain('【');
    }
  });

  it('returns the typed phase-2 unavailable result for every tool', async () => {
    const gateway = createPlaceholderImageToolGateway();
    for (const definition of IMAGE_TOOL_DEFINITIONS) {
      const result = await gateway.invoke({
        operationId: `op-${definition.toolId}`,
        toolId: definition.toolId,
        sourceNodeId: 'node-1',
      });
      expect(result).toEqual({
        operationId: `op-${definition.toolId}`,
        status: 'failed',
        error: { kind: 'unavailable', message: IMAGE_TOOL_UNAVAILABLE_MESSAGE },
      });
      expect(result.derivedNodeId).toBeUndefined();
    }
  });

  it('is idempotent per operation id: replays return the recorded result', async () => {
    const gateway = createPlaceholderImageToolGateway();
    const first = await gateway.invoke({
      operationId: 'op-1',
      toolId: 'upscale',
      sourceNodeId: 'node-1',
    });
    const replay = await gateway.invoke({
      operationId: 'op-1',
      toolId: 'upscale',
      sourceNodeId: 'node-1',
    });
    expect(replay).toBe(first);
  });
});
