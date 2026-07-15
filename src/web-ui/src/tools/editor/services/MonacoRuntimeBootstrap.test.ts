import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureMonacoRuntime,
  resetMonacoRuntimeBootstrapForTests,
} from './MonacoRuntimeBootstrap';

describe('configureMonacoRuntime', () => {
  beforeEach(() => resetMonacoRuntimeBootstrapForTests());

  it('configures paths and the existing worker mapping once', () => {
    const config = vi.fn();
    const createWorker = vi.fn((url: string, options: WorkerOptions) => ({ url, options }) as unknown as Worker);
    const runtimeWindow: { MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker } } = {};

    configureMonacoRuntime({
      loader: { config },
      runtimeWindow,
      monacoPath: './monaco-editor/vs',
      isDev: true,
      createWorker,
    });
    configureMonacoRuntime({
      loader: { config },
      runtimeWindow,
      monacoPath: './ignored',
      isDev: true,
      createWorker,
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ paths: { vs: './monaco-editor/vs' } });

    runtimeWindow.MonacoEnvironment?.getWorker('', 'typescript');
    expect(createWorker).toHaveBeenLastCalledWith(
      './monaco-editor/vs/language/typescript/tsWorker.js',
      { type: 'classic', name: 'monaco-typescript-worker' },
    );

    runtimeWindow.MonacoEnvironment?.getWorker('', 'unknown');
    expect(createWorker).toHaveBeenLastCalledWith(
      './monaco-editor/vs/base/worker/workerMain.js',
      { type: 'classic', name: 'monaco-unknown-worker' },
    );
  });

  it('defers the production resource diagnostic', async () => {
    const schedule = vi.fn((callback: () => void) => callback());
    const checkResources = vi.fn(async () => undefined);

    configureMonacoRuntime({
      loader: { config: vi.fn() },
      runtimeWindow: {},
      monacoPath: './monaco-editor/vs',
      isDev: false,
      createWorker: vi.fn(),
      schedule,
      checkResources,
    });

    await Promise.resolve();
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(checkResources).toHaveBeenCalledTimes(1);
  });
});
