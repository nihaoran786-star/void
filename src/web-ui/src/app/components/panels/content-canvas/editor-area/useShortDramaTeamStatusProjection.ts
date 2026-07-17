import { useEffect, useMemo, useState } from 'react';

import type {
  ShortDramaTeamAgentStatusProjection,
  ShortDramaTeamAgentStatusTarget,
} from '@/flow_chat/types/short-drama-team-status';
import { areShortDramaTeamStatusProjectionsEqual } from '@/flow_chat/types/short-drama-team-status';
import type { CanvasTab } from '../types';

const childSessionIdOf = (tab: CanvasTab): string | undefined => {
  const childSessionId = (tab.content.data as { childSessionId?: unknown } | undefined)
    ?.childSessionId;
  return typeof childSessionId === 'string' && childSessionId.length > 0
    ? childSessionId
    : undefined;
};

function statusTargetsOf(
  tabs: readonly CanvasTab[],
): ShortDramaTeamAgentStatusTarget[] {
  return tabs.map(tab => ({
    tabId: tab.id,
    sessionId: childSessionIdOf(tab),
  }));
}

function waitingProjectionOf(
  targets: readonly ShortDramaTeamAgentStatusTarget[],
): ShortDramaTeamAgentStatusProjection[] {
  return targets.map(target => ({
    tabId: target.tabId,
    status: 'waiting',
  }));
}

export function useShortDramaTeamStatusProjection(
  tabs: readonly CanvasTab[],
): readonly ShortDramaTeamAgentStatusProjection[] {
  const targets = useMemo(() => statusTargetsOf(tabs), [tabs]);
  const [projection, setProjection] = useState<readonly ShortDramaTeamAgentStatusProjection[]>(() =>
    waitingProjectionOf(targets),
  );

  useEffect(() => {
    if (targets.length === 0) {
      setProjection(previous => previous.length === 0 ? previous : []);
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const publish = (next: readonly ShortDramaTeamAgentStatusProjection[]) => {
      if (disposed) {
        return;
      }
      setProjection(previous =>
        areShortDramaTeamStatusProjectionsEqual(previous, next) ? previous : next,
      );
    };

    publish(waitingProjectionOf(targets));
    void import('@/flow_chat/services/ShortDramaTeamStatusProjectionAdapter')
      .then(adapter => {
        if (disposed) {
          return;
        }
        publish(adapter.readShortDramaTeamStatusProjection(targets));
        unsubscribe = adapter.subscribeShortDramaTeamStatusProjection(targets, publish);
      })
      .catch(() => {
        publish(waitingProjectionOf(targets));
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [targets]);

  return projection;
}
