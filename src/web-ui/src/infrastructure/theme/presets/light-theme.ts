
import { ThemeConfig } from '../types';
import { BUILTIN_THEME_UI_FONT_FAMILY } from './typography';

export const voidLightTheme: ThemeConfig = {

  id: 'void-light',
  name: 'Light',
  type: 'light',
  description: 'Light theme - Porcelain Air warm surfaces, calm cobalt primary actions',
  author: 'void Team',
  version: '2.4.0',

  layout: {
    sceneViewportBorder: false,
  },

  // Porcelain Air light palette (docs/design/porcelain-graphite-design-system.md §3).
  colors: {
    background: {
      primary: '#F6F4F1',          // porcelain-50
      secondary: '#FBFAF8',        // porcelain-25
      tertiary: '#EFEEEB',         // porcelain-100
      quaternary: '#E2E0DC',       // porcelain-200
      elevated: '#FFFDFC',         // porcelain-0
      workbench: '#F2F0EC',
      scene: '#FBFAF8',            // porcelain-25
      tooltip: 'rgba(255, 253, 252, 0.98)',
    },

    // Soft graphite text; never pure black or washed-out gray.
    text: {
      primary: '#20231F',          // graphite-900
      secondary: '#4D514C',        // graphite-700
      muted: '#70746E',            // graphite-500; AA-safe on porcelain surfaces
      disabled: '#939DA6',
    },

    // Calm cobalt: focus, selection, and the single primary action per region.
    accent: {
      50: 'rgba(76, 134, 247, 0.05)',
      100: 'rgba(76, 134, 247, 0.09)',
      200: 'rgba(76, 134, 247, 0.14)',
      300: 'rgba(76, 134, 247, 0.22)',
      400: 'rgba(76, 134, 247, 0.34)',
      500: '#4C86F7',              // cobalt-500
      600: '#2F6FE4',              // cobalt-600
      700: 'rgba(47, 111, 228, 0.85)',
      800: 'rgba(37, 89, 184, 0.92)',
    },

    // Lilac: small collaboration or creative icon cue.
    purple: {
      50: 'rgba(130, 106, 194, 0.04)',
      100: 'rgba(130, 106, 194, 0.08)',
      200: 'rgba(130, 106, 194, 0.14)',
      300: 'rgba(130, 106, 194, 0.22)',
      400: 'rgba(130, 106, 194, 0.36)',
      500: '#826AC2',              // lilac-500
      600: '#6C549F',
      700: 'rgba(108, 84, 159, 0.8)',
      800: 'rgba(108, 84, 159, 0.9)',
    },

    // Status pastels are small orientation cues, not large decorative surfaces.
    semantic: {
      success: '#287A57',
      successBg: '#EDF8F2',
      successBorder: '#C3E6D2',

      warning: '#85591F',
      warningBg: '#FFF7EA',
      warningBorder: '#EBD3AA',

      error: '#923F3F',
      errorBg: '#FFF2F1',
      errorBorder: '#E9C2C0',

      info: '#2559B8',
      infoBg: '#EEF5FF',
      infoBorder: '#C9DCFF',

      highlight: '#C38A32',        // amber-500
      highlightBg: 'rgba(195, 138, 50, 0.12)',
    },

    // Warm hairline borders derived from the porcelain/graphite ladder.
    border: {
      subtle: '#ECEAE6',
      base: '#E2E0DC',             // porcelain-200
      medium: '#D1CEC8',           // porcelain-300
      strong: '#C6C3BC',
      prominent: '#B5B2AA',
    },

    // Neutral element overlays use the graphite-900 base at low alpha.
    element: {
      subtle: 'rgba(32, 35, 31, 0.045)',
      soft: 'rgba(32, 35, 31, 0.06)',
      base: 'rgba(32, 35, 31, 0.085)',
      medium: 'rgba(32, 35, 31, 0.12)',
      strong: 'rgba(32, 35, 31, 0.16)',
      elevated: 'rgba(255, 253, 252, 0.94)',
    },

    git: {
      branch: 'rgb(37, 89, 184)',
      branchBg: 'rgba(37, 89, 184, 0.08)',
      changes: 'rgb(133, 89, 31)',
      changesBg: 'rgba(133, 89, 31, 0.08)',
      added: 'rgb(40, 122, 87)',
      addedBg: 'rgba(40, 122, 87, 0.08)',
      deleted: 'rgb(146, 63, 63)',
      deletedBg: 'rgba(146, 63, 63, 0.08)',
      staged: 'rgb(40, 122, 87)',
      stagedBg: 'rgba(40, 122, 87, 0.08)',
    },
  },


  effects: {
    shadow: {
      // Soft graphite elevation; no glow or decorative shadow on normal content.
      xs: '0 1px 2px rgba(32, 35, 31, 0.05)',
      sm: '0 2px 6px rgba(32, 35, 31, 0.06)',
      base: '0 4px 10px rgba(32, 35, 31, 0.07)',
      lg: '0 8px 18px rgba(32, 35, 31, 0.09)',
      xl: '0 12px 30px rgba(32, 35, 31, 0.11)',
      '2xl': '0 16px 36px rgba(32, 35, 31, 0.13)',
    },

    glow: {
      blue: '0 8px 24px rgba(76, 134, 247, 0.10), 0 4px 12px rgba(76, 134, 247, 0.06), 0 2px 6px rgba(32, 35, 31, 0.04)',
      purple: '0 8px 24px rgba(130, 106, 194, 0.10), 0 4px 12px rgba(130, 106, 194, 0.06), 0 2px 6px rgba(32, 35, 31, 0.04)',
      mixed: '0 8px 24px rgba(76, 134, 247, 0.08), 0 4px 12px rgba(130, 106, 194, 0.06), 0 2px 6px rgba(32, 35, 31, 0.04)',
    },

    blur: {
      subtle: 'blur(4px) saturate(1.02)',
      base: 'blur(8px) saturate(1.05)',
      medium: 'blur(12px) saturate(1.08)',
      strong: 'blur(16px) saturate(1.10) brightness(1.02)',
      intense: 'blur(20px) saturate(1.12) brightness(1.03)',
    },

    radius: {
      sm: '6px',
      base: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '20px',
      full: '9999px',
    },

    spacing: {
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      10: '40px',
      12: '48px',
      16: '64px',
    },

    opacity: {
      disabled: 0.55,
      hover: 0.75,
      focus: 0.9,
      overlay: 0.35,
    },
  },

  motion: {
    duration: {
      instant: '0.1s',
      fast: '0.15s',
      base: '0.3s',
      slow: '0.6s',
      lazy: '1s',
    },

    easing: {
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
      accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },


  typography: {
    font: {
      sans: BUILTIN_THEME_UI_FONT_FAMILY,
      mono: "'JetBrains Mono', 'FiraCode', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, 'Cascadia Mono', 'Cascadia Code', Consolas, 'Liberation Mono', 'Courier New', monospace",
    },

    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },

    size: {
      xs: '12px',
      sm: '13px',
      base: '14px',
      lg: '15px',
      xl: '16px',
      '2xl': '18px',
      '3xl': '22px',
      '4xl': '26px',
      '5xl': '32px',
    },

    lineHeight: {
      tight: 1.2,
      base: 1.5,
      relaxed: 1.6,
    },
  },


  components: {

    windowControls: {
      minimize: {
        dot: 'rgba(77, 81, 76, 0.5)',
        dotShadow: '0 0 4px rgba(32, 35, 31, 0.12)',
        hoverBg: 'rgba(32, 35, 31, 0.06)',
        hoverColor: '#4D514C',
        hoverBorder: 'rgba(77, 81, 76, 0.28)',
        hoverShadow: '0 2px 8px rgba(32, 35, 31, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      maximize: {
        dot: 'rgba(77, 81, 76, 0.5)',
        dotShadow: '0 0 4px rgba(32, 35, 31, 0.12)',
        hoverBg: 'rgba(32, 35, 31, 0.06)',
        hoverColor: '#4D514C',
        hoverBorder: 'rgba(77, 81, 76, 0.28)',
        hoverShadow: '0 2px 8px rgba(32, 35, 31, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      close: {
        dot: 'rgba(146, 63, 63, 0.55)',
        dotShadow: '0 0 4px rgba(146, 63, 63, 0.20)',
        hoverBg: 'rgba(146, 63, 63, 0.12)',
        hoverColor: '#923F3F',
        hoverBorder: 'rgba(146, 63, 63, 0.25)',
        hoverShadow: '0 2px 8px rgba(146, 63, 63, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      common: {
        defaultColor: 'rgba(32, 35, 31, 0.95)',
        defaultDot: 'rgba(77, 81, 76, 0.28)',
        disabledDot: 'rgba(77, 81, 76, 0.15)',
        flowGradient: 'linear-gradient(90deg, transparent, rgba(77, 81, 76, 0.06), rgba(77, 81, 76, 0.10), rgba(77, 81, 76, 0.06), transparent)',
      },
    },

    button: {
      // Secondary button: raised porcelain surface + base border.
      default: {
        background: '#FFFDFC',
        color: '#4D514C',
        border: '#E2E0DC',
        shadow: 'none',
      },
      hover: {
        background: '#F6F4F1',
        color: '#20231F',
        border: '#D1CEC8',
        shadow: 'none',
        transform: 'none',
      },
      active: {
        background: '#EFEEEB',
        color: '#20231F',
        border: '#D1CEC8',
        shadow: 'none',
        transform: 'none',
      },

      // One calm cobalt primary action per region; no severe black treatment.
      primary: {
        default: {
          background: '#4C86F7',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: '#2F6FE4',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: '#2559B8',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },

      ghost: {
        default: {
          background: 'transparent',
          color: '#4D514C',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: 'rgba(32, 35, 31, 0.05)',
          color: '#20231F',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: 'rgba(32, 35, 31, 0.08)',
          color: '#20231F',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },
    },
  },


  monaco: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '737771', fontStyle: 'italic' },
      { token: 'keyword', foreground: '826AC2' },
      { token: 'string', foreground: '479A73' },
      { token: 'number', foreground: 'C38A32' },
      { token: 'type', foreground: '4D514C' },
      { token: 'class', foreground: '4D514C' },
      { token: 'function', foreground: '2559B8' },
      { token: 'variable', foreground: '4D514C' },
      { token: 'constant', foreground: '85591F' },
      { token: 'operator', foreground: '826AC2' },
      { token: 'tag', foreground: '4D514C' },
      { token: 'attribute.name', foreground: '2559B8' },
      { token: 'attribute.value', foreground: '479A73' },
    ],
    colors: {
      background: '#FBFAF8',
      foreground: '#20231F',
      lineHighlight: '#F6F4F1',
      selection: 'rgba(76, 134, 247, 0.18)',
      cursor: '#20231F',

      'editor.selectionBackground': 'rgba(76, 134, 247, 0.18)',
      'editor.selectionForeground': '#20231F',
      'editor.inactiveSelectionBackground': 'rgba(76, 134, 247, 0.10)',
      'editor.selectionHighlightBackground': 'rgba(76, 134, 247, 0.12)',
      'editor.selectionHighlightBorder': 'rgba(76, 134, 247, 0.24)',
      'editorCursor.foreground': '#20231F',

      'editor.wordHighlightBackground': 'rgba(32, 35, 31, 0.07)',
      'editor.wordHighlightStrongBackground': 'rgba(32, 35, 31, 0.11)',
    },
  },
};
