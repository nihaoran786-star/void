// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DESKTOP_ZOOM_LEVEL,
  DesktopZoomController,
  desktopZoomActionFromKeyboardEvent,
  nextDesktopZoomLevel,
  normalizeDesktopZoomLevel,
  type DesktopZoomAdapter,
  type DesktopZoomPreference,
} from './desktopZoom';

const keyboardEvent = (
  key: string,
  overrides: Partial<KeyboardEventInit> = {},
) => new KeyboardEvent('keydown', {
  bubbles: true,
  cancelable: true,
  code: key === '=' ? 'Equal' : key === '-' ? 'Minus' : key === '0' ? 'Digit0' : '',
  ctrlKey: true,
  key,
  ...overrides,
});

const createController = (initialLevel = DEFAULT_DESKTOP_ZOOM_LEVEL) => {
  const adapter: DesktopZoomAdapter = {
    setZoom: vi.fn().mockResolvedValue(undefined),
  };
  const preference: DesktopZoomPreference = {
    read: vi.fn().mockResolvedValue(initialLevel),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new DesktopZoomController(window, adapter, preference, 'Win32');

  return { adapter, controller, preference };
};

describe('desktop zoom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes platform-native zoom shortcuts without claiming unrelated keys', () => {
    expect(desktopZoomActionFromKeyboardEvent(keyboardEvent('='), 'Win32')).toBe('in');
    expect(desktopZoomActionFromKeyboardEvent(keyboardEvent('-'), 'Win32')).toBe('out');
    expect(desktopZoomActionFromKeyboardEvent(keyboardEvent('0'), 'Win32')).toBe('reset');
    expect(desktopZoomActionFromKeyboardEvent(
      keyboardEvent('=', { ctrlKey: false, metaKey: true }),
      'MacIntel',
    )).toBe('in');
    expect(desktopZoomActionFromKeyboardEvent(
      keyboardEvent('k'),
      'Win32',
    )).toBeNull();
  });

  it('normalizes saved values and moves through bounded browser-like levels', () => {
    expect(normalizeDesktopZoomLevel(undefined)).toBe(1);
    expect(normalizeDesktopZoomLevel(1.24)).toBe(1.25);
    expect(nextDesktopZoomLevel(1, 'in')).toBe(1.1);
    expect(nextDesktopZoomLevel(1.1, 'in')).toBe(1.25);
    expect(nextDesktopZoomLevel(1.25, 'in')).toBe(1.5);
    expect(nextDesktopZoomLevel(3, 'in')).toBe(3);
    expect(nextDesktopZoomLevel(0.5, 'out')).toBe(0.5);
    expect(nextDesktopZoomLevel(2, 'reset')).toBe(1);
  });

  it('applies the saved level and persists keyboard changes through the adapter boundary', async () => {
    const { adapter, controller, preference } = createController(1.25);
    await controller.initialize();

    const zoomIn = keyboardEvent('=');
    window.dispatchEvent(zoomIn);
    await controller.whenIdle();

    expect(zoomIn.defaultPrevented).toBe(true);
    expect(adapter.setZoom).toHaveBeenNthCalledWith(1, 1.25);
    expect(adapter.setZoom).toHaveBeenNthCalledWith(2, 1.5);
    expect(preference.write).toHaveBeenCalledWith(1.5);
    expect(controller.getRequestedLevel()).toBe(1.5);

    controller.dispose();
  });

  it('keeps the applied level usable when persistence fails', async () => {
    const { adapter, controller, preference } = createController();
    vi.mocked(preference.write).mockRejectedValueOnce(new Error('config unavailable'));
    await controller.initialize();

    window.dispatchEvent(keyboardEvent('='));
    await controller.whenIdle();

    expect(adapter.setZoom).toHaveBeenLastCalledWith(1.1);
    expect(controller.getRequestedLevel()).toBe(1.1);

    controller.dispose();
  });

  it('forces the WebView back to 100% when reset is pressed at the recorded default', async () => {
    const { adapter, controller } = createController();
    await controller.initialize();

    window.dispatchEvent(keyboardEvent('0'));
    await controller.whenIdle();

    expect(adapter.setZoom).toHaveBeenCalledTimes(2);
    expect(adapter.setZoom).toHaveBeenLastCalledWith(1);

    controller.dispose();
  });
});
