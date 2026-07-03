export interface ResizeRepaintGuardOptions {
  maxArtifacts?: number;
  windowMs?: number;
  now?: () => number;
}

export interface ResizeRepaintGuard {
  markResize: () => void;
  shouldSkipOutput: (data: string) => boolean;
  clear: () => void;
}

// eslint-disable-next-line no-control-regex -- ESC-based cursor-position sequences are terminal protocol output.
const STANDALONE_CURSOR_POSITION_RE = /^\x1b\[\d+;\d+[Hf]$/;

const DEFAULT_MAX_ARTIFACTS = 2;
const DEFAULT_WINDOW_MS = 100;

export function isStandaloneCursorPosition(data: string): boolean {
  return STANDALONE_CURSOR_POSITION_RE.test(data);
}

export function createResizeRepaintGuard(options: ResizeRepaintGuardOptions = {}): ResizeRepaintGuard {
  const maxArtifacts = Math.max(0, options.maxArtifacts ?? DEFAULT_MAX_ARTIFACTS);
  const windowMs = Math.max(0, options.windowMs ?? DEFAULT_WINDOW_MS);
  const now = options.now ?? (() => Date.now());
  let remainingArtifacts = 0;
  let expiresAt = 0;

  return {
    markResize() {
      remainingArtifacts = maxArtifacts;
      expiresAt = now() + windowMs;
    },
    shouldSkipOutput(data: string) {
      if (remainingArtifacts <= 0) {
        return false;
      }

      if (now() > expiresAt) {
        remainingArtifacts = 0;
        expiresAt = 0;
        return false;
      }

      if (!isStandaloneCursorPosition(data)) {
        remainingArtifacts = 0;
        expiresAt = 0;
        return false;
      }

      remainingArtifacts -= 1;
      if (remainingArtifacts <= 0) {
        expiresAt = 0;
      }
      return true;
    },
    clear() {
      remainingArtifacts = 0;
      expiresAt = 0;
    },
  };
}
