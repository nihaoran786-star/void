import { describe, expect, it } from 'vitest';

import {
  assetWriteNotice,
  planCompositeEditorLane,
  planCropEditorLane,
} from './useCanvasEditorLanes';

describe('assetWriteNotice', () => {
  it('tells a picture that will never fit apart from a backend hiccup', () => {
    expect(assetWriteNotice('expand', 'invalid_input')).toEqual({
      messageKey: 'infiniteCanvas.expand.writeTooLarge',
      errorKind: 'invalid-input',
    });
    expect(assetWriteNotice('crop', 'path_denied')).toEqual({
      messageKey: 'infiniteCanvas.crop.writeDenied',
      errorKind: 'invalid-input',
    });
    expect(assetWriteNotice('mask', 'backend')).toEqual({
      messageKey: 'infiniteCanvas.mask.writeFailed',
      errorKind: 'backend',
    });
  });
});

describe('planCropEditorLane', () => {
  it('puts the cropped picture beside the one it came from', () => {
    const plan = planCropEditorLane('op-1', 'media/a.png', 1_700_000_000_000);

    expect(plan.derivedNodeId).toBe('node-op-1');
    expect(plan.edgeId).toBe('edge-op-1');
    expect(plan.relativePath).not.toBe('media/a.png');
    expect(plan.relativePath.endsWith('.png')).toBe(true);
  });
});

describe('planCompositeEditorLane', () => {
  it('keys the scratch composite on the operation, so a retry overwrites it', () => {
    const first = planCompositeEditorLane('op-2', 'mask');
    const again = planCompositeEditorLane('op-2', 'mask');

    expect(first).toEqual(again);
    expect(first.derivedNodeId).toBe('node-op-2');
    expect(first.edgeId).toBe('edge-op-2');
  });

  it('keeps the two composites apart, because they are different pictures', () => {
    expect(planCompositeEditorLane('op-3', 'mask').relativePath)
      .not.toBe(planCompositeEditorLane('op-3', 'expand').relativePath);
  });
});
