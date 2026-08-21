import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeferredAutoCollapses,
  deferAutoCollapse,
  flushDeferredAutoCollapses,
  isReaderControlled,
  setReaderControlled,
} from './readerControlGate';

afterEach(() => {
  setReaderControlled(false);
  clearDeferredAutoCollapses();
});

describe('readerControlGate', () => {
  it('holds queued auto-collapses until the reader hands the viewport back', () => {
    const collapseToolCard = vi.fn();
    const collapseThinking = vi.fn();

    setReaderControlled(true);
    expect(isReaderControlled()).toBe(true);

    deferAutoCollapse('Write:tool-1', collapseToolCard);
    deferAutoCollapse('Thinking:tool-2', collapseThinking);

    // Nothing above the reader is allowed to shrink while they are reading.
    expect(collapseToolCard).not.toHaveBeenCalled();
    expect(collapseThinking).not.toHaveBeenCalled();

    setReaderControlled(false);

    expect(collapseToolCard).toHaveBeenCalledTimes(1);
    expect(collapseThinking).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest queued collapse per card', () => {
    const stale = vi.fn();
    const latest = vi.fn();

    setReaderControlled(true);
    deferAutoCollapse('Write:tool-1', stale);
    deferAutoCollapse('Write:tool-1', latest);
    setReaderControlled(false);

    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('does not re-run a flushed collapse on the next release', () => {
    const collapse = vi.fn();

    setReaderControlled(true);
    deferAutoCollapse('Write:tool-1', collapse);
    setReaderControlled(false);
    expect(collapse).toHaveBeenCalledTimes(1);

    setReaderControlled(true);
    setReaderControlled(false);
    expect(collapse).toHaveBeenCalledTimes(1);
  });

  it('drops the queue without running it when cleared', () => {
    const collapse = vi.fn();

    setReaderControlled(true);
    deferAutoCollapse('Write:tool-1', collapse);
    clearDeferredAutoCollapses();
    flushDeferredAutoCollapses();

    expect(collapse).not.toHaveBeenCalled();
  });
});
