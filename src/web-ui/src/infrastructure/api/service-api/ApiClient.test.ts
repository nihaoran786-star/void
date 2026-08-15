import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './ApiClient';

const adapterMocks = vi.hoisted(() => ({
  request: vi.fn(),
  listen: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(() => true),
}));

const traceMocks = vi.hoisted(() => ({
  estimateJsonBytes: vi.fn(() => 1),
  recordApiCall: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../adapters', () => ({
  getTransportAdapter: () => adapterMocks,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('@/shared/utils/startupTrace', () => ({
  estimateJsonBytes: traceMocks.estimateJsonBytes,
  isRemoteTraceRequest: vi.fn(() => false),
  startupTrace: traceMocks,
}));

describe('ApiClient startup trace classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not record optional get_config not found as a startup failure', async () => {
    adapterMocks.request.mockRejectedValueOnce(new Error("Config path not found: 'font'"));
    const client = new ApiClient({ enableLogging: true, retries: 0 });

    await expect(
      client.invoke('get_config', {
        request: {
          path: 'font',
          skipRetryOnNotFound: true,
        },
      })
    ).rejects.toThrow();

    expect(traceMocks.recordApiCall).toHaveBeenCalledWith(expect.objectContaining({
      command: 'get_config',
      outcome: 'success',
    }));
    expect(client.getStats()).toMatchObject({
      successfulRequests: 1,
      failedRequests: 0,
    });
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it('uses a bounded response estimate cap for session view restore', async () => {
    adapterMocks.request.mockResolvedValueOnce({ turns: [] });
    const client = new ApiClient({ enableLogging: false, retries: 0 });

    await client.invoke('restore_session_view', {
      request: {
        sessionId: 'history-1',
        workspacePath: 'D:/workspace/void',
      },
    });

    expect(traceMocks.estimateJsonBytes).toHaveBeenCalledWith(
      { turns: [] },
      2 * 1024 * 1024
    );
  });

  it('preserves structured Tauri command errors for typed domain extraction', async () => {
    const structuredError = {
      code: 'revision_conflict',
      message: 'The draft revision changed.',
      retryable: false,
      conflictKind: 'draft_revision',
      expectedRevisionId: 'draft-revision-1',
      actualRevisionId: 'draft-revision-2',
    };
    adapterMocks.request.mockRejectedValueOnce(structuredError);
    const client = new ApiClient({ enableLogging: false, retries: 0 });

    await expect(client.invoke('publish_agent_revision', {
      request: { idempotencyKey: 'publish-command-1' },
    })).rejects.toMatchObject({
      code: 'COMMAND_FAILED',
      details: { originalError: structuredError },
    });
  });
});
