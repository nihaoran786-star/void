export interface LatestBrowserTaskGate {
  start(): number;
  invalidate(): void;
  isCurrent(token: number): boolean;
}

export function createLatestBrowserTaskGate(): LatestBrowserTaskGate {
  let nextToken = 0;
  let currentToken: number | null = null;

  return {
    start() {
      nextToken += 1;
      currentToken = nextToken;
      return currentToken;
    },
    invalidate() {
      currentToken = null;
    },
    isCurrent(token) {
      return currentToken !== null && token === currentToken;
    },
  };
}
