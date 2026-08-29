import { describe, expect, it, vi } from 'vitest';

import { StylePresetCatalog, type StylePreset } from '@/shared/services/style-preset';

import {
  classifyDirectSubmitError,
  connectInfiniteCanvasDirectMediaJobEvents,
  createDirectImageGenerationGateway,
  INFINITE_CANVAS_MEDIA_JOB_EVENT,
  SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND,
  withShortDramaBindingOnlyWhenDelivered,
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

  // —— P4 W3: generation parameter pass-through ——————————————————————————

  it('omits every P4 parameter field when the card carries none (regression guard)', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke(BLANK_CARD_INVOCATION);

    const request = calls[0].request;
    expect(Object.keys(request).sort()).toEqual([
      'imageUrls',
      'infiniteCanvas',
      'kind',
      'localReferencePaths',
      'n',
      'prompt',
      'workspaceId',
      'workspacePath',
    ]);
  });

  it('passes the image model, aspect ratio, and resolution through to the command', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      generationParams: {
        model: 'gemini-3-pro-image-preview',
        size: '16:9',
        resolution: '2K',
      },
    });

    const request = calls[0].request;
    expect(request.model).toBe('gemini-3-pro-image-preview');
    expect(request.size).toBe('16:9');
    expect(request.resolution).toBe('2K');
    // No batch size chosen: n stays 1, the pre-P4 request.
    expect(request.n).toBe(1);
    expect(request.duration).toBeUndefined();
    expect(request.aspectRatio).toBeUndefined();
  });

  it('sends the chosen batch size when the model supports it (P4 W4)', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      generationParams: { model: 'gemini-3-pro-image-preview', n: 3 },
    });

    expect(calls[0].request.n).toBe(3);
  });

  it('clamps a stored batch size the chosen model cannot honour back to 1', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      // gpt-image-2 has n_max = 1; a stale n from another model must not ship.
      generationParams: { model: 'gpt-image-2', n: 4 },
    });

    expect(calls[0].request.n).toBe(1);
  });

  it('never sends n on the video lane, whatever the card stored', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      mediaKind: 'video',
      generationParams: { n: 4 },
    });

    expect(calls[0].request.n).toBeUndefined();
  });

  it('clamps stored parameters the chosen model cannot honour before dispatch', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      // `2K` is gemini casing; gpt-image-2 only knows `1k/2k/4k`. P4 review C7:
      // letter case alone must not cost the user the setting, so the value is
      // mapped onto the target model's own spelling rather than dropped.
      generationParams: { model: 'gpt-image-2', size: '16:9', resolution: '2K' },
    });

    const request = calls[0].request;
    expect(request.size).toBe('16:9');
    expect(request.resolution).toBe('2k');
    // The default model is never spelled out: an absent field already means it.
    expect(request.model).toBeUndefined();
  });

  it('sends video duration and resolution, routing the ratio to the model field', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      operationId: 'op-video-2',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'self',
      nodeId: 'video-card-2',
      prompt: '缓慢推近镜头',
      references: [],
      generationParams: { aspectRatio: '9:16', resolution: '1080p', duration: 8 },
    });

    const request = calls[0].request;
    expect(request.aspectRatio).toBe('9:16');
    expect(request.resolution).toBe('1080p');
    expect(request.duration).toBe(8);
    expect(request.size).toBeUndefined();
    expect(request.n).toBeUndefined();
  });

  it('carries a seedance aspect ratio in `size`, the only field that model accepts', async () => {
    const { gateway, calls } = createGateway();

    await gateway.invoke({
      operationId: 'op-video-3',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'self',
      nodeId: 'video-card-3',
      prompt: '镜头环绕',
      references: [],
      generationParams: { model: 'doubao-seedance-2.0', aspectRatio: '4:3', duration: 5 },
    });

    const request = calls[0].request;
    expect(request.model).toBe('doubao-seedance-2.0');
    expect(request.size).toBe('4:3');
    expect(request.aspectRatio).toBeUndefined();
    expect(request.duration).toBe(5);
  });

  it('settles a backend parameter rejection as a retryable invalid-input failure', async () => {
    const { gateway, calls } = createGateway({
      status: 'error',
      error: { code: 'invalid_input', message: 'resolution 2K is not allowed for gpt-image-2' },
    });

    const first = await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      generationParams: { resolution: '4k' },
    });

    expect(first).toEqual({
      operationId: 'op-self-1',
      status: 'failed',
      error: {
        kind: 'invalid-input',
        message: 'resolution 2K is not allowed for gpt-image-2',
      },
    });
    // Not memoized: fixing the parameter and retrying must reach the backend.
    await gateway.invoke(BLANK_CARD_INVOCATION);
    expect(calls).toHaveLength(2);
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

// —— K3 §6.2: a card that owns short-drama data ————————————————————————————

const OWNED_CARD_BINDING = {
  projectId: 'static_short_drama_001',
  stage: 'assets',
  artifactId: 'artifact-1',
  artifactHandle: 'CHAR-001',
  outputMediaLabel: 'Generated on the infinite canvas',
};

function forwarded(payload: unknown): unknown {
  return withShortDramaBindingOnlyWhenDelivered(payload);
}

describe('K3 §6.2 generation with short-drama coordinates', () => {
  it('sends both bindings when the card owns a short-drama asset', async () => {
    const { gateway, calls } = createGateway();
    await gateway.invoke({ ...BLANK_CARD_INVOCATION, shortDrama: OWNED_CARD_BINDING });
    expect(calls[0].request.shortDrama).toEqual(OWNED_CARD_BINDING);
    // Beside, never instead of: the picture still comes home to the card.
    expect(calls[0].request.infiniteCanvas.operationId).toBe('op-self-1');
  });

  it('sends no short-drama key at all for an ordinary card', async () => {
    const { gateway, calls } = createGateway();
    await gateway.invoke(BLANK_CARD_INVOCATION);
    expect('shortDrama' in calls[0].request).toBe(false);
  });

  it('strips the coordinates off the submission receipt', async () => {
    // The receipt is republished as `Completed` so the media bridge can attach
    // the batch, but nothing has been drawn yet. Leaving the coordinates on it
    // would put the asset into review the instant the button was pressed.
    const { gateway, events } = createGateway({
      status: 'submitted',
      batchId: 'media_batch_1',
      receipt: {
        status: 'polling',
        batch_id: 'media_batch_1',
        infiniteCanvas: { operationId: 'op-self-1' },
        shortDrama: OWNED_CARD_BINDING,
      },
    });
    await gateway.invoke({ ...BLANK_CARD_INVOCATION, shortDrama: OWNED_CARD_BINDING });
    const result = events[0].result as Record<string, unknown>;
    expect(result.shortDrama).toBeUndefined();
    expect(result.infiniteCanvas).toEqual({ operationId: 'op-self-1' });
  });

  it('lets the coordinates through only once a picture is actually on disk', () => {
    const delivered = {
      eventType: 'Completed',
      result: {
        batch: { batch_id: 'media_batch_1', assets: [{ local_path: '/w/media/generated/b/i-001.png' }] },
        shortDrama: {
          ...OWNED_CARD_BINDING,
          outputMediaItemId: 'media_batch_1-1',
          outputMediaPath: '/w/media/generated/b/i-001.png',
          outputMediaRelativePath: 'media/generated/b/i-001.png',
        },
      },
    };
    expect(forwarded(delivered)).toBe(delivered);
  });

  it('drops the coordinates from a batch that delivered nothing', () => {
    for (const batch of [
      { batch_id: 'media_batch_1', assets: [] },
      { batch_id: 'media_batch_1', assets: [{ local_path: '   ' }] },
      { batch_id: 'media_batch_1' },
    ]) {
      const payload = {
        eventType: 'Completed',
        result: { batch, shortDrama: OWNED_CARD_BINDING, infiniteCanvas: { operationId: 'op-1' } },
      };
      const next = forwarded(payload) as { result: Record<string, unknown> };
      expect(next.result.shortDrama).toBeUndefined();
      // The canvas half is untouched: the card still settles its own failure.
      expect(next.result.infiniteCanvas).toEqual({ operationId: 'op-1' });
    }
  });

  it('drops the coordinates when the asset the backend read failed to save', () => {
    // Partly successful batch: `jobs.rs` describes `assets[0]` and nothing
    // else, so a failed first asset means no `outputMediaPath` was written —
    // even though a later asset in the same batch did save. Reading the array
    // instead would let a reference with no file behind it replace the
    // asset's current picture and put the card into review over an empty
    // image.
    const payload = {
      eventType: 'Completed',
      result: {
        batch: {
          batch_id: 'media_batch_1',
          assets: [
            { item_index: 1, save_status: 'failed', save_error: 'download refused' },
            { item_index: 2, save_status: 'saved', local_path: '/w/media/generated/b/i-002.png' },
          ],
        },
        // What the backend actually attached: coordinates, an item id, and no
        // path at all.
        shortDrama: { ...OWNED_CARD_BINDING, outputMediaItemId: 'media_batch_1-1' },
        infiniteCanvas: { operationId: 'op-1' },
      },
    };
    const next = forwarded(payload) as { result: Record<string, unknown> };
    expect(next.result.shortDrama).toBeUndefined();
    expect(next.result.infiniteCanvas).toEqual({ operationId: 'op-1' });
  });

  it('accepts a delivery described by the relative path alone', () => {
    const payload = {
      eventType: 'Completed',
      result: {
        batch: { batch_id: 'media_batch_1', assets: [{ item_index: 1 }] },
        shortDrama: {
          ...OWNED_CARD_BINDING,
          outputMediaItemId: 'media_batch_1-1',
          outputMediaRelativePath: 'media/generated/b/i-001.png',
        },
      },
    };
    expect(forwarded(payload)).toBe(payload);
  });

  it('leaves a payload with no short-drama block exactly as it was', () => {
    const payload = { eventType: 'Completed', result: { batch: { assets: [] } } };
    expect(forwarded(payload)).toBe(payload);
    expect(forwarded(undefined)).toBeUndefined();
  });
});
