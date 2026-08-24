import { describe, expect, it, vi } from 'vitest';

import { StylePresetCatalog, type StylePreset } from '@/shared/services/style-preset';

import {
  classifyDirectSubmitError,
  connectInfiniteCanvasDirectMediaJobEvents,
  createDirectImageGenerationGateway,
  INFINITE_CANVAS_MEDIA_JOB_EVENT,
  SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND,
  type SubmitInfiniteCanvasMediaJobArgs,
  type SubmitInfiniteCanvasMediaJobResponse,
} from './DirectImageGenerationGateway';
import type { SessionImageGenerationInvocation } from './SessionImageGenerationGateway';

const TEST_PRESET: StylePreset = {
  presetId: 'preset-cine-1',
  schemaVersion: '1',
  family: 'cinematic',
  name: '测试电影感',
  category: 'test',
  promptTemplate: 'cinematic lighting, anamorphic lens',
  promptSuffix: '--ar 16:9',
  guidance: '保持人物面部细节',
  origin: { project: 'kunpeng', license: 'MIT', sourcePath: 'test/preset.ts' },
};

const SUBMITTED: SubmitInfiniteCanvasMediaJobResponse = {
  status: 'submitted',
  batchId: 'media_batch_1',
  receipt: {
    status: 'polling',
    batch_id: 'media_batch_1',
    infiniteCanvas: { operationId: 'op-x' },
  },
};

function createGateway(response: SubmitInfiniteCanvasMediaJobResponse | Error = SUBMITTED) {
  const calls: Array<{ command: string; request: SubmitInfiniteCanvasMediaJobArgs }> = [];
  const events: Array<Record<string, unknown>> = [];
  const gateway = createDirectImageGenerationGateway({
    workspaceId: 'workspace-1',
    workspacePath: 'C:/workspace',
    documentId: 'doc-1',
    catalog: new StylePresetCatalog([TEST_PRESET], []),
    invokeCommand: async (command, args) => {
      calls.push({ command, request: args.request });
      if (response instanceof Error) throw response;
      return response;
    },
    emitToolRunEvent: event => {
      events.push(event);
    },
  });
  return { gateway, calls, events };
}

const BLANK_CARD_INVOCATION: SessionImageGenerationInvocation = {
  operationId: 'op-self-1',
  kind: 'generate',
  resultMode: 'self',
  nodeId: 'card-1',
  prompt: '一只在雨夜屋顶上的猫',
  stylePresetId: 'preset-cine-1',
  references: [],
};

const mediaRef = (relativePath: string) => ({
  workspacePath: 'C:/workspace',
  relativePath,
});

describe('DirectImageGenerationGateway', () => {
  it('submits a blank-card text-to-image job with binding, style block, and n=1', async () => {
    const { gateway, calls, events } = createGateway();

    const result = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(result).toEqual({
      operationId: 'op-self-1',
      status: 'succeeded',
      derivedNodeId: 'card-1',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe(SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND);
    const request = calls[0].request;
    expect(request.workspaceId).toBe('workspace-1');
    expect(request.workspacePath).toBe('C:/workspace');
    expect(request.kind).toBe('image');
    expect(request.n).toBe(1);
    expect(request.imageUrls).toEqual([]);
    expect(request.localReferencePaths).toEqual([]);
    // §2.1 style block assembled on the front end, same as the session lane.
    expect(request.prompt).toContain('一只在雨夜屋顶上的猫');
    expect(request.prompt).toContain('风格要求：cinematic lighting, anamorphic lens');
    expect(request.prompt).toContain('--ar 16:9');
    expect(request.prompt).toContain('注意：保持人物面部细节');
    // §3.1 binding, byte-identical to the session gateway's shape.
    expect(request.infiniteCanvas).toEqual({
      workspaceId: 'workspace-1',
      documentId: 'doc-1',
      nodeId: 'card-1',
      resultMode: 'self',
      toolId: 'generate',
      operationId: 'op-self-1',
      stylePresetId: 'preset-cine-1',
    });
    // The submission receipt is republished on the media-bridge lane so the
    // batch attaches to the pending operation.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'Completed',
      toolName: 'GenerateImage',
      toolId: 'infinite-canvas-direct:op-self-1',
      result: SUBMITTED.receipt,
    });
  });

  it('orders the edit target before connection-ordered references and adds the @图N table', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      operationId: 'op-tool-1',
      kind: 'outpaint',
      resultMode: 'derived',
      nodeId: 'card-derived-1',
      sourceNodeId: 'card-source-1',
      prompt: '把画面向左右各扩展 50%',
      references: [
        { order: 1, nodeId: 'ref-a', mediaRef: mediaRef('media/generated/a/image-001.png') },
        { order: 2, nodeId: 'ref-b', mediaRef: mediaRef('media/generated/b/image-001.png') },
      ],
      editTargetMediaRef: mediaRef('media/generated/src/image-001.png'),
    });

    const request = calls[0].request;
    expect(request.localReferencePaths).toEqual([
      'media/generated/src/image-001.png',
      'media/generated/a/image-001.png',
      'media/generated/b/image-001.png',
    ]);
    expect(request.prompt).toContain('参考图对照表：@图一=第1张参考图, @图二=第2张参考图');
    expect(request.infiniteCanvas).toMatchObject({
      resultMode: 'derived',
      sourceNodeId: 'card-source-1',
      toolId: 'outpaint',
      referenceNodeIds: ['ref-a', 'ref-b'],
    });
  });

  it('routes a video generation to kind video without n and stamps the binding marker', async () => {
    const { gateway, calls, events } = createGateway();

    await gateway.invoke({
      operationId: 'op-video-1',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'self',
      nodeId: 'video-card-1',
      prompt: '缓慢推近镜头',
      references: [
        { order: 1, nodeId: 'ref-img', mediaRef: mediaRef('media/generated/i/image-001.png') },
      ],
    });

    const request = calls[0].request;
    expect(request.kind).toBe('video');
    expect(request.n).toBeUndefined();
    expect(request.localReferencePaths).toEqual(['media/generated/i/image-001.png']);
    expect(request.infiniteCanvas).toMatchObject({ mediaKind: 'video' });
    expect(events[0]).toMatchObject({ toolName: 'GenerateVideo' });
  });

  it('maps typed command errors onto the K0-2 kinds and stays retryable', async () => {
    const { gateway, calls, events } = createGateway({
      status: 'error',
      receipt: {
        status: 'error',
        error: { code: 'provider_not_configured', message: 'no token' },
      },
      error: { code: 'provider_not_configured', message: 'no token' },
    });

    const first = await gateway.invoke(BLANK_CARD_INVOCATION);
    expect(first.status).toBe('failed');
    expect(first.error?.kind).toBe('auth');
    expect(events).toHaveLength(0);

    // Typed failures are not recorded: the retry re-invokes the command.
    await gateway.invoke(BLANK_CARD_INVOCATION);
    expect(calls).toHaveLength(2);
  });

  it('returns a typed backend failure when the command transport throws', async () => {
    const { gateway } = createGateway(new Error('ipc unreachable'));

    const result = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(result.status).toBe('failed');
    expect(result.error?.kind).toBe('backend');
    expect(result.error?.message).toContain('ipc unreachable');
  });

  it('is idempotent per operationId after a successful submission', async () => {
    const { gateway, calls } = createGateway();

    const first = await gateway.invoke(BLANK_CARD_INVOCATION);
    const second = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('keeps the session-lane invocation contract (validation failures are typed)', async () => {
    const { gateway, calls } = createGateway();

    const missingSource = await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      operationId: 'op-bad-1',
      resultMode: 'derived',
    });
    expect(missingSource.error?.kind).toBe('invalid-input');

    const videoTool = await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      operationId: 'op-bad-2',
      kind: 'outpaint',
      mediaKind: 'video',
      resultMode: 'derived',
      sourceNodeId: 'src-1',
      editTargetMediaRef: mediaRef('media/x.png'),
    });
    expect(videoTool.error?.kind).toBe('invalid-input');

    const toolWithoutEditTarget = await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      operationId: 'op-bad-3',
      kind: 'inpaint',
      resultMode: 'derived',
      sourceNodeId: 'src-1',
    });
    expect(toolWithoutEditTarget.error?.kind).toBe('invalid-input');

    expect(calls).toHaveLength(0);
  });
});

describe('classifyDirectSubmitError', () => {
  it('maps command and receipt codes onto the seven kinds', () => {
    expect(classifyDirectSubmitError({ code: 'invalid_input', message: 'x' }, undefined))
      .toBe('invalid-input');
    expect(classifyDirectSubmitError({ code: 'provider_not_configured', message: 'x' }, undefined))
      .toBe('auth');
    expect(classifyDirectSubmitError(
      { code: 'provider_error', message: 'x' },
      { error: { code: 'provider_error', http_status: 429 } },
    )).toBe('rate-limit');
    expect(classifyDirectSubmitError(
      { code: 'provider_error', message: 'x' },
      { error: { code: 'safety_rejected' } },
    )).toBe('invalid-input');
    expect(classifyDirectSubmitError({ code: 'upload_failed', message: 'x' }, undefined))
      .toBe('backend');
    expect(classifyDirectSubmitError({ code: 'task_id_missing', message: 'x' }, undefined))
      .toBe('backend');
  });
});

describe('connectInfiniteCanvasDirectMediaJobEvents', () => {
  it('forwards direct media-job payloads onto agent:tool-run-event and unsubscribes', () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const unsubscribe = vi.fn();
    const emitted: Array<{ event: string; payload: unknown }> = [];

    const dispose = connectInfiniteCanvasDirectMediaJobEvents(
      {
        listen(event, callback) {
          handlers.set(event, callback);
          return unsubscribe;
        },
      },
      {
        emit(event, payload) {
          emitted.push({ event, payload });
          return true;
        },
      },
    );

    const payload = {
      eventType: 'Completed',
      toolName: 'GenerateImage',
      result: { status: 'completed', infiniteCanvas: { operationId: 'op-1' } },
    };
    handlers.get(INFINITE_CANVAS_MEDIA_JOB_EVENT)?.(payload);

    expect(emitted).toEqual([{ event: 'agent:tool-run-event', payload }]);

    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
