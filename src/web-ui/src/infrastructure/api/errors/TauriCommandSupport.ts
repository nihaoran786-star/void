export function isTauriCommandUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unknown command|command.*not found/.test(message.toLowerCase());
}
