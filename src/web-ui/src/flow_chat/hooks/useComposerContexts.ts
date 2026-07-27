import { useCallback, useState } from 'react';

import { useContextStore } from '@/shared/stores/contextStore';
import type { ContextItem } from '@/shared/types/context';

export interface ComposerContextController {
  contexts: ContextItem[];
  addContext: (context: ContextItem) => void;
  removeContext: (contextId: string) => void;
  replaceContexts: (contexts: ContextItem[]) => void;
}

/**
 * The primary composer keeps the existing shared context adapter because browser,
 * editor and media producers already target it. Independently mounted child
 * composers keep their own context collection and persist it via session drafts.
 */
export function useComposerContexts(isIndependentChild: boolean): ComposerContextController {
  const sharedContexts = useContextStore(state => state.contexts);
  const addSharedContext = useContextStore(state => state.addContext);
  const removeSharedContext = useContextStore(state => state.removeContext);
  const replaceSharedContexts = useContextStore(state => state.replaceContexts);
  const [childContexts, setChildContexts] = useState<ContextItem[]>([]);

  const addChildContext = useCallback((context: ContextItem) => {
    setChildContexts(current => (
      current.some(candidate => candidate.id === context.id)
        ? current
        : [...current, context]
    ));
  }, []);
  const removeChildContext = useCallback((contextId: string) => {
    setChildContexts(current => current.filter(context => context.id !== contextId));
  }, []);
  const replaceChildContexts = useCallback((contexts: ContextItem[]) => {
    setChildContexts([...contexts]);
  }, []);

  return isIndependentChild
    ? {
        contexts: childContexts,
        addContext: addChildContext,
        removeContext: removeChildContext,
        replaceContexts: replaceChildContexts,
      }
    : {
        contexts: sharedContexts,
        addContext: addSharedContext,
        removeContext: removeSharedContext,
        replaceContexts: replaceSharedContexts,
      };
}
