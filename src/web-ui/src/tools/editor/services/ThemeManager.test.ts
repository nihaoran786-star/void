import { beforeEach, describe, expect, it, vi } from 'vitest';
import { voidDarkTheme, voidLightTheme } from '@/infrastructure/theme/presets';
import type { ThemeConfig, ThemeEvent } from '@/infrastructure/theme/types';

const mocks = vi.hoisted(() => ({
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
  getCurrentTheme: vi.fn(),
  on: vi.fn(),
  syncTheme: vi.fn(),
  getTargetMonacoThemeId: vi.fn(),
  logDebug: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@/infrastructure/theme/core/ThemeService', () => ({
  themeService: {
    getCurrentTheme: mocks.getCurrentTheme,
    on: mocks.on,
  },
}));

vi.mock('@/infrastructure/theme/integrations/MonacoThemeSync', () => ({
  monacoThemeSync: {
    syncTheme: mocks.syncTheme,
    getTargetMonacoThemeId: mocks.getTargetMonacoThemeId,
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: mocks.logDebug,
    error: mocks.logError,
    warn: mocks.logWarn,
  }),
}));

function getTargetMonacoThemeId(theme: ThemeConfig): string {
  if (theme.monaco) {
    return theme.id;
  }
  return theme.type === 'dark' ? 'void-dark' : 'void-light';
}

async function createThemeManager() {
  const { default: ThemeManager } = await import('./ThemeManager');
  return ThemeManager.getInstance();
}

describe('ThemeManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.doMock('monaco-editor/esm/vs/editor/editor.api', () => ({
      editor: {
        defineTheme: mocks.defineTheme,
        setTheme: mocks.setTheme,
      },
    }));
    mocks.getTargetMonacoThemeId.mockImplementation(getTargetMonacoThemeId);
  });

  it('retries initialization after the first theme service sync fails', async () => {
    const syncError = new Error('theme service unavailable');
    mocks.getCurrentTheme
      .mockImplementationOnce(() => {
        throw syncError;
      })
      .mockReturnValue(voidDarkTheme);
    const manager = await createThemeManager();

    await expect(manager.initialize()).rejects.toBe(syncError);
    expect(mocks.logWarn).toHaveBeenCalledWith('Could not sync with ThemeService', syncError);
    expect(mocks.setTheme).toHaveBeenCalledWith('void-dark');

    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(mocks.getCurrentTheme).toHaveBeenCalledTimes(2);
    expect(mocks.on).toHaveBeenCalledTimes(1);
  });

  it('syncs theme events before notifying ThemeManager subscribers', async () => {
    mocks.getCurrentTheme.mockReturnValue(voidDarkTheme);
    const manager = await createThemeManager();
    const listener = vi.fn();
    manager.onThemeChange(listener);
    await manager.initialize();
    const themeServiceListener = mocks.on.mock.calls[0]?.[1] as
      | ((event: ThemeEvent) => void)
      | undefined;
    if (!themeServiceListener) {
      throw new Error('Theme service listener was not registered');
    }

    themeServiceListener({
      type: 'theme:after-change',
      themeId: voidLightTheme.id,
      theme: voidLightTheme,
      previousTheme: voidDarkTheme,
      timestamp: 1,
    });

    expect(mocks.syncTheme).toHaveBeenNthCalledWith(2, voidLightTheme);
    expect(manager.getCurrentThemeId()).toBe('void-light');
    expect(listener).toHaveBeenCalledWith({
      previousThemeId: 'void-dark',
      currentThemeId: 'void-light',
    });
    expect(mocks.syncTheme.mock.invocationCallOrder[1]).toBeLessThan(
      listener.mock.invocationCallOrder[0],
    );
  });

  it('awaits the first sync and subscribes only once across repeated initialization', async () => {
    mocks.getCurrentTheme.mockReturnValue(voidDarkTheme);
    const manager = await createThemeManager();

    const firstInitialization = manager.initialize();
    const concurrentInitialization = manager.initialize();
    await Promise.all([firstInitialization, concurrentInitialization]);
    await manager.initialize();

    expect(mocks.syncTheme).toHaveBeenCalledTimes(1);
    expect(mocks.on).toHaveBeenCalledTimes(1);
  });
});
