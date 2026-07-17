import type { Options } from '@wdio/types';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRIVER_HOST = '127.0.0.1';
const DRIVER_PORT = Number(process.env.VOID_E2E_WEBDRIVER_PORT || 4445);
const DEV_SERVER_HOST = '127.0.0.1';
const DEV_SERVER_PORT = 1422;
const LOCAL_NO_PROXY_HOSTS = ['127.0.0.1', 'localhost', '::1'];

let voidApp: ChildProcess | null = null;
let devServerProcess: ChildProcess | null = null;
let ownsDevServer = false;

function ensureLocalNoProxy(): void {
  const configuredHosts = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(/[\s,;]+/)
    .map(host => host.trim())
    .filter(Boolean);
  const mergedHosts = [...new Set([...configuredHosts, ...LOCAL_NO_PROXY_HOSTS])].join(',');

  // WebDriverIO reads NO_PROXY when its worker loads. Keep both variants in
  // sync before the worker is spawned so local driver traffic never reaches a
  // user-configured HTTP proxy.
  process.env.NO_PROXY = mergedHosts;
  process.env.no_proxy = mergedHosts;
}

function projectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function viteCliPath(): string {
  return path.join(projectRoot(), 'src', 'web-ui', 'node_modules', 'vite', 'bin', 'vite.js');
}

type BrowserLogEntry = {
  level: string;
  message: string;
  timestamp: number;
};

function executableCandidates(buildType: 'debug' | 'release'): string[] {
  const root = projectRoot();
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `void-desktop${suffix}`;

  if (process.platform === 'darwin') {
    return [
      path.join(root, 'target', buildType, binaryName),
      path.join(root, 'target', buildType, 'void.app', 'Contents', 'MacOS', 'void'),
    ];
  }

  return [path.join(root, 'target', buildType, binaryName)];
}

export function getApplicationPath(): string {
  const forcedPath = process.env.VOID_E2E_APP_PATH;
  const forcedMode = process.env.VOID_E2E_APP_MODE?.toLowerCase();

  if (forcedPath) {
    return forcedPath;
  }

  if (forcedMode === 'debug') {
    return executableCandidates('debug')[0];
  }

  if (forcedMode === 'release') {
    throw new Error('Release mode is disabled for E2E. Use the debug desktop build instead.');
  }

  const debugMatch = executableCandidates('debug').find(candidate => fs.existsSync(candidate));
  if (debugMatch) {
    return debugMatch;
  }

  throw new Error(
    `Debug desktop build not found. Expected one of: ${executableCandidates('debug').join(', ')}`
  );
}

async function waitForDevServerIfNeeded(appPath: string): Promise<void> {
  if (!appPath.includes(`${path.sep}debug${path.sep}`)) {
    return;
  }

  const running = await isPortOpen(DEV_SERVER_PORT, [DEV_SERVER_HOST, '::1']);

  if (running) {
    console.log(`Dev server is already running on port ${DEV_SERVER_PORT}`);
    return;
  }

  await startDevServer();
}

async function fetchDriverStatus(): Promise<boolean> {
  try {
    const response = await fetch(`http://${DRIVER_HOST}:${DRIVER_PORT}/status`);
    if (!response.ok) {
      return false;
    }
    const body = await response.json() as { value?: { ready?: boolean } };
    return body.value?.ready === true;
  } catch {
    return false;
  }
}

async function waitForEmbeddedDriverReady(timeoutMs: number = 30000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchDriverStatus()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Embedded WebDriver did not become ready within ${timeoutMs}ms`);
}

async function waitForActiveSessionDocumentReady(timeoutMs: number = 30000): Promise<void> {
  await browser.waitUntil(async () => browser.execute(() => {
    const root = document.getElementById('root');
    const appLayout = document.querySelector('[data-testid="app-layout"], .void-app-layout');
    const mainContent = document.querySelector(
      '[data-testid="app-main-content"], .void-app-main-workspace',
    );
    const shell = document.querySelector(
      '.void-nav-panel, .void-scene-bar, .void-nav-bar, .welcome-scene',
    );
    const splashVisible = Boolean(document.querySelector('.splash-screen'));
    const tauriReady =
      typeof window.__TAURI__ !== 'undefined' ||
      typeof window.__TAURI_INTERNALS__ !== 'undefined';

    return Boolean(
      document.body &&
      root &&
      root.childElementCount > 0 &&
      appLayout &&
      mainContent &&
      shell &&
      tauriReady &&
      !splashVisible
    );
  }), {
    timeout: timeoutMs,
    interval: 250,
    timeoutMsg: `Webview document did not become ready within ${timeoutMs}ms`,
  });
}

async function fetchSessionLogs(
  sessionId: string,
  logType: string,
): Promise<BrowserLogEntry[]> {
  const response = await fetch(`http://${DRIVER_HOST}:${DRIVER_PORT}/session/${sessionId}/se/log`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: logType }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch logs: ${response.status} ${body}`);
  }

  const payload = await response.json() as { value?: BrowserLogEntry[] };
  return payload.value ?? [];
}

function stopvoidApp(): void {
  if (!voidApp) {
    return;
  }

  voidApp.kill();
  voidApp = null;
}

function stopDevServer(): void {
  if (!devServerProcess || !ownsDevServer) {
    return;
  }

  devServerProcess.kill();
  devServerProcess = null;
  ownsDevServer = false;
}

async function isPortOpen(port: number, hosts: string[]): Promise<boolean> {
  return Promise.any(hosts.map(host => {
    return new Promise<boolean>((resolve, reject) => {
      const client = new net.Socket();
      client.setTimeout(2000);
      client.connect(port, host, () => {
        client.destroy();
        resolve(true);
      });
      client.on('error', error => {
        client.destroy();
        reject(error);
      });
      client.on('timeout', () => {
        client.destroy();
        reject(new Error(`Timeout connecting to ${host}:${port}`));
      });
    });
  })).then(() => true).catch(() => false);
}

async function waitForPort(port: number, hosts: string[], timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port, hosts)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Port ${port} did not become ready within ${timeoutMs}ms`);
}

async function startDevServer(): Promise<void> {
  if (devServerProcess) {
    await waitForPort(DEV_SERVER_PORT, [DEV_SERVER_HOST, '::1'], 60000);
    return;
  }

  console.log(`Starting dev server on http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`);

  const spawnOptions = {
    cwd: path.join(projectRoot(), 'src', 'web-ui'),
    stdio: ['ignore', 'pipe', 'pipe'] as const,
    env: {
      ...process.env,
      TAURI_DEV_HOST: DEV_SERVER_HOST,
    },
  };

  const viteEntry = viteCliPath();
  if (!fs.existsSync(viteEntry)) {
    throw new Error(`Vite CLI not found at: ${viteEntry}. Run pnpm install first.`);
  }

  // Spawn Vite's Node entry directly. A cmd.exe wrapper leaves the actual
  // Vite child alive on Windows after the E2E runner exits.
  devServerProcess = spawn(
    process.execPath,
    [
      viteEntry,
      '--force',
      '--host',
      DEV_SERVER_HOST,
      '--port',
      String(DEV_SERVER_PORT),
    ],
    spawnOptions,
  );
  ownsDevServer = true;

  devServerProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[dev-server] ${data.toString().trim()}`);
  });

  devServerProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[dev-server] ${data.toString().trim()}`);
  });

  devServerProcess.on('exit', (code, signal) => {
    console.log(`[dev-server] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    devServerProcess = null;
    ownsDevServer = false;
  });

  try {
    await waitForPort(DEV_SERVER_PORT, [DEV_SERVER_HOST, '::1'], 60000);
  } catch (error) {
    stopDevServer();
    throw error;
  }
}

async function startvoidApp(): Promise<void> {
  const appPath = getApplicationPath();

  if (!fs.existsSync(appPath)) {
    console.error(`Application not found at: ${appPath}`);
    console.error('Please build the debug application first with:');
    console.error('cargo build -p void-desktop');
    throw new Error('Application not built');
  }

  await waitForDevServerIfNeeded(appPath);

  stopvoidApp();

  console.log(`Starting void with embedded WebDriver on port ${DRIVER_PORT}`);
  console.log(`Application: ${appPath}`);

  voidApp = spawn(appPath, [], {
    cwd: projectRoot(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VOID_WEBDRIVER_PORT: String(DRIVER_PORT),
      VOID_WEBDRIVER_LABEL: 'main',
    },
  });

  voidApp.stdout?.on('data', (data: Buffer) => {
    console.log(`[void-app] ${data.toString().trim()}`);
  });

  voidApp.stderr?.on('data', (data: Buffer) => {
    console.error(`[void-app] ${data.toString().trim()}`);
  });

  voidApp.on('exit', (code, signal) => {
    console.log(`[void-app] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
  });

  await waitForEmbeddedDriverReady();
  console.log(`Embedded WebDriver transport is ready on http://${DRIVER_HOST}:${DRIVER_PORT}`);
}

function sharedAfterTest(): Options.Testrunner['afterTest'] {
  return async function afterTest(test, _context, { error, passed }) {
    const isRealFailure = !passed && !!error;
    if (!isRealFailure) {
      return;
    }

    if (process.platform === 'linux') {
      console.warn('Skipping failure screenshot on linux');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotName = `failure-${test.title.replace(/\s+/g, '_')}-${timestamp}.png`;

    try {
      const screenshotPath = path.resolve(__dirname, '..', 'reports', 'screenshots', screenshotName);
      await browser.saveScreenshot(screenshotPath);
      console.log(`Screenshot saved: ${screenshotName}`);
    } catch (screenshotError) {
      console.error('Failed to save screenshot:', screenshotError);
    }
  };
}

export function createEmbeddedConfig(specs: string[], label: string): Options.Testrunner {
  ensureLocalNoProxy();

  return {
    runner: 'local',
    autoCompileOpts: {
      autoCompile: true,
      tsNodeOpts: {
        transpileOnly: true,
        project: path.resolve(__dirname, '..', 'tsconfig.json'),
      },
    },

    specs,
    exclude: [],

    maxInstances: 1,
    capabilities: [{
      maxInstances: 1,
      browserName: 'void',
      'void:embedded': true,
    } as any],

    logLevel: 'info',
    bail: 0,
    baseUrl: '',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    services: [],
    hostname: DRIVER_HOST,
    port: DRIVER_PORT,
    path: '/',

    framework: 'mocha',
    reporters: ['spec'],

    mochaOpts: {
      ui: 'bdd',
      timeout: 120000,
      retries: 0,
    },

    onPrepare: async function onPrepare() {
      console.log(`Preparing ${label} E2E test run...`);
      const appPath = getApplicationPath();

      if (!fs.existsSync(appPath)) {
        console.error(`Application not found at: ${appPath}`);
        console.error('Please build the debug application first with:');
        console.error('cargo build -p void-desktop');
        throw new Error('Application not built');
      }

      console.log(`application: ${appPath}`);
      await waitForDevServerIfNeeded(appPath);
    },

    beforeSession: async function beforeSession() {
      await startvoidApp();
    },

    before: async function before() {
      // The embedded driver supports one active session. Wait for the shell only
      // after WebDriverIO has created that session; a disposable probe session
      // would prevent the real test session from being created.
      await waitForActiveSessionDocumentReady();

      const browserWithLogs = browser as WebdriverIO.Browser & {
        getLogs?: (logType: string) => Promise<BrowserLogEntry[]>;
      };

      if (typeof browserWithLogs.getLogs !== 'function') {
        browser.addCommand('getLogs', async function (this: WebdriverIO.Browser, logType: string) {
          return fetchSessionLogs(this.sessionId, logType);
        });
      }
    },

    afterSession: function afterSession() {
      console.log('Stopping void app...');
      stopvoidApp();
    },

    afterTest: sharedAfterTest(),

    onComplete: function onComplete() {
      console.log(`${label} E2E test run completed`);
      stopvoidApp();
      stopDevServer();
    },
  };
}
