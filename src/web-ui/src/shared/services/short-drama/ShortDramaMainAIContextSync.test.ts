import { describe, expect, it, vi } from 'vitest';

import {
  createShortDramaMainAIContextExport,
  createShortDramaStaticProject,
  syncShortDramaMainAIContextExport,
} from './index';

describe('ShortDramaMainAIContextSync', () => {
  it('adds a short-drama awareness context when none exists', () => {
    const exported = createShortDramaMainAIContextExport(createShortDramaStaticProject(), {
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      timestamp: 123,
    });
    expect(exported.status).toBe('ready');
    if (exported.status !== 'ready') return;

    const registry = {
      getContext: vi.fn(() => undefined),
      addContext: vi.fn(),
      updateContext: vi.fn(),
    };

    const result = syncShortDramaMainAIContextExport(exported, registry);

    expect(result).toEqual({
      status: 'created',
      source: 'short-drama-main-ai-context-sync',
      contextId: exported.context.id,
    });
    expect(registry.addContext).toHaveBeenCalledWith(expect.objectContaining({
      id: exported.context.id,
      metadata: expect.objectContaining({
        source: 'short-drama-main-ai-context-export',
        transient: true,
      }),
    }));
    expect(registry.updateContext).not.toHaveBeenCalled();
  });

  it('updates the existing short-drama awareness context instead of duplicating it', () => {
    const exported = createShortDramaMainAIContextExport(createShortDramaStaticProject(), {
      activeStage: 'post',
      activeEpisodeId: 'episode-02',
      timestamp: 456,
    });
    expect(exported.status).toBe('ready');
    if (exported.status !== 'ready') return;

    const registry = {
      getContext: vi.fn(() => exported.context),
      addContext: vi.fn(),
      updateContext: vi.fn(),
    };

    const result = syncShortDramaMainAIContextExport(exported, registry);

    expect(result).toEqual({
      status: 'updated',
      source: 'short-drama-main-ai-context-sync',
      contextId: exported.context.id,
    });
    expect(registry.updateContext).toHaveBeenCalledWith(exported.context.id, expect.objectContaining({
      selectedText: exported.context.selectedText,
      metadata: expect.objectContaining({
        activeStage: 'post',
        activeEpisodeId: 'episode-02',
        transient: true,
      }),
    }));
    expect(registry.addContext).not.toHaveBeenCalled();
  });
});
