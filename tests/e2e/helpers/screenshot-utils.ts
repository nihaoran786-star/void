/**
 * Screenshot and visual comparison utilities.
 */
import { browser, $ } from '@wdio/globals';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ScreenshotOptions {
  directory?: string;
  includeTimestamp?: boolean;
  prefix?: string;
}

interface PhysicalWindowScreenshotOptions {
  directory?: string;
  windowHandleTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface WindowBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CaptureBounds extends WindowBounds {
  width: number;
  height: number;
}

export interface PhysicalWindowCaptureMetadata {
  schema_version: string;
  captured_at_utc: string;
  hwnd: string;
  dpi_awareness: string;
  dpi: number;
  capture_method: string;
  potentially_occluded: boolean;
  fallback_reason: string | null;
  output_path: string;
  window_rect: WindowBounds;
  dwm_extended_frame_bounds: WindowBounds | null;
  capture_bounds: CaptureBounds;
}

export interface PhysicalWindowCaptureResult {
  image: string;
  sidecar: string;
  metadata: PhysicalWindowCaptureMetadata;
}

function runPowerShell(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      args,
      { encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(
            `PowerShell failed (${error.message})${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          ));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

const wait = (durationMs: number) => new Promise(resolve => setTimeout(resolve, durationMs));

async function waitForMainWindowHandle(
  pid: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<string> {
  const startedAt = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { stdout } = await runPowerShell([
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$targetPid = ${pid}; `
          + "$source = @'\n"
          + 'using System;\n'
          + 'using System.Runtime.InteropServices;\n'
          + 'public static class VoidE2EWindowEnumerator {\n'
          + '  private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);\n'
          + '  [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }\n'
          + '  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);\n'
          + '  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);\n'
          + '  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);\n'
          + '  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);\n'
          + '  [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);\n'
          + '  public static long FindLargestVisibleWindow(int processId) {\n'
          + '    SetThreadDpiAwarenessContext(new IntPtr(-4));\n'
          + '    IntPtr best = IntPtr.Zero; long bestArea = 0;\n'
          + '    EnumWindows((hwnd, _) => {\n'
          + '      uint owner; GetWindowThreadProcessId(hwnd, out owner);\n'
          + '      if (owner != processId || !IsWindowVisible(hwnd)) return true;\n'
          + '      Rect rect; if (!GetWindowRect(hwnd, out rect)) return true;\n'
          + '      long width = Math.Max(0, rect.Right - rect.Left);\n'
          + '      long height = Math.Max(0, rect.Bottom - rect.Top);\n'
          + '      long area = width * height;\n'
          + '      if (area > bestArea) { best = hwnd; bestArea = area; }\n'
          + '      return true;\n'
          + '    }, IntPtr.Zero);\n'
          + '    return best.ToInt64();\n'
          + '  }\n'
          + '}\n'
          + "'@; "
          + 'Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue; '
          + '[Console]::Out.Write([VoidE2EWindowEnumerator]::FindLargestVisibleWindow($targetPid))',
      ]);
      const handle = stdout.trim();
      if (/^\d+$/.test(handle) && BigInt(handle) > 0n) {
        return handle;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await wait(pollIntervalMs);
  }

  throw new Error(
    `Void MainWindowHandle for PID ${pid} was not available within ${timeoutMs}ms`
      + (lastError ? `; last error: ${lastError.message}` : ''),
  );
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Physical window sidecar has invalid ${label}`);
  }
  return value;
}

function requireBounds(value: unknown, label: string): WindowBounds {
  if (!value || typeof value !== 'object') {
    throw new Error(`Physical window sidecar has no ${label}`);
  }
  const bounds = value as Record<string, unknown>;
  const result = {
    left: requireFiniteNumber(bounds.left, `${label}.left`),
    top: requireFiniteNumber(bounds.top, `${label}.top`),
    right: requireFiniteNumber(bounds.right, `${label}.right`),
    bottom: requireFiniteNumber(bounds.bottom, `${label}.bottom`),
  };
  if (result.right <= result.left || result.bottom <= result.top) {
    throw new Error(`Physical window sidecar has empty ${label}`);
  }
  return result;
}

function validatePhysicalWindowMetadata(value: unknown): PhysicalWindowCaptureMetadata {
  if (!value || typeof value !== 'object') {
    throw new Error('Physical window sidecar is not a JSON object');
  }
  const raw = value as Record<string, unknown>;
  if (raw.dpi_awareness !== 'PerMonitorV2') {
    throw new Error(`Expected PerMonitorV2 DPI awareness, received ${String(raw.dpi_awareness)}`);
  }
  if (raw.capture_method !== 'PrintWindow(PW_RENDERFULLCONTENT)') {
    throw new Error(`Unexpected physical capture method: ${String(raw.capture_method)}`);
  }
  if (raw.potentially_occluded !== false) {
    throw new Error('Physical window capture may be occluded');
  }

  const dwmBounds = requireBounds(raw.dwm_extended_frame_bounds, 'dwm_extended_frame_bounds');
  const baseCaptureBounds = requireBounds(raw.capture_bounds, 'capture_bounds');
  const rawCaptureBounds = raw.capture_bounds as Record<string, unknown>;
  const captureBounds: CaptureBounds = {
    ...baseCaptureBounds,
    width: requireFiniteNumber(rawCaptureBounds.width, 'capture_bounds.width'),
    height: requireFiniteNumber(rawCaptureBounds.height, 'capture_bounds.height'),
  };
  const dwmWidth = dwmBounds.right - dwmBounds.left;
  const dwmHeight = dwmBounds.bottom - dwmBounds.top;
  if (
    captureBounds.left !== dwmBounds.left
    || captureBounds.top !== dwmBounds.top
    || captureBounds.right !== dwmBounds.right
    || captureBounds.bottom !== dwmBounds.bottom
    || captureBounds.width !== dwmWidth
    || captureBounds.height !== dwmHeight
  ) {
    throw new Error('capture_bounds do not match the DWM physical window bounds');
  }

  return {
    ...(raw as unknown as PhysicalWindowCaptureMetadata),
    dwm_extended_frame_bounds: dwmBounds,
    capture_bounds: captureBounds,
  };
}

function readPngDimensions(imagePath: string): { width: number; height: number } {
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(imagePath, 'r');
  try {
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead !== header.length) {
      throw new Error(`PNG is too short to contain an IHDR chunk: ${imagePath}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }

  if (
    header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || header.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new Error(`Physical window artifact is not a PNG with an IHDR header: ${imagePath}`);
  }
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

export async function capturePhysicalVoidWindow(
  name: string,
  options: PhysicalWindowScreenshotOptions = {},
): Promise<PhysicalWindowCaptureResult> {
  if (process.platform !== 'win32') {
    throw new Error('DWM physical full-window capture is supported only on Windows');
  }

  const rawPid = process.env.VOID_E2E_APP_PID;
  const pid = Number(rawPid);
  if (!rawPid || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`VOID_E2E_APP_PID is missing or invalid: ${rawPid ?? 'missing'}`);
  }

  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const scriptPath = path.join(projectRoot, 'scripts', 'capture-void-window.ps1');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Physical window capture script is missing: ${scriptPath}`);
  }

  const artifactParent = options.directory
    ?? path.join(projectRoot, '.codex-artifacts', 'physical-window');
  ensureDirectoryExists(artifactParent);
  const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'void-window';
  const artifactDirectory = fs.mkdtempSync(path.join(
    artifactParent,
    `${safeName}-${new Date().toISOString().replace(/[:.]/g, '-')}-`,
  ));
  const image = path.join(artifactDirectory, 'full-window.png');
  const sidecar = path.join(artifactDirectory, 'full-window.png.json');
  const hwnd = await waitForMainWindowHandle(
    pid,
    options.windowHandleTimeoutMs ?? 15_000,
    options.pollIntervalMs ?? 250,
  );

  await runPowerShell([
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Hwnd',
    hwnd,
    '-OutputPath',
    image,
    '-SidecarPath',
    sidecar,
  ]);

  if (!fs.existsSync(image) || !fs.existsSync(sidecar)) {
    throw new Error(`Physical capture did not produce both artifacts in ${artifactDirectory}`);
  }
  const metadata = validatePhysicalWindowMetadata(JSON.parse(
    fs.readFileSync(sidecar, 'utf8').replace(/^\uFEFF/, ''),
  ));
  const png = readPngDimensions(image);
  if (
    png.width !== metadata.capture_bounds.width
    || png.height !== metadata.capture_bounds.height
  ) {
    throw new Error(
      `PNG IHDR ${png.width}x${png.height} does not match capture_bounds `
      + `${metadata.capture_bounds.width}x${metadata.capture_bounds.height}`,
    );
  }
  const logicalWindow = await browser.getWindowSize();
  if (
    metadata.capture_bounds.width < logicalWindow.width * 0.9
    || metadata.capture_bounds.height < logicalWindow.height * 0.9
  ) {
    throw new Error(
      `Physical capture ${metadata.capture_bounds.width}x${metadata.capture_bounds.height} `
      + `is too small for the active WebDriver window ${logicalWindow.width}x${logicalWindow.height}; `
      + 'the selected HWND is not the Void main window',
    );
  }

  console.log(`Physical full-window screenshot saved: ${image}`);
  console.log(`Physical full-window sidecar saved: ${sidecar}`);
  return { image, sidecar, metadata };
}

function generateScreenshotName(
  baseName: string,
  options: ScreenshotOptions = {}
): string {
  const { includeTimestamp = true, prefix = '' } = options;
  
  let fileName = prefix ? `${prefix}-${baseName}` : baseName;
  
  if (includeTimestamp) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fileName = `${fileName}-${timestamp}`;
  }
  
  return `${fileName}.png`;
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function screenshotsSupported(): boolean {
  return process.platform !== 'linux';
}

export async function saveScreenshot(
  name: string,
  options: ScreenshotOptions = {}
): Promise<string> {
  const directory = options.directory || path.resolve(__dirname, '..', 'reports', 'screenshots');
  ensureDirectoryExists(directory);
  
  const fileName = generateScreenshotName(name, options);
  const filePath = path.join(directory, fileName);

  if (!screenshotsSupported()) {
    console.warn(`Skipping screenshot on ${process.platform}: ${filePath}`);
    return filePath;
  }
  
  await browser.saveScreenshot(filePath);
  console.log(`Screenshot saved: ${filePath}`);
  
  return filePath;
}

export async function saveElementScreenshot(
  selector: string,
  name: string,
  options: ScreenshotOptions = {}
): Promise<string> {
  const directory = options.directory || path.resolve(__dirname, '..', 'reports', 'screenshots');
  ensureDirectoryExists(directory);
  
  const fileName = generateScreenshotName(name, options);
  const filePath = path.join(directory, fileName);

  if (!screenshotsSupported()) {
    console.warn(`Skipping element screenshot on ${process.platform}: ${filePath}`);
    return filePath;
  }
  
  const element = await $(selector);
  await element.saveScreenshot(filePath);
  console.log(`Element screenshot saved: ${filePath}`);
  
  return filePath;
}

export async function saveFailureScreenshot(
  testName: string,
  error?: Error
): Promise<string> {
  const fileName = `failure-${testName.replace(/\s+/g, '_')}`;
  const filePath = await saveScreenshot(fileName, {
    prefix: 'FAIL',
    includeTimestamp: true,
  });
  if (error) {
    const errorFilePath = filePath.replace('.png', '.txt');
    const errorContent = `Test: ${testName}\nError: ${error.message}\nStack: ${error.stack}`;
    fs.writeFileSync(errorFilePath, errorContent);
  }
  
  return filePath;
}

export async function saveStepScreenshot(stepName: string): Promise<string> {
  return saveScreenshot(stepName, {
    prefix: 'step',
    includeTimestamp: true,
  });
}

export async function compareScreenshots(
  baselinePath: string,
  currentPath: string
): Promise<{ match: boolean; diffPercentage: number }> {
  if (!fs.existsSync(baselinePath)) {
    console.warn(`Baseline image not found: ${baselinePath}`);
    return { match: false, diffPercentage: 100 };
  }
  
  if (!fs.existsSync(currentPath)) {
    console.warn(`Current image not found: ${currentPath}`);
    return { match: false, diffPercentage: 100 };
  }
  
  const baselineSize = fs.statSync(baselinePath).size;
  const currentSize = fs.statSync(currentPath).size;
  const sizeDiff = Math.abs(baselineSize - currentSize);
  const diffPercentage = (sizeDiff / baselineSize) * 100;
  const match = diffPercentage < 1;
  
  return { match, diffPercentage };
}

export async function createBaseline(
  name: string,
  selector?: string
): Promise<string> {
  const baselineDir = path.resolve(__dirname, '..', 'baselines');
  ensureDirectoryExists(baselineDir);
  
  const fileName = `${name}.png`;
  const filePath = path.join(baselineDir, fileName);
  
  if (selector) {
    if (!screenshotsSupported()) {
      console.warn(`Skipping baseline screenshot on ${process.platform}: ${filePath}`);
      return filePath;
    }

    const element = await $(selector);
    await element.saveScreenshot(filePath);
  } else {
    if (!screenshotsSupported()) {
      console.warn(`Skipping baseline screenshot on ${process.platform}: ${filePath}`);
      return filePath;
    }

    await browser.saveScreenshot(filePath);
  }
  
  console.log(`Baseline created: ${filePath}`);
  return filePath;
}

export function getBaselinePath(name: string): string {
  return path.resolve(__dirname, '..', 'baselines', `${name}.png`);
}

export function cleanupScreenshots(
  directory: string,
  maxAgeDays: number = 7
): void {
  if (!fs.existsSync(directory)) {
    return;
  }
  
  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = fs.statSync(filePath);
    
    if (now - stats.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      console.log(`Deleted old screenshot: ${file}`);
    }
  }
}

export default {
  capturePhysicalVoidWindow,
  saveScreenshot,
  saveElementScreenshot,
  saveFailureScreenshot,
  saveStepScreenshot,
  compareScreenshots,
  createBaseline,
  getBaselinePath,
  cleanupScreenshots,
};
