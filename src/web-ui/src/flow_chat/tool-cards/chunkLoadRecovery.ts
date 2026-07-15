const CHUNK_LOAD_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'loading chunk',
  'chunkloaderror',
] as const;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const searchable = `${error.name} ${error.message}`.toLowerCase();
  return CHUNK_LOAD_ERROR_PATTERNS.some(pattern => searchable.includes(pattern));
}

export function reloadApplication(): void {
  window.location.reload();
}
