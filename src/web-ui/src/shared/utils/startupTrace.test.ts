import { describe, expect, it, vi } from 'vitest';
import {
  createStartupTrace,
  estimateJsonBytes,
  installStartupTraceDiagnostics,
  isRemoteTraceContext,
  isRemoteTraceRequest,
  isStartupRenderTraceEnabled,
  markPhaseAfterAnimationFrames,
  recordReactRenderProfile,
} from './startupTrace';
import type { LoggerLike } from './timing';

function createTestLogger(): LoggerLike & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('startupTrace', () => {
  it('records startup phases without exposing sensitive fields', () => {
    const logger = createTestLogger();
    const trace = createStartupTrace({
      logger,
      traceId: 'trace-test',
      now: () => 100,
    });

    trace.markPhase('before_render_start', {
      apiKey: 'secret',
      command: 'get_config',
      request: { nested: 'payload' },
      remoteConnectionId: 'ssh-user@example.com',
      sshHost: 'example.internal',
      remote: true,
    });

    expect(logger.debug).toHaveBeenCalledTimes(1);
    const [, payload] = logger.debug.mock.calls[0];
    expect(payload).toMatchObject({
      traceId: 'trace-test',
      phase: 'before_render_start',
      command: 'get_config',
      remote: true,
    });
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('request');
    expect(payload).not.toHaveProperty('remoteConnectionId');
    expect(payload).not.toHaveProperty('sshHost');
  });

  it('aggregates API calls by command and remote status', () => {
    const logger = createTestLogger();
    const trace = createStartupTrace({
      logger,
      traceId: 'trace-test',
      now: () => 100,
    });

    trace.recordApiCall({
      type: 'tauri',
      command: 'list_persisted_sessions',
      durationMs: 12.4,
      requestBytes: 100,
      responseBytes: 500,
      remote: true,
      cacheOutcome: 'miss',
    });
    trace.recordApiCall({
      type: 'tauri',
      command: 'list_persisted_sessions',
      durationMs: 7.6,
      requestBytes: 80,
      responseBytes: 300,
      remote: true,
      cacheOutcome: 'hit',
    });
    trace.recordApiCall({
      type: 'tauri',
      command: 'get_config',
      durationMs: 5,
      requestBytes: 40,
      responseBytes: 60,
      remote: false,
    });
    trace.recordApiCall({
      type: 'tauri',
      command: 'git_get_status',
      durationMs: 8,
      requestBytes: 20,
      remote: false,
      outcome: 'failure',
    });

    trace.flushSummary('test');

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [, payload] = logger.info.mock.calls[0];
    expect(payload).toMatchObject({
      traceId: 'trace-test',
      reason: 'test',
      phases: {
        events: [],
      },
      api: {
        totalCount: 4,
        successCount: 3,
        failureCount: 1,
        cacheHitCount: 1,
        cacheMissCount: 1,
        cacheUnknownCount: 2,
        remoteCount: 2,
        requestBytes: 240,
        responseBytes: 860,
      },
    });
    expect(payload.api.byCommand).toEqual([
      {
        command: 'list_persisted_sessions',
        count: 2,
        successCount: 2,
        failureCount: 0,
        cacheHitCount: 1,
        cacheMissCount: 1,
        cacheUnknownCount: 0,
        remoteCount: 2,
        totalDurationMs: 20,
        maxDurationMs: 12.4,
        requestBytes: 180,
        responseBytes: 800,
      },
      {
        command: 'git_get_status',
        count: 1,
        successCount: 0,
        failureCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 0,
        cacheUnknownCount: 1,
        remoteCount: 0,
        totalDurationMs: 8,
        maxDurationMs: 8,
        requestBytes: 20,
        responseBytes: 0,
      },
      {
        command: 'get_config',
        count: 1,
        successCount: 1,
        failureCount: 0,
        cacheHitCount: 0,
        cacheMissCount: 0,
        cacheUnknownCount: 1,
        remoteCount: 0,
        totalDurationMs: 5,
        maxDurationMs: 5,
        requestBytes: 40,
        responseBytes: 60,
      },
    ]);
    expect(payload.api.calls).toHaveLength(4);
    expect(payload.api.calls[0]).toMatchObject({
      traceId: 'trace-test',
      type: 'tauri',
      command: 'list_persisted_sessions',
      durationMs: 12.4,
      outcome: 'success',
      cacheOutcome: 'miss',
      requestBytes: 100,
      responseBytes: 500,
      remote: true,
    });
  });

  it('exposes bounded sanitized startup diagnostics', () => {
    const logger = createTestLogger();
    const trace = createStartupTrace({
      logger,
      traceId: 'trace-test',
      now: () => 100,
      maxApiCallRecords: 1,
    });

    trace.markPhase('before_render_start', {
      workspacePath: 'D:/private/workspace',
      phaseKind: 'visible',
    });
    trace.recordApiCall({
      type: 'tauri',
      command: 'get_config',
      target: 'settings',
      startedAtMs: 1.25,
      endedAtMs: 4.75,
      durationMs: 3.5,
      requestBytes: 20,
      responseBytes: 30,
      remote: false,
    });
    trace.recordApiCall({
      type: 'http',
      command: 'ignored_after_limit',
      durationMs: 10,
      remote: false,
    });

    const snapshot = trace.snapshot();

    expect(snapshot.phases.events).toEqual([
      {
        traceId: 'trace-test',
        phase: 'before_render_start',
        atMs: 100,
        phaseKind: 'visible',
      },
    ]);
    expect(snapshot.api.totalCount).toBe(2);
    expect(snapshot.api.calls).toEqual([
      {
        traceId: 'trace-test',
        type: 'tauri',
        command: 'get_config',
        target: 'settings',
        startedAtMs: 1.3,
        endedAtMs: 4.8,
        durationMs: 3.5,
        outcome: 'success',
        cacheOutcome: 'unknown',
        requestBytes: 20,
        responseBytes: 30,
        remote: false,
      },
    ]);
  });

  it('records API boundary timing fields without raw payloads', () => {
    const trace = createStartupTrace({
      logger: createTestLogger(),
      traceId: 'trace-test',
      now: () => 100,
    });

    trace.recordApiCall({
      type: 'tauri',
      command: 'get_workspace_stats',
      target: 'workspace',
      startedAtMs: 10.12,
      durationMs: 25.67,
      requestBytes: 120,
      responseBytes: 240,
      requestPayloadEstimateDurationMs: 1.24,
      responsePayloadEstimateDurationMs: 2.46,
      adapterInitDurationMs: 3.14,
      transportDurationMs: 4.15,
      invokeDurationMs: 18.38,
      activeRequestsAtStart: 2,
      activeRequestsAtEnd: 1,
      maxConcurrentRequests: 4,
      remote: true,
    });

    const snapshot = trace.snapshot();

    expect(snapshot.api.payloadEstimateDurationMs).toBe(3.7);
    expect(snapshot.api.calls[0]).toEqual({
      traceId: 'trace-test',
      type: 'tauri',
      command: 'get_workspace_stats',
      target: 'workspace',
      startedAtMs: 10.1,
      endedAtMs: 35.8,
      durationMs: 25.7,
      outcome: 'success',
      cacheOutcome: 'unknown',
      requestBytes: 120,
      responseBytes: 240,
      remote: true,
      payloadEstimateDurationMs: 3.7,
      requestPayloadEstimateDurationMs: 1.2,
      responsePayloadEstimateDurationMs: 2.5,
      adapterInitDurationMs: 3.1,
      transportDurationMs: 4.2,
      invokeDurationMs: 18.4,
      activeRequestsAtStart: 2,
      activeRequestsAtEnd: 1,
      maxConcurrentRequests: 4,
    });
  });

  it('records React render profiles only when explicitly enabled', () => {
    const previousRenderProfileEnabled = globalThis.__VOID_RENDER_PROFILE_ENABLED__;
    const trace = createStartupTrace({
      logger: createTestLogger(),
      traceId: 'trace-test',
      now: () => 100,
    });

    try {
      globalThis.__VOID_RENDER_PROFILE_ENABLED__ = false;
      expect(isStartupRenderTraceEnabled()).toBe(false);
      recordReactRenderProfile(trace, {
        component: 'MarkdownRenderer',
        phase: 'commit',
        actualDurationMs: 12.345,
        baseDurationMs: 20.5,
        startTimeMs: 10,
        commitTimeMs: 25,
        contentLength: 1024,
        itemCount: 12,
        groupCount: 7,
        renderedCount: 5,
        turnId: 'turn-1',
        roundId: 'round-1',
        itemId: 'item-1',
        visibleGroupStartIndex: 2,
        visibleGroupEndIndex: 7,
        textItemCount: 4,
        toolItemCount: 8,
        visibleTextItemCount: 2,
        visibleToolItemCount: 3,
        criticalGroupCount: 5,
        exploreGroupCount: 2,
        hasCodeBlock: true,
        request: { unsafe: 'payload' },
      });
      expect(trace.snapshot().phases.events).toHaveLength(0);

      globalThis.__VOID_RENDER_PROFILE_ENABLED__ = true;
      expect(isStartupRenderTraceEnabled()).toBe(true);
      recordReactRenderProfile(trace, {
        component: 'MarkdownRenderer',
        phase: 'commit',
        actualDurationMs: 12.345,
        baseDurationMs: 20.5,
        startTimeMs: 10,
        commitTimeMs: 25,
        contentLength: 1024,
        itemCount: 12,
        groupCount: 7,
        renderedCount: 5,
        turnId: 'turn-1',
        roundId: 'round-1',
        itemId: 'item-1',
        visibleGroupStartIndex: 2,
        visibleGroupEndIndex: 7,
        textItemCount: 4,
        toolItemCount: 8,
        visibleTextItemCount: 2,
        visibleToolItemCount: 3,
        criticalGroupCount: 5,
        exploreGroupCount: 2,
        hasCodeBlock: true,
        request: { unsafe: 'payload' },
      });

      expect(trace.snapshot().phases.events).toEqual([
        expect.objectContaining({
          traceId: 'trace-test',
          phase: 'react_render_profile',
          component: 'MarkdownRenderer',
          renderPhase: 'commit',
          actualDurationMs: 12.3,
          baseDurationMs: 20.5,
          startTimeMs: 10,
          commitTimeMs: 25,
          contentLength: 1024,
          itemCount: 12,
          groupCount: 7,
          renderedCount: 5,
          turnId: 'turn-1',
          roundId: 'round-1',
          itemId: 'item-1',
          visibleGroupStartIndex: 2,
          visibleGroupEndIndex: 7,
          textItemCount: 4,
          toolItemCount: 8,
          visibleTextItemCount: 2,
          visibleToolItemCount: 3,
          criticalGroupCount: 5,
          exploreGroupCount: 2,
          hasCodeBlock: true,
        }),
      ]);
      expect(trace.snapshot().phases.events[0]).not.toHaveProperty('request');
    } finally {
      if (previousRenderProfileEnabled === undefined) {
        delete globalThis.__VOID_RENDER_PROFILE_ENABLED__;
      } else {
        globalThis.__VOID_RENDER_PROFILE_ENABLED__ = previousRenderProfileEnabled;
      }
    }
  });

  it('installs a void startup diagnostics surface', () => {
    const previous = globalThis.__VOID_STARTUP_TRACE__;
    const trace = createStartupTrace({
      logger: createTestLogger(),
      traceId: 'trace-test',
      now: () => 100,
    });

    try {
      installStartupTraceDiagnostics(trace);
      expect(globalThis.__VOID_STARTUP_TRACE__?.snapshot().traceId).toBe('trace-test');
    } finally {
      globalThis.__VOID_STARTUP_TRACE__ = previous;
    }
  });

  it('flushes bounded phase records so early events survive logger startup timing', () => {
    const logger = createTestLogger();
    let now = 10;
    const trace = createStartupTrace({
      logger,
      traceId: 'trace-test',
      now: () => now,
      maxPhaseEvents: 2,
    });

    trace.markPhase('first_script_eval', { remote: false });
    now = 20;
    trace.markPhase('before_render_start');
    now = 30;
    trace.markPhase('ignored_after_limit');
    trace.flushSummary('test');

    const [, payload] = logger.info.mock.calls[0];
    expect(payload.phases).toMatchObject({
      count: 2,
      events: [
        {
          traceId: 'trace-test',
          phase: 'first_script_eval',
          atMs: 10,
          remote: false,
        },
        {
          traceId: 'trace-test',
          phase: 'before_render_start',
          atMs: 20,
        },
      ],
    });
  });

  it('does not log when disabled', () => {
    const logger = createTestLogger();
    const trace = createStartupTrace({
      enabled: false,
      logger,
      traceId: 'trace-test',
      now: () => 100,
    });

    trace.markPhase('first_script_eval');
    trace.recordApiCall({
      type: 'tauri',
      command: 'get_config',
      durationMs: 1,
      remote: false,
    });
    trace.flushSummary('disabled');

    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('marks deferred phases only after the requested animation frames', () => {
    const logger = createTestLogger();
    let now = 100;
    const callbacks: Array<(time: number) => void> = [];
    const trace = createStartupTrace({
      logger,
      traceId: 'trace-test',
      now: () => now,
    });

    markPhaseAfterAnimationFrames(trace, 'historical_session_first_paint', {
      sessionTraceId: 'session-trace',
      remote: false,
    }, {
      frameCount: 2,
      now: () => now,
      requestAnimationFrame: callback => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    expect(logger.debug).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    now = 116;
    callbacks.shift()?.(now);
    expect(logger.debug).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    now = 132;
    callbacks.shift()?.(now);

    expect(logger.debug).toHaveBeenCalledTimes(1);
    const [, payload] = logger.debug.mock.calls[0];
    expect(payload).toMatchObject({
      traceId: 'trace-test',
      phase: 'historical_session_first_paint',
      sessionTraceId: 'session-trace',
      remote: false,
      durationMs: 32,
    });
  });

  it('uses the desktop injected trace id when available', () => {
    const previousTraceId = (globalThis as { __VOID_STARTUP_TRACE_ID__?: string })
      .__VOID_STARTUP_TRACE_ID__;
    (globalThis as { __VOID_STARTUP_TRACE_ID__?: string }).__VOID_STARTUP_TRACE_ID__ =
      'desktop-123';

    try {
      const trace = createStartupTrace({
        logger: createTestLogger(),
        now: () => 100,
      });

      expect(trace.traceId).toBe('desktop-123');
    } finally {
      if (previousTraceId === undefined) {
        delete (globalThis as { __VOID_STARTUP_TRACE_ID__?: string })
          .__VOID_STARTUP_TRACE_ID__;
      } else {
        (globalThis as { __VOID_STARTUP_TRACE_ID__?: string }).__VOID_STARTUP_TRACE_ID__ =
          previousTraceId;
      }
    }
  });
});

describe('startupTrace payload helpers', () => {
  it('estimates JSON payload size with a hard cap', () => {
    const value = {
      small: 'ok',
      large: 'x'.repeat(10_000),
    };

    expect(estimateJsonBytes(value, 128)).toBe(128);
  });

  it('detects remote requests without needing full payload serialization', () => {
    expect(isRemoteTraceRequest({
      request: {
        remoteConnectionId: 'ssh-user@example.com',
      },
    })).toBe(true);
    expect(isRemoteTraceRequest({
      request: {
        workspacePath: 'D:/workspace/void',
      },
    })).toBe(false);
    expect(isRemoteTraceRequest({
      request: {
        sshHost: 'localhost',
      },
    })).toBe(false);
    expect(isRemoteTraceRequest({
      request: {
        sshHost: 'example.internal',
      },
    })).toBe(true);
    expect(isRemoteTraceRequest({
      request: {
        remoteSshHost: 'localhost',
      },
    })).toBe(false);
    expect(isRemoteTraceRequest({
      request: {
        remoteSshHost: 'example.internal',
      },
    })).toBe(true);
  });

  it('keeps local ssh hosts out of remote session counters', () => {
    expect(isRemoteTraceContext(undefined, 'localhost')).toBe(false);
    expect(isRemoteTraceContext(undefined, '127.0.0.1')).toBe(false);
    expect(isRemoteTraceContext('connection-1', 'localhost')).toBe(true);
    expect(isRemoteTraceContext(undefined, 'example.internal')).toBe(true);
  });
});
