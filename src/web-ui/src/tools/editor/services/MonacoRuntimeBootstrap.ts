import { loader } from '@monaco-editor/react';
import 'monaco-editor/min/vs/editor/editor.main.css';
import {
  getMonacoPath,
  logMonacoResourceCheck,
} from '../utils/monacoPathHelper';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('MonacoRuntimeBootstrap');

const MONACO_WORKER_MAP: Record<string, string> = {
  json: 'language/json/jsonWorker.js',
  css: 'language/css/cssWorker.js',
  scss: 'language/css/cssWorker.js',
  less: 'language/css/cssWorker.js',
  html: 'language/html/htmlWorker.js',
  handlebars: 'language/html/htmlWorker.js',
  razor: 'language/html/htmlWorker.js',
  typescript: 'language/typescript/tsWorker.js',
  javascript: 'language/typescript/tsWorker.js',
};

const DEFAULT_WORKER = 'base/worker/workerMain.js';

interface MonacoLoader {
  config(options: { paths: { vs: string } }): void;
}

interface MonacoRuntimeWindow {
  MonacoEnvironment?: {
    getWorker(workerId: string, label: string): Worker;
  };
}

export interface ConfigureMonacoRuntimeOptions {
  loader?: MonacoLoader;
  runtimeWindow?: MonacoRuntimeWindow;
  monacoPath?: string;
  isDev?: boolean;
  createWorker?: (url: string, options: WorkerOptions) => Worker;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  checkResources?: () => Promise<void>;
}

let configured = false;
let configuredPath: string | null = null;

export function configureMonacoRuntime(
  options: ConfigureMonacoRuntimeOptions = {},
): { monacoPath: string } {
  if (configured && configuredPath) {
    return { monacoPath: configuredPath };
  }

  const monacoLoader = options.loader ?? loader;
  const runtimeWindow = options.runtimeWindow ?? window;
  const monacoPath = options.monacoPath ?? getMonacoPath();
  const isDev = options.isDev ?? import.meta.env.DEV;
  const createWorker = options.createWorker ?? ((url, workerOptions) => new Worker(url, workerOptions));
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const checkResources = options.checkResources ?? logMonacoResourceCheck;

  monacoLoader.config({ paths: { vs: monacoPath } });
  runtimeWindow.MonacoEnvironment = {
    getWorker(_workerId, label) {
      const workerFile = MONACO_WORKER_MAP[label] ?? DEFAULT_WORKER;
      return createWorker(`${monacoPath}/${workerFile}`, {
        type: 'classic',
        name: `monaco-${label}-worker`,
      });
    },
  };

  if (!isDev) {
    schedule(() => {
      void checkResources().catch((error) => {
        log.error('Monaco resource check failed', error);
      });
    }, 2000);
  }

  configured = true;
  configuredPath = monacoPath;
  log.debug('Monaco runtime configured', { vs: monacoPath, isDev });
  return { monacoPath };
}

export function resetMonacoRuntimeBootstrapForTests(): void {
  configured = false;
  configuredPath = null;
}
