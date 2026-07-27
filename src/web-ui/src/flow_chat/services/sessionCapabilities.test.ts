import { describe, expect, it } from 'vitest';
import type {
  DialogTurn,
  FlowToolItem,
  ModelRound,
  Session,
} from '../types/flow-chat';
import { deriveSessionCapabilities } from './sessionCapabilities';

function createTool(
  id: string,
  toolName: string,
  status: FlowToolItem['status'],
  timestamp: number,
  input: Record<string, unknown> = {},
  result?: Record<string, unknown>,
): FlowToolItem {
  return {
    id,
    type: 'tool',
    toolName,
    status,
    timestamp,
    startTime: timestamp,
    toolCall: { id, input },
    ...(result
      ? { toolResult: { result, success: status === 'completed' } }
      : {}),
  };
}

function createSession(tools: FlowToolItem[]): Pick<Session, 'dialogTurns'> {
  const round: ModelRound = {
    id: 'round-1',
    index: 0,
    items: tools,
    isStreaming: false,
    isComplete: true,
    status: 'completed',
    startTime: 1,
  };
  const turn: DialogTurn = {
    id: 'turn-1',
    sessionId: 'session-1',
    userMessage: {
      id: 'message-1',
      content: 'create media',
      timestamp: 1,
    },
    modelRounds: [round],
    status: 'completed',
    startTime: 1,
  };
  return { dialogTurns: [turn] };
}

describe('deriveSessionCapabilities', () => {
  it('projects short drama and media from the persisted tool transcript', () => {
    const session = createSession([
      createTool('drama-1', 'ShortDramaProject', 'completed', 10),
      createTool(
        'image-1',
        'GenerateImage',
        'running',
        20,
        { short_drama: { projectId: 'project-1' } },
      ),
    ]);

    expect(deriveSessionCapabilities(session)).toEqual([
      {
        id: 'short-drama',
        status: 'running',
        usageCount: 2,
        latestActivityAt: 20,
      },
      {
        id: 'workspace-media',
        status: 'running',
        usageCount: 1,
        latestActivityAt: 20,
      },
    ]);
  });

  it('uses the latest lifecycle state and exposes permission attention', () => {
    const session = createSession([
      createTool('image-1', 'GenerateImage', 'error', 10),
      createTool('image-2', 'GenerateImage', 'completed', 20),
      createTool('image-3', 'GenerateImage', 'pending_confirmation', 30),
    ]);

    expect(deriveSessionCapabilities(session)).toEqual([
      {
        id: 'workspace-media',
        status: 'attention',
        usageCount: 3,
        latestActivityAt: 30,
      },
    ]);
  });

  it('does not treat universal browser or terminal tools as session capabilities', () => {
    const session = createSession([
      createTool('terminal-1', 'Shell', 'completed', 10),
      createTool('browser-1', 'Browser', 'running', 20),
      createTool('read-1', 'Read', 'completed', 30),
    ]);

    expect(deriveSessionCapabilities(session)).toEqual([]);
  });

  it('keeps capability projection isolated between sessions', () => {
    const mediaSession = createSession([
      createTool('image-1', 'GenerateImage', 'completed', 10),
    ]);
    const ordinarySession = createSession([
      createTool('read-1', 'Read', 'completed', 20),
    ]);

    expect(deriveSessionCapabilities(mediaSession)).toHaveLength(1);
    expect(deriveSessionCapabilities(ordinarySession)).toEqual([]);
  });
});
