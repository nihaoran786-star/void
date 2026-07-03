/**
 * Coalesces terminal input into sequential batched writes.
 *
 * xterm emits `onData` per keystroke. Sending every item through async IPC can
 * create concurrent writes, so this queue batches synchronous input and keeps
 * only one write in flight at a time.
 */
export class TerminalInputQueue {
  private buffer = '';
  private flushing = false;

  constructor(
    private readonly write: (data: string) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  enqueue(data: string): void {
    this.buffer += data;

    if (!this.flushing) {
      this.flushing = true;
      queueMicrotask(() => {
        void this.drain();
      });
    }
  }

  clear(): void {
    this.buffer = '';
  }

  private async drain(): Promise<void> {
    const data = this.buffer;
    this.buffer = '';

    try {
      if (data) {
        await this.write(data);
      }
    } catch (error) {
      this.onError(error);
    } finally {
      if (this.buffer) {
        void this.drain();
      } else {
        this.flushing = false;
      }
    }
  }
}
