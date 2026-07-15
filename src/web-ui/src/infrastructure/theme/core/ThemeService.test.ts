import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService, THEME_SERVICE_DYNAMIC_CSS_VAR_PREFIXES } from './ThemeService';
import { builtinThemes, voidLightTheme } from '../presets';
import type { ThemeConfig } from '../types';

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

    service.registerTheme(customTheme);
    await service.applyTheme(customTheme.id);

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--color-accent-500')).toBe(voidLightTheme.colors.accent[500]);
    expect(rootStyle.getPropertyValue('--shadow-base')).toBe(voidLightTheme.effects.shadow.base);
    expect(rootStyle.getPropertyValue('--motion-base')).toBe(voidLightTheme.motion.duration.base);
    expect(rootStyle.getPropertyValue('--font-size-base')).toBe(voidLightTheme.typography.size.base);
    expect(rootStyle.getPropertyValue('--color-accent-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--color-purple-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--shadow-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--motion-evil')).toBe('');
    expect(rootStyle.getPropertyValue('--font-size-evil')).toBe('');
  });

  it('keeps built-in themes injecting required CSS variable contract tokens', async () => {
    const contractPath = path.resolve(process.cwd(), '../../scripts/theme-css-var-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
      requiredTokenDomains: Array<{ requiredVars: string[] }>;
    };
    const requiredConcreteVars = contract.requiredTokenDomains
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
        '--font-sans',
        '--font-mono',
      ]) {
        expect(
          rootStyle.getPropertyValue(fixedRuntimeVar),
          `${theme.id} should keep fixed runtime var ${fixedRuntimeVar}`,
        ).not.toBe('');
      }
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
});
