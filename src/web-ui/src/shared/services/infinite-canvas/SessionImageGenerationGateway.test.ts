import { describe, expect, it } from 'vitest';

import { StylePresetCatalog, type StylePreset } from '@/shared/services/style-preset';

import type {
  InfiniteCanvasAgentTaskSendRequest,
  InfiniteCanvasAgentTaskSendResult,
  InfiniteCanvasAgentTaskSessionSender,
} from './InfiniteCanvasAgentTaskTypes';
import {
  createSessionImageGenerationGateway,
  createSessionImageToolGateway,
  referenceImageLabel,
  type SessionImageGenerationInvocation,
} from './SessionImageGenerationGateway';

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

interface FakeSender extends InfiniteCanvasAgentTaskSessionSender {
  requests: InfiniteCanvasAgentTaskSendRequest[];
}

function createFakeSender(
  result: InfiniteCanvasAgentTaskSendResult = { status: 'ready', targetSessionId: 'session-src' },
): FakeSender {
  const requests: InfiniteCanvasAgentTaskSendRequest[] = [];
  return {
    requests,
    async sendImageGenerationTask(request) {
      requests.push(request);
      return result.status === 'ready'
        ? { ...result, targetSessionId: request.targetSessionId }
        : result;
    },
  };
}

function createGateway(overrides: {
  sender?: FakeSender;
  getSourceSessionId?: () => string | undefined;
  getActiveSessionId?: () => string | undefined;
} = {}) {
  const sender = overrides.sender ?? createFakeSender();
  const gateway = createSessionImageGenerationGateway({
    workspaceId: 'workspace-1',
    documentId: 'doc-1',
    sender,
    getSourceSessionId: overrides.getSourceSessionId ?? (() => 'session-src'),
    getActiveSessionId: overrides.getActiveSessionId ?? (() => 'session-active'),
    catalog: new StylePresetCatalog([TEST_PRESET], []),
  });
  return { gateway, sender };
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

describe('SessionImageGenerationGateway', () => {
  it('dispatches a blank-card text-to-image task with style block, binding JSON, and empty image_urls note', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(result).toEqual({
      operationId: 'op-self-1',
      status: 'succeeded',
      derivedNodeId: 'card-1',
    });
    expect(sender.requests).toHaveLength(1);
    const request = sender.requests[0];
    expect(request.targetSessionId).toBe('session-src');

    // §2.1 style block from the preset catalog.
    expect(request.message).toContain('风格要求：cinematic lighting, anamorphic lens');
    expect(request.message).toContain('--ar 16:9');
    expect(request.message).toContain('注意：保持人物面部细节');
    // Pure text-to-image: explicit empty image_urls convention.
    expect(request.message).toContain('纯文生图，image_urls 传空数组');
    expect(request.message).toContain('n 固定为 1');
    // §2.2-3: binding JSON embedded verbatim with the copy-it-unchanged rule.
    expect(request.message).toContain('原样复制到 GenerateImage 的 infinite_canvas 参数');
    expect(request.binding).toEqual({
      workspaceId: 'workspace-1',
      documentId: 'doc-1',
      nodeId: 'card-1',
      resultMode: 'self',
      toolId: 'generate',
      operationId: 'op-self-1',
      stylePresetId: 'preset-cine-1',
    });
    expect(request.message).toContain(JSON.stringify(request.binding, null, 2));
    expect(request.binding).not.toHaveProperty('sourceNodeId');
  });

  it('dispatches a derived regenerate with the @图N table and ordered reference list', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke({
      operationId: 'op-regen-1',
      kind: 'generate',
      resultMode: 'derived',
      nodeId: 'card-derived-1',
      sourceNodeId: 'card-source-1',
      prompt: '@图一的构图、@图二的配色',
      references: [
        { order: 1, nodeId: 'ref-a', mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b1/a.png' } },
        { order: 2, nodeId: 'ref-b', mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b2/b.png' } },
      ],
    });

    expect(result.status).toBe('succeeded');
    expect(result.derivedNodeId).toBe('card-derived-1');
    const request = sender.requests[0];
    // §2.1 reference table in connection order.
    expect(request.message).toContain('参考图对照表：@图一=第1张参考图, @图二=第2张参考图');
    // image_urls order convention: references in connection order.
    const first = request.message.indexOf('1. 参考图一：media/generated/b1/a.png');
    const second = request.message.indexOf('2. 参考图二：media/generated/b2/b.png');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(request.message).toContain('image_urls 必须严格按此顺序');
    // §2.2-1 UploadMediaImage guidance for local paths only.
    expect(request.message).toContain('UploadMediaImage');
    expect(request.message).toContain('已是 http(s) URL 的引用直接使用，不要重复上传');
    expect(request.binding).toMatchObject({
      resultMode: 'derived',
      toolId: 'generate',
      sourceNodeId: 'card-source-1',
      referenceNodeIds: ['ref-a', 'ref-b'],
    });
  });

  it('dispatches a video task through GenerateVideo with the mediaKind binding marker', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke({
      operationId: 'op-video-1',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'derived',
      nodeId: 'card-video-1',
      sourceNodeId: 'card-src-1',
      prompt: '缓慢推近，霓虹闪烁',
      references: [
        { order: 1, nodeId: 'card-src-1', mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b1/hero.png' } },
      ],
    });

    expect(result.status).toBe('succeeded');
    const request = sender.requests[0];
    // The video lane instructs GenerateVideo, never GenerateImage.
    expect(request.message).toContain('再调用 GenerateVideo');
    expect(request.message).toContain('原样复制到 GenerateVideo 的 infinite_canvas 参数');
    expect(request.message).not.toContain('GenerateImage');
    // Duration/resolution are left to the model's judgment (§4-W4 wording).
    expect(request.message).toContain('时长、分辨率等参数由你按任务内容判断');
    // Image-to-video source images travel as ordered references, uploaded
    // through UploadMediaImage under the same K2 constraint.
    expect(request.message).toContain('UploadMediaImage');
    expect(request.message).toContain('1. 参考图一：media/generated/b1/hero.png');
    // §3.4 binding: the K2 shape plus the mediaKind marker.
    expect(request.binding).toEqual({
      workspaceId: 'workspace-1',
      documentId: 'doc-1',
      nodeId: 'card-video-1',
      resultMode: 'derived',
      sourceNodeId: 'card-src-1',
      toolId: 'generate',
      operationId: 'op-video-1',
      mediaKind: 'video',
      referenceNodeIds: ['card-src-1'],
    });
    expect(request.message).toContain(JSON.stringify(request.binding, null, 2));
    expect(request.inputSummary).toContain('出视频');
  });

  it('dispatches a text-to-video task with the empty image_urls convention', async () => {
    const { gateway, sender } = createGateway();

    await gateway.invoke({
      operationId: 'op-video-2',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'self',
      nodeId: 'card-video-blank',
      prompt: '海面上的日出延时',
      references: [],
    });

    const request = sender.requests[0];
    expect(request.message).toContain('纯文生视频，image_urls 传空数组');
    expect(request.binding).toMatchObject({ mediaKind: 'video', resultMode: 'self' });
  });

  it('keeps the image binding free of a mediaKind marker (exact K2 shape)', async () => {
    const { gateway, sender } = createGateway();

    await gateway.invoke({ ...BLANK_CARD_INVOCATION, mediaKind: 'image' });

    expect(sender.requests[0].binding).not.toHaveProperty('mediaKind');
    expect(sender.requests[0].message).toContain('再调用 GenerateImage');
    expect(sender.requests[0].message).toContain('n 固定为 1');
  });

  it('rejects a video invocation that is not a generate operation', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke({
      operationId: 'op-video-bad-1',
      kind: 'upscale',
      mediaKind: 'video',
      resultMode: 'derived',
      nodeId: 'card-video-1',
      sourceNodeId: 'card-src-1',
      prompt: 'anything',
      references: [],
      editTargetMediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' },
    });

    expect(result.status).toBe('failed');
    expect(result.error?.kind).toBe('invalid-input');
    expect(sender.requests).toHaveLength(0);
  });

  it('rejects a video invocation that carries an edit target', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke({
      operationId: 'op-video-bad-2',
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'derived',
      nodeId: 'card-video-1',
      sourceNodeId: 'card-src-1',
      prompt: 'anything',
      references: [],
      editTargetMediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' },
    });

    expect(result.status).toBe('failed');
    expect(result.error?.kind).toBe('invalid-input');
    expect(sender.requests).toHaveLength(0);
  });

  it('keeps the message free of a style block when no preset is selected', async () => {
    const { gateway, sender } = createGateway();

    await gateway.invoke({ ...BLANK_CARD_INVOCATION, stylePresetId: undefined });

    expect(sender.requests[0].message).not.toContain('风格要求');
    expect(sender.requests[0].binding).not.toHaveProperty('stylePresetId');
  });

  it('returns a typed invalid-input failure when no session is available and does not send', async () => {
    const { gateway, sender } = createGateway({
      getSourceSessionId: () => undefined,
      getActiveSessionId: () => undefined,
    });

    const result = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(result.status).toBe('failed');
    expect(result.error?.kind).toBe('invalid-input');
    expect(sender.requests).toHaveLength(0);

    // Not a recorded terminal result: the same operation may retry later.
    const { gateway: retryable } = createGateway({ sender });
    const retried = await retryable.invoke(BLANK_CARD_INVOCATION);
    expect(retried.status).toBe('succeeded');
  });

  it('falls back to the active session when the source session is gone', async () => {
    const { gateway, sender } = createGateway({ getSourceSessionId: () => undefined });

    await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(sender.requests[0].targetSessionId).toBe('session-active');
  });

  it('rejects a derived invocation without a sourceNodeId', async () => {
    const { gateway, sender } = createGateway();

    const result = await gateway.invoke({
      ...BLANK_CARD_INVOCATION,
      operationId: 'op-bad-1',
      resultMode: 'derived',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.kind).toBe('invalid-input');
    expect(sender.requests).toHaveLength(0);
  });

  it('is idempotent per operationId: a repeat invoke returns the recorded result without a second send', async () => {
    const { gateway, sender } = createGateway();

    const first = await gateway.invoke(BLANK_CARD_INVOCATION);
    const second = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(second).toEqual(first);
    expect(sender.requests).toHaveLength(1);
  });

  it('maps a sender error to a typed backend failure that stays retryable', async () => {
    const sender = createFakeSender({ status: 'error', error: { message: 'send blew up' } });
    const { gateway } = createGateway({ sender });

    const result = await gateway.invoke(BLANK_CARD_INVOCATION);

    expect(result).toEqual({
      operationId: 'op-self-1',
      status: 'failed',
      error: { kind: 'backend', message: 'send blew up' },
    });
  });
});

describe('createSessionImageToolGateway (five-tool thin adapter)', () => {
  it('routes an image tool invocation through the session gateway with edit object first', async () => {
    const { gateway, sender } = createGateway();
    const toolGateway = createSessionImageToolGateway(gateway, invocation => ({
      status: 'ok',
      context: {
        derivedNodeId: `derived-of-${invocation.sourceNodeId}`,
        instruction: 'Expand the canvas towards 左侧 and fill it with 夜景街道.',
        editTargetMediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' },
        references: [
          { order: 1, nodeId: 'ref-a', mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/generated/b1/ref.png' } },
        ],
        stylePresetId: 'preset-cine-1',
      },
    }));

    const result = await toolGateway.invoke({
      operationId: 'op-expand-1',
      toolId: 'expand',
      sourceNodeId: 'card-source-1',
    });

    expect(result).toEqual({
      operationId: 'op-expand-1',
      status: 'succeeded',
      derivedNodeId: 'derived-of-card-source-1',
    });
    const request = sender.requests[0];
    // Edit object first, references after, in one ordered image_urls list.
    const editIndex = request.message.indexOf('1. 编辑对象：media/generated/b0/src.png');
    const refIndex = request.message.indexOf('2. 参考图一：media/generated/b1/ref.png');
    expect(editIndex).toBeGreaterThan(-1);
    expect(refIndex).toBeGreaterThan(editIndex);
    expect(request.message).toContain('Expand the canvas towards 左侧');
    expect(request.message).toContain('风格要求：cinematic lighting, anamorphic lens');
    expect(request.binding).toMatchObject({
      toolId: 'expand',
      resultMode: 'derived',
      nodeId: 'derived-of-card-source-1',
      sourceNodeId: 'card-source-1',
      operationId: 'op-expand-1',
      referenceNodeIds: ['ref-a'],
    });
  });

  it('passes a typed resolver error through without dispatching', async () => {
    const { gateway, sender } = createGateway();
    const toolGateway = createSessionImageToolGateway(gateway, () => ({
      status: 'error',
      error: { kind: 'invalid-input', message: 'source card has no image' },
    }));

    const result = await toolGateway.invoke({
      operationId: 'op-erase-1',
      toolId: 'erase',
      sourceNodeId: 'card-empty',
    });

    expect(result).toEqual({
      operationId: 'op-erase-1',
      status: 'failed',
      error: { kind: 'invalid-input', message: 'source card has no image' },
    });
    expect(sender.requests).toHaveLength(0);
  });
});

describe('referenceImageLabel', () => {
  it('uses Chinese ordinals up to ten and a numeric fallback beyond', () => {
    expect(referenceImageLabel(1)).toBe('图一');
    expect(referenceImageLabel(2)).toBe('图二');
    expect(referenceImageLabel(10)).toBe('图十');
    expect(referenceImageLabel(11)).toBe('图11');
  });
});
