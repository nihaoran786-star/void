import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('./capture-void-window.ps1', import.meta.url);
const helperUrl = new URL('../tests/e2e/helpers/screenshot-utils.ts', import.meta.url);
const source = await readFile(scriptUrl, 'utf8');
const helperSource = await readFile(helperUrl, 'utf8');

test('requires one explicit live HWND instead of discovering a foreground window', () => {
  assert.match(source, /\[long\]\$Hwnd/);
  assert.match(source, /IsWindow\(\$targetHwnd\)/);
  assert.doesNotMatch(source, /GetForegroundWindow|FindWindow|MainWindowHandle/);
});

test('captures in PMv2 physical coordinates and crops to DWM frame bounds', () => {
  assert.match(source, /SetProcessDpiAwarenessContext/);
  assert.match(source, /SetThreadDpiAwarenessContext/);
  assert.match(source, /dpiAwarenessContextPerMonitorAwareV2\s*=\s*\[IntPtr\]::new\(-4\)/);
  assert.match(source, /DwmGetWindowAttribute/);
  assert.match(source, /dwmExtendedFrameBounds\s*=\s*9/);
  assert.match(source, /PrintWindow/);
  assert.match(source, /pwRenderFullContent\s*=\s*2/);
  assert.match(source, /\$fullBitmap\.Clone/);
});

test('marks the screen-copy fallback as potentially occluded and writes a sidecar', () => {
  const fallbackStart = source.indexOf("$captureMethod = 'CopyFromScreen'");
  const metadataStart = source.indexOf('$metadata = [ordered]@{');
  assert.ok(fallbackStart > 0);
  assert.ok(metadataStart > fallbackStart);
  assert.match(source.slice(fallbackStart, metadataStart), /\$potentiallyOccluded\s*=\s*\$true/);
  assert.match(source, /potentially_occluded\s*=\s*\$potentiallyOccluded/);
  assert.match(source, /capture_method\s*=\s*\$captureMethod/);
  assert.match(source, /dwm_extended_frame_bounds/);
  assert.match(source, /capture_bounds/);
  assert.match(source, /ConvertTo-Json/);
});

test('derives image dimensions from the selected window instead of fixed capture sizes', () => {
  assert.match(source, /\$windowWidth\s*=\s*\$windowRect\.Right\s*-\s*\$windowRect\.Left/);
  assert.match(source, /\$captureWidth\s*=\s*\$captureRect\.Right\s*-\s*\$captureRect\.Left/);
  assert.doesNotMatch(source, /\b1804\b|\b1204\b|\b1920\b|\b1080\b/);
});

test('helper selects the largest visible window owned by the exact Void PID', () => {
  assert.match(helperSource, /VOID_E2E_APP_PID/);
  assert.match(helperSource, /GetWindowThreadProcessId/);
  assert.match(helperSource, /owner\s*!=\s*processId\s*\|\|\s*!IsWindowVisible/);
  assert.match(helperSource, /long area = width \* height/);
  assert.match(helperSource, /if \(area > bestArea\)/);
  assert.match(helperSource, /waitForMainWindowHandle\(\s*pid,/);
});

test('helper rejects a physical capture that is materially smaller than the active window', () => {
  assert.match(helperSource, /browser\.getWindowSize\(\)/);
  assert.match(helperSource, /capture_bounds\.width < logicalWindow\.width \* 0\.9/);
  assert.match(helperSource, /capture_bounds\.height < logicalWindow\.height \* 0\.9/);
  assert.match(helperSource, /selected HWND is not the Void main window/);
});
