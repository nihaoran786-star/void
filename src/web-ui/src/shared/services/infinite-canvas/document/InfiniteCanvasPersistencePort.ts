/**
 * Persistence port for the Infinite Canvas domain module.
 *
 * The document service depends only on this interface; it never imports Tauri
 * or any transport. The desktop adapter lives in `src/infrastructure/` and the
 * in-memory implementation below backs tests.
 */
export interface InfiniteCanvasPersistencePort {
  /** Resolves the file content, or `null` when the file does not exist. */
  readTextFile(path: string): Promise<string | null>;
  /** Writes the full content atomically (temp file + rename semantics). */
  writeTextFileAtomic(path: string, content: string): Promise<void>;
  /** Creates the directory (and parents) when missing; idempotent. */
  ensureDirectory(path: string): Promise<void>;
}

export interface InMemoryInfiniteCanvasPersistence {
  port: InfiniteCanvasPersistencePort;
  files: Map<string, string>;
  directories: Set<string>;
  writeCount: () => number;
}

/** Deterministic in-memory port for unit tests. */
export function createInMemoryInfiniteCanvasPersistence(): InMemoryInfiniteCanvasPersistence {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  let writes = 0;

  const port: InfiniteCanvasPersistencePort = {
    async readTextFile(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async writeTextFileAtomic(path, content) {
      writes += 1;
      files.set(path, content);
    },
    async ensureDirectory(path) {
      directories.add(path);
    },
  };

  return { port, files, directories, writeCount: () => writes };
}
