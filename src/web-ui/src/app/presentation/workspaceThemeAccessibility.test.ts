import { describe, expect, it } from 'vitest';
import {
  builtinThemes,
  voidDarkTheme,
  voidLightTheme,
} from '@/infrastructure/theme/presets';
import type { ThemeConfig } from '@/infrastructure/theme/types';

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

const STATUS_TEXT_WEIGHT = 0.6;
const DEFAULT_MUTED_TEXT_WEIGHT = 0.85;
const COMPOSER_BORDER_TEXT_WEIGHT = 0.75;

function mutedTextWeight(theme: ThemeConfig): number {
  if (theme.id === 'void-midnight') return 0.25;
  if (theme.id === 'void-tokyo-night') return 0.75;
  return DEFAULT_MUTED_TEXT_WEIGHT;
}

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) {
    return [
      Number.parseInt(hex[1], 16),
      Number.parseInt(hex[2], 16),
      Number.parseInt(hex[3], 16),
      1,
    ];
  }

  const functional = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!functional) {
    throw new Error(`Unsupported theme color: ${value}`);
  }
  const channels = functional[1].split(',').map(channel => Number(channel.trim()));
  return [
    channels[0],
    channels[1],
    channels[2],
    channels[3] ?? 1,
  ];
}

function composite(foreground: Rgba, background: Rgba): Rgb {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  return [0, 1, 2].map(index => (
    (
      foreground[index] * foreground[3]
      + background[index] * background[3] * (1 - foreground[3])
    ) / alpha
  )) as Rgb;
}

function mix(first: Rgba, second: Rgba, firstWeight: number): Rgb {
  return [0, 1, 2].map(index => (
    first[index] * firstWeight + second[index] * (1 - firstWeight)
  )) as Rgb;
}

function luminance(color: Rgb): number {
  const channels = color.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0]
    + 0.7152 * channels[1]
    + 0.0722 * channels[2]
  );
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function statusFixture(theme: ThemeConfig) {
  const semantic = theme.colors.semantic;
  return [
    ['loading', semantic.info, semantic.infoBg],
    ['success', semantic.success, semantic.successBg],
    ['warning', semantic.warning, semantic.warningBg],
    ['error', semantic.error, semantic.errorBg],
  ] as const;
}

describe.each(builtinThemes)(
  'minimal workspace $id text fixture',
  theme => {
    it('keeps scoped muted metadata AA-readable on workspace surfaces', () => {
      const mutedText = mix(
        parseColor(theme.colors.text.muted),
        parseColor(theme.colors.text.secondary),
        mutedTextWeight(theme),
      );
      const surfaces = [
        theme.colors.background.primary,
        theme.colors.background.secondary,
        theme.colors.background.scene,
        theme.colors.background.elevated,
      ];

      for (const surface of surfaces) {
        expect(
          contrastRatio(mutedText, parseColor(surface).slice(0, 3) as Rgb),
          `${theme.id} scoped muted text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('keeps the scoped child-agent composer boundary perceivable at rest', () => {
      const composerSurface = parseColor(theme.colors.background.secondary);
      const mutedText = mix(
        parseColor(theme.colors.text.muted),
        parseColor(theme.colors.text.secondary),
        mutedTextWeight(theme),
      );
      const border = mix(
        [...mutedText, 1],
        composerSurface,
        COMPOSER_BORDER_TEXT_WEIGHT,
      );

      expect(
        contrastRatio(
          border,
          composerSurface.slice(0, 3) as Rgb,
        ),
        `${theme.id} child-agent composer boundary`,
      ).toBeGreaterThanOrEqual(3);
    });
  },
);

describe.each([
  ['light', voidLightTheme],
  ['dark', voidDarkTheme],
] as const)('minimal workspace %s semantic-state fixture', (_name, theme) => {
  it('keeps status text AA-readable across the workspace surfaces', () => {
    const primaryText = parseColor(theme.colors.text.primary);
    const surfaces = [
      theme.colors.background.primary,
      theme.colors.background.secondary,
      theme.colors.background.scene,
      theme.colors.background.elevated,
    ];

    for (const [state, foreground, background] of statusFixture(theme)) {
      const mixedForeground = mix(
        parseColor(foreground),
        primaryText,
        STATUS_TEXT_WEIGHT,
      );
      for (const surface of surfaces) {
        const compositedBackground = composite(
          parseColor(background),
          parseColor(surface),
        );
        expect(
          contrastRatio(mixedForeground, compositedBackground),
          `${theme.id} ${state} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps hover, selected, focus, disabled, and loading states distinct', () => {
    const fixture = {
      hover: theme.colors.element.base,
      selected: theme.colors.element.medium,
      focus: theme.colors.accent[600],
      disabled: theme.colors.text.disabled,
      loading: theme.colors.semantic.info,
    };

    expect(fixture.hover).not.toBe(fixture.selected);
    expect(fixture.focus).not.toBe(theme.colors.text.primary);
    expect(fixture.disabled).not.toBe(theme.colors.text.primary);
    expect(fixture.loading).not.toBe(theme.colors.semantic.success);
    expect(new Set(Object.values(fixture))).toHaveLength(5);
  });

  it('keeps the scoped focus ring above the non-text 3:1 threshold', () => {
    const activeSurface = composite(
      parseColor(theme.colors.element.medium),
      parseColor(theme.colors.background.scene),
    );
    const ring = parseColor(theme.colors.accent[600]).slice(0, 3) as Rgb;

    expect(contrastRatio(ring, activeSurface)).toBeGreaterThanOrEqual(3);
  });
});
