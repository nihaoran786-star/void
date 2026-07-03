import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readWidgetThemePayload,
  WIDGET_THEME_PAYLOAD_CONTRACT,
} from './themePayload';

describe('generated widget theme payload contract', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html data-theme="void-light" data-theme-type="light"><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setRootVars(vars: Record<string, string>): void {
    Object.entries(vars).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value);
    });
  }

  it('documents required optional and legacy theme variables', () => {
    expect(WIDGET_THEME_PAYLOAD_CONTRACT.requiredVars).toEqual(
      expect.arrayContaining([
        '--color-bg-primary',
        '--color-text-primary',
        '--color-accent-500',
        '--border-base',
        '--font-sans',
      ]),
    );
    expect(WIDGET_THEME_PAYLOAD_CONTRACT.optionalVars).toEqual(
      expect.arrayContaining([
        '--font-size-sm',
        '--font-weight-semibold',
        '--spacing-5',
        '--element-bg-soft',
      ]),
    );
    expect(WIDGET_THEME_PAYLOAD_CONTRACT.legacyAliases).toMatchObject({
      '--color-border-default': '--border-base',
    });
  });

  it('keeps current canonical keys and backfills known legacy aliases', () => {
    setRootVars({
      '--color-bg-primary': '#ffffff',
      '--color-text-primary': '#111111',
      '--color-accent-500': '#64748b',
      '--border-base': 'rgba(15, 23, 42, 0.12)',
      '--font-sans': 'Inter, sans-serif',
      '--font-size-sm': '13px',
      '--font-weight-semibold': '600',
      '--spacing-5': '20px',
      '--element-bg-soft': 'rgba(15, 23, 42, 0.08)',
    });

    const payload = readWidgetThemePayload();

    expect(payload?.id).toBe('void-light');
    expect(payload?.type).toBe('light');
    expect(payload?.vars['--color-bg-primary']).toBe('#ffffff');
    expect(payload?.vars['--font-size-sm']).toBe('13px');
    expect(payload?.vars['--color-border-default']).toBe('rgba(15, 23, 42, 0.12)');
    expect(payload?.appliedLegacyAliases).toEqual({
      '--color-border-default': '--border-base',
    });
  });

  it('fills missing canonical vars from known legacy aliases without reading app state', () => {
    setRootVars({
      '--color-bg-primary': '#101014',
      '--color-text-primary': '#f8fafc',
      '--color-accent-500': '#60a5fa',
      '--color-border-default': 'rgba(255, 255, 255, 0.16)',
      '--font-sans': 'Inter, sans-serif',
    });

    const payload = readWidgetThemePayload();

    expect(payload?.vars['--border-base']).toBe('rgba(255, 255, 255, 0.16)');
    expect(payload?.vars['--color-border-default']).toBe('rgba(255, 255, 255, 0.16)');
    expect(payload?.appliedLegacyAliases).toEqual({
      '--color-border-default': '--border-base',
    });
  });

  it('reports payload source status and missing required vars explicitly', () => {
    setRootVars({
      '--color-bg-primary': '#101014',
      '--color-text-primary': '#f8fafc',
      '--color-accent-500': '#60a5fa',
      '--font-sans': 'Inter, sans-serif',
    });

    const payload = readWidgetThemePayload();

    expect(payload?.contractVersion).toBe(1);
    expect(payload?.source).toBe('host-css-vars');
    expect(payload?.status).toBe('partial');
    expect(payload?.missingRequiredVars).toEqual(['--border-base']);
    expect(payload?.error).toMatchObject({
      code: 'missing_required_vars',
    });
  });

  it('does not leak unknown host CSS variables into the widget payload', () => {
    setRootVars({
      '--color-bg-primary': '#ffffff',
      '--color-text-primary': '#111111',
      '--color-accent-500': '#64748b',
      '--border-base': 'rgba(15, 23, 42, 0.12)',
      '--font-sans': 'Inter, sans-serif',
      '--color-accent-evil': '#ff00ff',
      '--unknown-widget-token': 'leak',
    });

    const payload = readWidgetThemePayload();

    expect(payload?.status).toBe('ready');
    expect(payload?.vars['--color-accent-evil']).toBeUndefined();
    expect(payload?.vars['--unknown-widget-token']).toBeUndefined();
  });

  it('reads ready payloads from light and dark host theme samples', () => {
    const samples = [
      {
        id: 'void-light',
        type: 'light',
        bg: '#ffffff',
        text: '#111111',
        accent: '#64748b',
        border: 'rgba(15, 23, 42, 0.12)',
      },
      {
        id: 'void-dark',
        type: 'dark',
        bg: '#101014',
        text: '#f8fafc',
        accent: '#60a5fa',
        border: 'rgba(255, 255, 255, 0.16)',
      },
    ];

    for (const sample of samples) {
      document.documentElement.setAttribute('data-theme', sample.id);
      document.documentElement.setAttribute('data-theme-type', sample.type);
      document.documentElement.removeAttribute('style');
      setRootVars({
        '--color-bg-primary': sample.bg,
        '--color-text-primary': sample.text,
        '--color-accent-500': sample.accent,
        '--border-base': sample.border,
        '--font-sans': 'Inter, sans-serif',
      });

      const payload = readWidgetThemePayload();

      expect(payload?.id).toBe(sample.id);
      expect(payload?.type).toBe(sample.type);
      expect(payload?.status).toBe('ready');
      expect(payload?.source).toBe('host-css-vars');
      expect(payload?.missingRequiredVars).toEqual([]);
      expect(payload?.error).toBeUndefined();
    }
  });
});
