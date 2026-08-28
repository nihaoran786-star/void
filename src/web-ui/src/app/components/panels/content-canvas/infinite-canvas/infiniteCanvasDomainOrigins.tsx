/**
 * K3 §5.1.8: what a card's "from short drama" badge is allowed to say.
 *
 * The badge shows a handle (`CHAR-001`), and a handle is deliberately NOT
 * stored on the card — `domainRef` is a four-field contract and a handle can be
 * renamed. So the handle is resolved at runtime, and this context is how the
 * answer reaches the cards without threading a prop through the whole
 * reactflow projection (which would also re-create every card whenever the
 * lookup settles).
 *
 * Three states, and telling them apart is the point:
 *
 *  - **known** — the asset is there; show its handle.
 *  - **pending** — the project has not been read yet. The badge still says
 *    where the card came from, just without a handle. It must not claim the
 *    asset is gone while the answer is still in flight.
 *  - **dangling** — the project was read and the asset is not in it. The badge
 *    greys out and says so. The card and its picture stay exactly where they
 *    are: the user's picture is still theirs, and a deleted short-drama asset
 *    is no reason to take it away.
 */
import React from 'react';

import type { ShortDramaCanvasOrigin } from '@/shared/services/canvas-short-drama/shortDramaCanvasImport';
import {
  infiniteCanvasDomainRefKey,
  type InfiniteCanvasDomainRef,
} from '@/shared/services/infinite-canvas';

/** Keyed by {@link infiniteCanvasDomainRefKey}; absent value means dangling. */
export type InfiniteCanvasDomainOrigins = ReadonlyMap<string, ShortDramaCanvasOrigin>;

export type InfiniteCanvasDomainOriginState =
  | { state: 'known'; handle?: string; title?: string; status?: string }
  | { state: 'pending' }
  | { state: 'dangling' };

/**
 * `undefined` is "not read yet", which is why the context default is
 * `undefined` rather than an empty map: an empty map is a real answer meaning
 * "read, and nothing matched".
 */
const InfiniteCanvasDomainOriginContext = React.createContext<
  InfiniteCanvasDomainOrigins | undefined
>(undefined);

export const InfiniteCanvasDomainOriginProvider: React.FC<{
  origins: InfiniteCanvasDomainOrigins | undefined;
  children: React.ReactNode;
}> = ({ origins, children }) => (
  <InfiniteCanvasDomainOriginContext.Provider value={origins}>
    {children}
  </InfiniteCanvasDomainOriginContext.Provider>
);

export function useInfiniteCanvasDomainOrigin(
  domainRef: InfiniteCanvasDomainRef | undefined,
): InfiniteCanvasDomainOriginState | undefined {
  const origins = React.useContext(InfiniteCanvasDomainOriginContext);
  if (!domainRef) return undefined;
  if (!origins) return { state: 'pending' };
  const origin = origins.get(infiniteCanvasDomainRefKey(domainRef));
  return origin ? { state: 'known', ...origin } : { state: 'dangling' };
}
