
import { ThemeConfig } from '../types';
import { BUILTIN_THEME_UI_FONT_FAMILY } from './typography';

export const voidDarkTheme: ThemeConfig = {

  id: 'void-dark',
  name: 'Dark',
  type: 'dark',
  description: 'Deep Space dark theme - quiet graphite-black surfaces, one cyan signal',
  author: 'void Team',
  version: '2.2.0',


  colors: {
    background: {
      primary: '#0A0C11',          // deep-space-900
      secondary: '#10131B',        // deep-space-800
      tertiary: '#0A0C11',
      quaternary: '#161A24',
      elevated: '#141824',
      workbench: '#0A0C11',
      scene: '#0D1017',
      tooltip: 'rgba(19, 23, 32, 0.96)',
    },

    text: {
      primary: '#F0F3F8',
      // Support text carried most of the transcript (tool summaries, counts,
      // timestamps) while sitting near the AA floor. Both support roles are
      // lifted one step so secondary reads as text rather than as decoration.
      secondary: '#C7CCD8',
      muted: '#98A1B2',
      disabled: '#5A6273',
    },

    // Cyan: the single "live" signal — focus, selection, running states.
    accent: {
      50: 'rgba(34, 211, 238, 0.04)',
      100: 'rgba(34, 211, 238, 0.08)',
      200: 'rgba(34, 211, 238, 0.15)',
      300: 'rgba(34, 211, 238, 0.25)',
      400: 'rgba(34, 211, 238, 0.4)',
      500: '#22D3EE',
      600: '#67E8F9',
      700: 'rgba(103, 232, 249, 0.8)',
      800: 'rgba(103, 232, 249, 0.9)',
    },

    purple: {
      50: 'rgba(139, 92, 246, 0.04)',
      100: 'rgba(139, 92, 246, 0.08)',
      200: 'rgba(139, 92, 246, 0.15)',
      300: 'rgba(139, 92, 246, 0.25)',
      400: 'rgba(139, 92, 246, 0.4)',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: 'rgba(124, 58, 237, 0.8)',
      800: 'rgba(124, 58, 237, 0.9)',
    },

    semantic: {
      success: '#34d399',
      successBg: 'rgba(52, 211, 153, 0.1)',
      successBorder: 'rgba(52, 211, 153, 0.3)',

      warning: '#f59e0b',
      warningBg: 'rgba(245, 158, 11, 0.1)',
      warningBorder: 'rgba(245, 158, 11, 0.3)',

      error: '#ef4444',
      errorBg: 'rgba(239, 68, 68, 0.1)',
      errorBorder: 'rgba(239, 68, 68, 0.3)',

      info: '#a1a1aa',
      infoBg: 'rgba(255, 255, 255, 0.08)',
      infoBorder: 'rgba(255, 255, 255, 0.22)',


      highlight: '#a8a8a8',
      highlightBg: 'rgba(255, 255, 255, 0.1)',
    },

    border: {
      subtle: 'rgba(255, 255, 255, 0.08)',
      base: 'rgba(255, 255, 255, 0.14)',
      medium: 'rgba(255, 255, 255, 0.20)',
      strong: 'rgba(255, 255, 255, 0.28)',
      prominent: 'rgba(255, 255, 255, 0.36)',
    },

    element: {
      subtle: 'rgba(255, 255, 255, 0.05)',
      soft: 'rgba(255, 255, 255, 0.07)',
      base: 'rgba(255, 255, 255, 0.095)',
      medium: 'rgba(255, 255, 255, 0.125)',
      strong: 'rgba(255, 255, 255, 0.155)',
      elevated: 'rgba(255, 255, 255, 0.19)',
    },

    git: {
      branch: 'rgb(34, 211, 238)',
      branchBg: 'rgba(34, 211, 238, 0.08)',
      changes: 'rgb(245, 158, 11)',
      changesBg: 'rgba(245, 158, 11, 0.1)',
      added: 'rgb(34, 197, 94)',
      addedBg: 'rgba(34, 197, 94, 0.1)',
      deleted: 'rgb(239, 68, 68)',
      deletedBg: 'rgba(239, 68, 68, 0.1)',
      staged: 'rgb(34, 197, 94)',
      stagedBg: 'rgba(34, 197, 94, 0.1)',
    },

    scrollbar: {
      thumb: 'rgba(255, 255, 255, 0.15)',
      thumbHover: 'rgba(255, 255, 255, 0.28)',
    },
  },


  effects: {
    shadow: {
      xs: '0 1px 2px rgba(0, 0, 0, 0.9)',
      sm: '0 2px 4px rgba(0, 0, 0, 0.8)',
      base: '0 4px 8px rgba(0, 0, 0, 0.7)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.6)',
      xl: '0 12px 24px rgba(0, 0, 0, 0.5)',
      '2xl': '0 16px 32px rgba(0, 0, 0, 0.4)',
    },

    glow: {
      blue: '0 12px 32px rgba(34, 211, 238, 0.20), 0 6px 16px rgba(34, 211, 238, 0.12), 0 3px 8px rgba(0, 0, 0, 0.12)',
      purple: '0 12px 32px rgba(139, 92, 246, 0.22), 0 6px 16px rgba(124, 58, 237, 0.14), 0 3px 8px rgba(0, 0, 0, 0.12)',
      mixed: '0 12px 32px rgba(34, 211, 238, 0.10), 0 6px 16px rgba(139, 92, 246, 0.12), 0 3px 8px rgba(0, 0, 0, 0.12)',
    },

    blur: {
      subtle: 'blur(4px) saturate(1.05)',
      base: 'blur(8px) saturate(1.1)',
      medium: 'blur(12px) saturate(1.2)',
      strong: 'blur(16px) saturate(1.3) brightness(1.1)',
      intense: 'blur(20px) saturate(1.4) brightness(1.15)',
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
      disabled: 0.6,
      hover: 0.8,
      focus: 0.9,
      overlay: 0.4,
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
        dot: 'rgba(255, 255, 255, 0.38)',
        dotShadow: '0 0 4px rgba(0, 0, 0, 0.35)',
        hoverBg: 'rgba(255, 255, 255, 0.1)',
        hoverColor: '#e4e4e4',
        hoverBorder: 'rgba(255, 255, 255, 0.16)',
        hoverShadow: '0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      },
      maximize: {
        dot: 'rgba(255, 255, 255, 0.38)',
        dotShadow: '0 0 4px rgba(0, 0, 0, 0.35)',
        hoverBg: 'rgba(255, 255, 255, 0.1)',
        hoverColor: '#e4e4e4',
        hoverBorder: 'rgba(255, 255, 255, 0.16)',
        hoverShadow: '0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      },
      close: {
        dot: 'rgba(239, 68, 68, 0.45)',
        dotShadow: '0 0 4px rgba(239, 68, 68, 0.2)',
        hoverBg: 'rgba(239, 68, 68, 0.12)',
        hoverColor: '#ef4444',
        hoverBorder: 'rgba(239, 68, 68, 0.2)',
        hoverShadow: '0 2px 8px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      common: {
        defaultColor: 'rgba(232, 232, 232, 0.9)',
        defaultDot: 'rgba(255, 255, 255, 0.2)',
        disabledDot: 'rgba(255, 255, 255, 0.1)',
        flowGradient: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05), transparent)',
      },
    },

    button: {

      default: {
        background: 'rgba(255, 255, 255, 0.08)',
        color: '#B7BCC8',
        border: 'transparent',
        shadow: 'none',
      },
      hover: {
        background: 'rgba(255, 255, 255, 0.14)',
        color: '#E9ECF2',
        border: 'transparent',
        shadow: 'none',
        transform: 'none',
      },
      active: {
        background: 'rgba(255, 255, 255, 0.10)',
        color: '#E9ECF2',
        border: 'transparent',
        shadow: 'none',
        transform: 'none',
      },


      // Tech-minimal primary: one quiet near-white action per region.
      primary: {
        default: {
          background: 'rgba(233, 236, 242, 0.92)',
          color: '#0B0E14',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: '#FFFFFF',
          color: '#0B0E14',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: 'rgba(233, 236, 242, 0.78)',
          color: '#0B0E14',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },


      ghost: {
        default: {
          background: 'transparent',
          color: '#B7BCC8',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: 'rgba(255, 255, 255, 0.10)',
          color: '#E9ECF2',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: 'rgba(255, 255, 255, 0.07)',
          color: '#E9ECF2',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },
    },
  },





  monaco: {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      background: '#0C0F16',
      foreground: '#E9ECF2',
      lineHighlight: '#12151E',
      selection: 'rgba(34, 211, 238, 0.18)',
      cursor: '#22D3EE',
    },
  },
};
