/**
 * Replayable Flow Chat streaming fixture.
 *
 * Produces a deterministic conversation (long markdown reply + fenced code
 * block + GFM table + explore tools + a critical tool) and a list of session
 * snapshots that reproduce the immutable update shape FlowChatStore emits while
 * a turn streams:
 *
 * - a new Session object per flush,
 * - a new dialogTurns array with untouched turns keeping their identity,
 * - a new last turn / round / items array / streamed text item.
 *
 * The fixture is measurement-only. It does not touch runtime, persistence or
 * session lifecycle; consumers feed the snapshots into the presentation store.
 */

import type {
  AnyFlowItem,
  DialogTurn,
  FlowTextItem,
  FlowToolItem,
  ModelRound,
  Session,
} from '../types/flow-chat';

const BASE_TIMESTAMP = 1_700_000_000_000;

const PROSE_PARAGRAPHS = [
  'The streaming reply starts with a short summary of what changed and why the change is safe to land.',
  'It then walks the reader through the affected modules, calling out the boundary each one sits behind.',
  'Numbered guidance follows so the reader can act without re-reading the whole answer.',
  'A closing paragraph records the verification that was run and what is still outstanding.',
];

const CODE_BLOCK = [
  '```ts',
  'export function projectVirtualItems(session: Session): VirtualItem[] {',
  '  const items: VirtualItem[] = [];',
  '  for (const turn of session.dialogTurns) {',
  '    for (const round of turn.modelRounds) {',
  '      items.push({ type: "model-round", data: round, turnId: turn.id });',
  '    }',
  '  }',
  '  return items;',
  '}',
  '```',
].join('\n');

const TABLE_BLOCK = [
  '| Surface | Owner | State |',
  '| --- | --- | --- |',
  '| Message list | flow_chat | ready |',
  '| Composer | flow_chat | ready |',
  '| Tool cards | tool-cards | ready |',
].join('\n');

/**
 * A long assistant answer that exercises every expensive markdown path:
 * paragraphs, a list, a fenced code block and a GFM table.
 */
export function buildLongMarkdownReply(): string {
  return [
    `## Summary\n\n${PROSE_PARAGRAPHS[0]}`,
    `${PROSE_PARAGRAPHS[1]}\n\n${PROSE_PARAGRAPHS[2]}`,
    '### Steps\n\n1. Read the projection.\n2. Measure the render scope.\n3. Only then change code.',
    CODE_BLOCK,
    '### Surfaces\n\n' + TABLE_BLOCK,
    `### Verification\n\n${PROSE_PARAGRAPHS[3]}`,
  ].join('\n\n');
}

function textItem(id: string, content: string, streaming: boolean): FlowTextItem {
  return {
    id,
    type: 'text',
    timestamp: BASE_TIMESTAMP,
    status: streaming ? 'streaming' : 'completed',
    content,
    isStreaming: streaming,
    isMarkdown: true,
  };
}

function toolItem(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
  result: string,
): FlowToolItem {
  return {
    id,
    type: 'tool',
    timestamp: BASE_TIMESTAMP,
    status: 'completed',
    toolName,
    toolCall: { input, id },
    toolResult: { result, success: true, duration_ms: 12 },
    endTime: BASE_TIMESTAMP + 12,
  } as FlowToolItem;
}

function round(id: string, index: number, items: AnyFlowItem[], streaming: boolean): ModelRound {
  return {
    id,
    index,
    items,
    isStreaming: streaming,
    isComplete: !streaming,
    status: streaming ? 'streaming' : 'completed',
    startTime: BASE_TIMESTAMP,
    endTime: streaming ? undefined : BASE_TIMESTAMP + 900,
  };
}

function completedTurn(turnIndex: number, sessionId: string): DialogTurn {
  const turnId = `turn-${turnIndex}`;
  return {
    id: turnId,
    sessionId,
    userMessage: {
      id: `${turnId}-user`,
      content: `Question ${turnIndex}: explain the projection layer and show the code.`,
      timestamp: BASE_TIMESTAMP,
    },
    modelRounds: [
      round(`${turnId}-round-explore`, 0, [
        toolItem(`${turnId}-read`, 'Read', { file_path: 'src/flow_chat/store/FlowChatStore.ts' }, 'ok'),
        toolItem(`${turnId}-grep`, 'Grep', { pattern: 'updateModelRoundItem' }, 'ok'),
      ], false),
      // TodoWrite is not a routine collapsible tool, so this round stays a
      // critical model round and its markdown answer is really rendered.
      round(`${turnId}-round-answer`, 1, [
        toolItem(`${turnId}-todo`, 'TodoWrite', { todos: [{ content: 'ship', status: 'completed' }] }, 'ok'),
        textItem(`${turnId}-text`, buildLongMarkdownReply(), false),
      ], false),
    ],
    status: 'completed',
    startTime: BASE_TIMESTAMP,
    endTime: BASE_TIMESTAMP + 1200,
  };
}

function streamingTurn(turnIndex: number, sessionId: string, content: string): DialogTurn {
  const turnId = `turn-${turnIndex}`;
  return {
    id: turnId,
    sessionId,
    userMessage: {
      id: `${turnId}-user`,
      content: `Question ${turnIndex}: stream a long answer with code and a table.`,
      timestamp: BASE_TIMESTAMP,
    },
    modelRounds: [
      round(`${turnId}-round-explore`, 0, [
        toolItem(`${turnId}-read`, 'Read', { file_path: 'src/flow_chat/perf/fixture.ts' }, 'ok'),
      ], false),
      round(`${turnId}-round-answer`, 1, [
        textItem(`${turnId}-text`, content, true),
      ], true),
    ],
    status: 'processing',
    startTime: BASE_TIMESTAMP,
  };
}

function makeSession(sessionId: string, dialogTurns: DialogTurn[], flushIndex: number): Session {
  return {
    sessionId,
    title: 'Streaming replay fixture',
    dialogTurns,
    status: 'active',
    config: { workspacePath: 'D:/workspace/void' },
    createdAt: BASE_TIMESTAMP,
    // FlowChatStore stamps activity on every mutation, so the session object
    // identity always changes per flush. Mirror that here.
    lastActiveAt: BASE_TIMESTAMP + flushIndex,
    error: null,
    historyState: 'ready',
  } as Session;
}

export interface StreamingReplayOptions {
  /** Completed turns rendered above the streaming turn. */
  historyTurns?: number;
  /** Number of streamed flushes (one flush = one EventBatcher tick). */
  flushCount?: number;
  sessionId?: string;
}

export interface StreamingReplay {
  /** Session before the streamed turn produces any text. */
  initialSession: Session;
  /** One session snapshot per flush, in order. */
  snapshots: Session[];
  /** Full text of the streamed reply once every flush is applied. */
  finalContent: string;
  streamingTurnId: string;
}

/**
 * Build a replayable streaming conversation.
 *
 * Every snapshot keeps the previous turns' object identity and only replaces
 * the streamed turn's chain, exactly like `FlowChatStore.updateModelRoundItem`.
 */
export function buildStreamingReplay(options: StreamingReplayOptions = {}): StreamingReplay {
  const historyTurns = options.historyTurns ?? 8;
  const flushCount = options.flushCount ?? 40;
  const sessionId = options.sessionId ?? 'perf-session';

  const history: DialogTurn[] = [];
  for (let index = 1; index <= historyTurns; index += 1) {
    history.push(completedTurn(index, sessionId));
  }

  const streamingIndex = historyTurns + 1;
  const finalContent = buildLongMarkdownReply();
  const chunkSize = Math.max(1, Math.ceil(finalContent.length / flushCount));

  const initialSession = makeSession(
    sessionId,
    [...history, streamingTurn(streamingIndex, sessionId, '')],
    0,
  );

  const snapshots: Session[] = [];
  for (let flush = 1; flush <= flushCount; flush += 1) {
    const content = finalContent.slice(0, Math.min(finalContent.length, chunkSize * flush));
    snapshots.push(
      makeSession(sessionId, [...history, streamingTurn(streamingIndex, sessionId, content)], flush),
    );
  }

  return {
    initialSession,
    snapshots,
    finalContent,
    streamingTurnId: `turn-${streamingIndex}`,
  };
}
