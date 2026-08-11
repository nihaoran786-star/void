
import { ThemeConfig } from '../types';
import { BUILTIN_THEME_UI_FONT_FAMILY } from './typography';

export const voidLightTheme: ThemeConfig = {

  id: 'void-light',
  name: 'Light',
  type: 'light',
  description: 'Light theme - Cool White tech surfaces, pulse blue primary actions',
  author: 'void Team',
  version: '2.6.0',

  layout: {
    sceneViewportBorder: false,
  },

  // Cool White light palette: quiet cool-gray surfaces, one pulse-blue signal.
  colors: {
    background: {
      primary: '#F4F6F9',          // cool-50
      secondary: '#FAFBFD',        // cool-25
      tertiary: '#EDF0F4',         // cool-100
      quaternary: '#E2E6EC',       // cool-200
      elevated: '#FFFFFF',         // cool-0
      workbench: '#EEF1F5',
      scene: '#FAFBFD',            // cool-25
      tooltip: 'rgba(255, 255, 255, 0.98)',
    },

    // Cool ink text: never pure black, every meaningful role stays above AA
    // on the cool-white surfaces.
    text: {
      primary: '#14171D',          // cool ink
      secondary: '#3A3F49',        // slate-700
      muted: '#6B7280',            // slate-500; AA-safe on cool surfaces
      disabled: '#9AA3AF',
    },

    // Pulse blue: focus, selection, and the single primary action per region.
    accent: {
      50: 'rgba(37, 99, 235, 0.05)',
      100: 'rgba(37, 99, 235, 0.09)',
      200: 'rgba(37, 99, 235, 0.14)',
      300: 'rgba(37, 99, 235, 0.22)',
      400: 'rgba(37, 99, 235, 0.34)',
      500: '#2563EB',              // pulse-500
      600: '#1D4ED8',              // pulse-600
      700: 'rgba(29, 78, 216, 0.85)',
      800: 'rgba(30, 64, 175, 0.92)',
    },

    // Ultraviolet: small collaboration or creative icon cue.
    purple: {
      50: 'rgba(124, 58, 237, 0.04)',
      100: 'rgba(124, 58, 237, 0.08)',
      200: 'rgba(124, 58, 237, 0.14)',
      300: 'rgba(124, 58, 237, 0.22)',
      400: 'rgba(124, 58, 237, 0.36)',
      500: '#7C3AED',              // ultraviolet-500
      600: '#6D28D9',
      700: 'rgba(109, 40, 217, 0.8)',
      800: 'rgba(109, 40, 217, 0.9)',
    },

    // Status cues are small orientation signals, not large decorative surfaces.
    semantic: {
      success: '#047857',
      successBg: '#ECFDF5',
      successBorder: '#A7F3D0',

      warning: '#B45309',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',

      error: '#DC2626',
      errorBg: '#FEF2F2',
      errorBorder: '#FECACA',

      info: '#475569',
      infoBg: '#F1F5F9',
      infoBorder: '#CBD5E1',

      highlight: '#D97706',        // amber-600
      highlightBg: 'rgba(217, 119, 6, 0.12)',
    },

    // Cool hairline borders derived from the cool-white ladder.
    border: {
      subtle: '#E9EDF2',
      base: '#E2E6EC',             // cool-200
      medium: '#D3D9E1',           // cool-300
      strong: '#C2C9D3',
      prominent: '#AEB7C2',
    },

    // Neutral element overlays use the cool ink base at low alpha.
    element: {
      subtle: 'rgba(18, 24, 38, 0.045)',
      soft: 'rgba(18, 24, 38, 0.06)',
      base: 'rgba(18, 24, 38, 0.085)',
      medium: 'rgba(18, 24, 38, 0.12)',
      strong: 'rgba(18, 24, 38, 0.16)',
      elevated: 'rgba(255, 255, 255, 0.94)',
    },

    git: {
      branch: 'rgb(29, 78, 216)',
      branchBg: 'rgba(29, 78, 216, 0.08)',
      changes: 'rgb(180, 83, 9)',
      changesBg: 'rgba(180, 83, 9, 0.08)',
      added: 'rgb(4, 120, 87)',
      addedBg: 'rgba(4, 120, 87, 0.08)',
      deleted: 'rgb(220, 38, 38)',
      deletedBg: 'rgba(220, 38, 38, 0.08)',
      staged: 'rgb(4, 120, 87)',
      stagedBg: 'rgba(4, 120, 87, 0.08)',
    },
  },


  effects: {
    shadow: {
      // Cool ink elevation; no glow or decorative shadow on normal content.
      xs: '0 1px 2px rgba(18, 24, 38, 0.05)',
      sm: '0 2px 6px rgba(18, 24, 38, 0.06)',
      base: '0 4px 10px rgba(18, 24, 38, 0.07)',
      lg: '0 8px 18px rgba(18, 24, 38, 0.09)',
      xl: '0 12px 30px rgba(18, 24, 38, 0.11)',
      '2xl': '0 16px 36px rgba(18, 24, 38, 0.13)',
    },

    glow: {
      blue: '0 8px 24px rgba(37, 99, 235, 0.10), 0 4px 12px rgba(37, 99, 235, 0.06), 0 2px 6px rgba(18, 24, 38, 0.04)',
      purple: '0 8px 24px rgba(124, 58, 237, 0.10), 0 4px 12px rgba(124, 58, 237, 0.06), 0 2px 6px rgba(18, 24, 38, 0.04)',
      mixed: '0 8px 24px rgba(37, 99, 235, 0.08), 0 4px 12px rgba(124, 58, 237, 0.06), 0 2px 6px rgba(18, 24, 38, 0.04)',
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
        dot: 'rgba(58, 63, 73, 0.5)',
        dotShadow: '0 0 4px rgba(18, 24, 38, 0.12)',
        hoverBg: 'rgba(18, 24, 38, 0.06)',
        hoverColor: '#3A3F49',
        hoverBorder: 'rgba(58, 63, 73, 0.28)',
        hoverShadow: '0 2px 8px rgba(18, 24, 38, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      maximize: {
        dot: 'rgba(58, 63, 73, 0.5)',
        dotShadow: '0 0 4px rgba(18, 24, 38, 0.12)',
        hoverBg: 'rgba(18, 24, 38, 0.06)',
        hoverColor: '#3A3F49',
        hoverBorder: 'rgba(58, 63, 73, 0.28)',
        hoverShadow: '0 2px 8px rgba(18, 24, 38, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      close: {
        dot: 'rgba(220, 38, 38, 0.55)',
        dotShadow: '0 0 4px rgba(220, 38, 38, 0.20)',
        hoverBg: 'rgba(220, 38, 38, 0.12)',
        hoverColor: '#DC2626',
        hoverBorder: 'rgba(220, 38, 38, 0.25)',
        hoverShadow: '0 2px 8px rgba(220, 38, 38, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      common: {
        defaultColor: 'rgba(18, 24, 38, 0.95)',
        defaultDot: 'rgba(58, 63, 73, 0.28)',
        disabledDot: 'rgba(58, 63, 73, 0.15)',
        flowGradient: 'linear-gradient(90deg, transparent, rgba(58, 63, 73, 0.06), rgba(58, 63, 73, 0.10), rgba(58, 63, 73, 0.06), transparent)',
      },
    },

    button: {
      // Secondary button: raised cool-white surface + base border.
      default: {
        background: '#FFFFFF',
        color: '#3A3F49',
        border: '#E2E6EC',
        shadow: 'none',
      },
      hover: {
        background: '#F4F6F9',
        color: '#14171D',
        border: '#D3D9E1',
        shadow: 'none',
        transform: 'none',
      },
      active: {
        background: '#EDF0F4',
        color: '#14171D',
        border: '#D3D9E1',
        shadow: 'none',
        transform: 'none',
      },

      // One pulse-blue primary action per region; no severe black treatment.
      primary: {
        default: {
          background: '#2563EB',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: '#1D4ED8',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: '#1E40AF',
          color: '#ffffff',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },

      ghost: {
        default: {
          background: 'transparent',
          color: '#3A3F49',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: 'rgba(18, 24, 38, 0.05)',
          color: '#14171D',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: 'rgba(18, 24, 38, 0.08)',
          color: '#14171D',
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
      { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7C3AED' },
      { token: 'string', foreground: '047857' },
      { token: 'number', foreground: 'B45309' },
      { token: 'type', foreground: '3A3F49' },
      { token: 'class', foreground: '3A3F49' },
      { token: 'function', foreground: '1D4ED8' },
      { token: 'variable', foreground: '3A3F49' },
      { token: 'constant', foreground: 'B45309' },
      { token: 'operator', foreground: '7C3AED' },
      { token: 'tag', foreground: '3A3F49' },
      { token: 'attribute.name', foreground: '1D4ED8' },
      { token: 'attribute.value', foreground: '047857' },
    ],
    colors: {
      background: '#FAFBFD',
      foreground: '#14171D',
      lineHighlight: '#F4F6F9',
      selection: 'rgba(37, 99, 235, 0.18)',
      cursor: '#14171D',

      'editor.selectionBackground': 'rgba(37, 99, 235, 0.18)',
      'editor.selectionForeground': '#14171D',
      'editor.inactiveSelectionBackground': 'rgba(37, 99, 235, 0.10)',
      'editor.selectionHighlightBackground': 'rgba(37, 99, 235, 0.12)',
      'editor.selectionHighlightBorder': 'rgba(37, 99, 235, 0.24)',
      'editorCursor.foreground': '#14171D',

      'editor.wordHighlightBackground': 'rgba(18, 24, 38, 0.07)',
      'editor.wordHighlightStrongBackground': 'rgba(18, 24, 38, 0.11)',
    },
  },
};
