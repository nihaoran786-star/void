import type { CodeSnippetContext, ContextItem } from '@/shared/types/context';
import type { ShortDramaMainAIContextExportResult } from './ShortDramaMainAIContextExport';

const SOURCE = 'short-drama-main-ai-context-sync' as const;

export interface ShortDramaMainAIContextRegistry {
  getContext(id: string): ContextItem | undefined;
  addContext(context: CodeSnippetContext): void;
  updateContext(id: string, updates: Partial<CodeSnippetContext>): void;
}

export type ShortDramaMainAIContextSyncResult =
  | { status: 'created'; source: typeof SOURCE; contextId: string }
  | { status: 'updated'; source: typeof SOURCE; contextId: string }
  | { status: 'skipped'; source: typeof SOURCE; reason: 'export_not_ready' };

export function syncShortDramaMainAIContextExport(
  exported: ShortDramaMainAIContextExportResult,
  registry: ShortDramaMainAIContextRegistry,
): ShortDramaMainAIContextSyncResult {
  if (exported.status !== 'ready') {
    return { status: 'skipped', source: SOURCE, reason: 'export_not_ready' };
  }

  const context = markContextTransient(exported.context);
  const existing = registry.getContext(context.id);
  if (existing) {
    registry.updateContext(context.id, context);
    return { status: 'updated', source: SOURCE, contextId: context.id };
  }

  registry.addContext(context);
  return { status: 'created', source: SOURCE, contextId: context.id };
}

function markContextTransient(context: CodeSnippetContext): CodeSnippetContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      transient: true,
    },
  };
}
