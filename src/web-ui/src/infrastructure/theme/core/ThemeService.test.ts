import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ThemeService,
  THEME_SERVICE_DYNAMIC_CSS_VAR_PREFIXES,
  themeService,
} from './ThemeService';
import { builtinThemes, voidLightTheme } from '../presets';
import { SYSTEM_THEME_ID, type ThemeConfig } from '../types';

vi.mock('@/infrastructure/api', () => ({
  configAPI: {
    getConfig: vi.fn(),
    setConfig: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ThemeService flow chat link tokens', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    Object.defineProperty(dom.window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps light theme Flow Chat markdown links browser-blue even with a neutral app accent', async () => {
    const service = new ThemeService();

    await service.applyTheme('void-light');

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--color-accent-500')).toBe('#64748b');
    expect(rootStyle.getPropertyValue('--flowchat-link-color')).toBe('#0969da');
    expect(rootStyle.getPropertyValue('--flowchat-link-hover-color')).toBe('#0550ae');
  });

  it('keeps dark neutral-accent themes on an obvious blue link color', async () => {
    const service = new ThemeService();

    await service.applyTheme('void-slate');

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--color-accent-500')).toBe('#94a3b8');
    expect(rootStyle.getPropertyValue('--flowchat-link-color')).toBe('#60a5fa');
    expect(rootStyle.getPropertyValue('--flowchat-link-hover-color')).toBe('#93c5fd');
  });

  it('tracks system light and dark appearance without changing the user selection', async () => {
    let prefersDark = false;
    let changeListener: (() => void) | null = null;
    const mediaQuery = {
      get matches() {
        return prefersDark;
      },
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        changeListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(dom.window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mediaQuery),
    });
    const service = new ThemeService();

    await service.applyTheme(SYSTEM_THEME_ID);

    expect(service.getCurrentThemeId()).toBe(SYSTEM_THEME_ID);
    expect(service.getResolvedThemeId()).toBe('void-light');
    expect(document.documentElement.dataset.theme).toBe('void-light');
    expect(document.documentElement.dataset.themeType).toBe('light');

    prefersDark = true;
    changeListener?.();
    await vi.waitFor(() => {
      expect(service.getResolvedThemeId()).toBe('void-dark');
    });

    expect(service.getCurrentThemeId()).toBe(SYSTEM_THEME_ID);
    expect(document.documentElement.dataset.theme).toBe('void-dark');
    expect(document.documentElement.dataset.themeType).toBe('dark');

    await service.applyTheme('void-light');
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });
});

describe('ThemeService runtime token whitelist', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    Object.defineProperty(dom.window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('ignores unsupported dynamic token keys from custom themes', async () => {
    const service = new ThemeService();
    const customTheme = JSON.parse(JSON.stringify(voidLightTheme)) as ThemeConfig & {
      colors: ThemeConfig['colors'] & { accent: Record<string, string> };
      effects: ThemeConfig['effects'] & { shadow: Record<string, string> };
      motion: ThemeConfig['motion'] & { duration: Record<string, string> };
      typography: ThemeConfig['typography'] & { size: Record<string, string> };
    };
    customTheme.id = 'custom-unsafe-dynamic-token';
    customTheme.name = 'Custom Unsafe Dynamic Token';
    customTheme.colors.accent.evil = '#ff00ff';
    customTheme.colors.purple = {
      ...customTheme.colors.purple,
      evil: '#ff00ff',
    };
    customTheme.effects.shadow.evil = '0 0 0 999px red';
    customTheme.motion.duration.evil = '999s';
    customTheme.typography.size.evil = '999rem';
    customTheme.typography.font.sans = '"Recovery Sans", ui-sans-serif';
    customTheme.typography.font.mono = '"Recovery Mono", ui-monospace';

    service.registerTheme(customTheme);
    await service.applyTheme(customTheme.id);

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--color-accent-500')).toBe(voidLightTheme.colors.accent[500]);
    expect(rootStyle.getPropertyValue('--shadow-base')).toBe(voidLightTheme.effects.shadow.base);
    expect(rootStyle.getPropertyValue('--motion-base')).toBe(voidLightTheme.motion.duration.base);
    expect(rootStyle.getPropertyValue('--font-size-base')).toBe(voidLightTheme.typography.size.base);
    expect(rootStyle.getPropertyValue('--font-family-sans')).toBe(
      customTheme.typography.font.sans,
    );
    expect(rootStyle.getPropertyValue('--font-sans')).toBe(
      customTheme.typography.font.sans,
    );
    expect(rootStyle.getPropertyValue('--font-family-mono')).toBe(
      customTheme.typography.font.mono,
    );
    expect(rootStyle.getPropertyValue('--font-mono')).toBe(
      customTheme.typography.font.mono,
    );
    expect(rootStyle.getPropertyValue('--color-accent-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--color-purple-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--shadow-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--motion-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--font-size-evil')).toBe('');
  });

  it('keeps built-in themes injecting required CSS variable contract tokens', async () => {
    const contractPath = path.resolve(process.cwd(), '../../scripts/theme-css-var-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      requiredTokenDomains: Array<{
        requiredVars: string[];
        runtimeInjected?: boolean;
      }>;
    };
    const requiredConcreteVars = contract.requiredTokenDomains
      .filter(domain => domain.runtimeInjected !== false)
      .flatMap(domain => domain.requiredVars)
      .filter(name => !name.endsWith('-'));

    for (const theme of builtinThemes) {
      const service = new ThemeService();
      await service.applyTheme(theme.id);

      const rootStyle = document.documentElement.style;
      for (const varName of requiredConcreteVars) {
        expect(rootStyle.getPropertyValue(varName), `${theme.id} should inject ${varName}`).not.toBe('');
      }
      for (const fixedRuntimeVar of [
        '--btn-primary-bg',
        '--window-control-close-dot',
        '--card-bg-default',
        '--color-overlay',
        '--scene-viewport-border-width',
        '--scrollbar-thumb',
        '--font-family-sans',
        '--font-sans',
        '--font-family-mono',
        '--font-mono',
      ]) {
        expect(
          rootStyle.getPropertyValue(fixedRuntimeVar),
          `${theme.id} should keep fixed runtime var ${fixedRuntimeVar}`,
        ).not.toBe('');
      }
      expect(rootStyle.getPropertyValue('--font-family-sans')).toBe(
        theme.typography.font.sans,
      );
      expect(rootStyle.getPropertyValue('--font-sans')).toBe(
        rootStyle.getPropertyValue('--font-family-sans'),
      );
      expect(rootStyle.getPropertyValue('--font-family-mono')).toBe(
        theme.typography.font.mono,
      );
      expect(rootStyle.getPropertyValue('--font-mono')).toBe(
        rootStyle.getPropertyValue('--font-family-mono'),
      );
    }
  });

  it('keeps dynamic runtime prefixes aligned with the CSS variable contract', () => {
    const contractPath = path.resolve(process.cwd(), '../../scripts/theme-css-var-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      allowedDynamicPrefixes: string[];
    };

    expect(contract.allowedDynamicPrefixes).toEqual(
      expect.arrayContaining([...THEME_SERVICE_DYNAMIC_CSS_VAR_PREFIXES]),
    );
  });

  it.each([
    ['sans', undefined, 'MISSING_FONT_FAMILY'],
    ['mono', undefined, 'MISSING_FONT_FAMILY'],
    ['sans', 42, 'INVALID_FONT_FAMILY'],
    ['mono', {}, 'INVALID_FONT_FAMILY'],
    ['sans', '   ', 'EMPTY_FONT_FAMILY'],
    ['mono', '\t', 'EMPTY_FONT_FAMILY'],
  ] as const)(
    'reports an invalid typography.font.%s value without changing theme loading',
    (fontKey, invalidValue, expectedCode) => {
      const service = new ThemeService();
      const invalidTheme = JSON.parse(
        JSON.stringify(voidLightTheme),
      ) as ThemeConfig & {
        typography: {
          font: Record<'sans' | 'mono', unknown>;
        };
      };

      invalidTheme.typography.font[fontKey] = invalidValue;
      const result = service.validateTheme(invalidTheme as ThemeConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: `typography.font.${fontKey}`,
          code: expectedCode,
        }),
      );
    },
  );

  it('accepts custom non-empty sans and mono font stacks', () => {
    const service = new ThemeService();
    const customTheme = JSON.parse(JSON.stringify(voidLightTheme)) as ThemeConfig;
    customTheme.typography.font.sans = '"Custom UI", sans-serif';
    customTheme.typography.font.mono = '"Custom Mono", monospace';

    expect(service.validateTheme(customTheme)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('replays a custom 20px font preference after a theme change', async () => {
    const { FontPreferenceService } = await import(
      '@/infrastructure/font-preference/core/FontPreferenceService'
    );
    const preferenceService = new FontPreferenceService();

    await preferenceService.initialize();
    await preferenceService.setUiSize('custom', 20);
    const replaySpy = vi.spyOn(preferenceService, 'applyPreference');
    replaySpy.mockClear();
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe(
      '20px',
    );

    await themeService.applyTheme('void-dark');

    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe(
      '20px',
    );
    expect(replaySpy).toHaveBeenCalledTimes(1);
    expect(preferenceService.getPreference().uiSize).toEqual({
      level: 'custom',
      customPx: 20,
    });
    expect(document.documentElement.style.getPropertyValue('--font-family-sans')).toBe(
      document.documentElement.style.getPropertyValue('--font-sans'),
    );
  });
});
