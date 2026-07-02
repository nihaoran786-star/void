interface ResolveShortDramaEpisodeTargetOptions {
  refEpisodeId?: string;
  stateEpisodeId?: string;
  fallbackEpisodeId?: string;
}

export function resolveShortDramaEpisodeTargetId({
  refEpisodeId,
  stateEpisodeId,
  fallbackEpisodeId,
}: ResolveShortDramaEpisodeTargetOptions) {
  return refEpisodeId ?? stateEpisodeId ?? fallbackEpisodeId;
}

export function shouldUpdateShortDramaEpisodeFromScroll({
  isProgrammaticScrollPending,
}: {
  isProgrammaticScrollPending: boolean;
}) {
  return !isProgrammaticScrollPending;
}
