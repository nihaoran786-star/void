export type WidgetThemePayload = {
  id: string;
  type: string;
  contractVersion: 1;
  status: 'ready' | 'partial';
  source: 'host-css-vars';
  missingRequiredVars: string[];
  appliedLegacyAliases: Record<string, string>;
  error?: {
    code: 'missing_required_vars';
    message: string;
  };
  vars: Record<string, string>;
};

const WIDGET_THEME_REQUIRED_VARS = [
  '--color-bg-primary',
  '--color-text-primary',
  '--color-accent-500',
  '--border-base',
  '--font-sans',
] as const;

const WIDGET_THEME_OPTIONAL_VARS = [
  '--color-bg-secondary',
  '--color-bg-tertiary',
  '--color-bg-elevated',
  '--color-bg-workbench',
  '--color-bg-scene',
  '--color-bg-tooltip',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-text-disabled',
  '--color-accent-50',
  '--color-accent-100',
  '--color-accent-200',
  '--color-accent-300',
  '--color-accent-400',
  '--color-accent-600',
  '--color-primary',
  '--color-primary-hover',
  '--color-success',
  '--color-success-bg',
  '--color-warning',
  '--color-warning-bg',
  '--color-error',
  '--color-error-bg',
  '--color-info',
  '--color-info-bg',
  '--border-subtle',
  '--border-medium',
  '--border-strong',
  '--border-prominent',
  '--element-bg-subtle',
  '--element-bg-soft',
  '--element-bg-base',
  '--element-bg-medium',
  '--element-bg-strong',
  '--element-bg-elevated',
  '--shadow-xs',
  '--shadow-sm',
  '--shadow-base',
  '--shadow-lg',
  '--shadow-xl',
  '--radius-sm',
  '--radius-base',
  '--radius-lg',
  '--radius-xl',
  '--spacing-2',
  '--spacing-3',
  '--spacing-4',
  '--spacing-5',
  '--spacing-6',
  '--motion-fast',
  '--motion-base',
  '--easing-standard',
  '--font-mono',
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-base',
  '--font-size-lg',
  '--font-size-2xl',
  '--font-weight-medium',
  '--font-weight-semibold',
] as const;

export const WIDGET_THEME_PAYLOAD_CONTRACT = {
  requiredVars: WIDGET_THEME_REQUIRED_VARS,
  optionalVars: WIDGET_THEME_OPTIONAL_VARS,
  legacyAliases: {
    '--color-border-default': '--border-base',
  },
} as const;

const THEME_VAR_NAMES = [
  ...WIDGET_THEME_PAYLOAD_CONTRACT.requiredVars,
  ...WIDGET_THEME_PAYLOAD_CONTRACT.optionalVars,
  ...Object.keys(WIDGET_THEME_PAYLOAD_CONTRACT.legacyAliases),
] as const;

function readCssVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

export function readWidgetThemePayload(): WidgetThemePayload | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const root = document.documentElement;
  const styles = window.getComputedStyle(root);
  const vars: Record<string, string> = {};
  const appliedLegacyAliases: Record<string, string> = {};

  for (const name of THEME_VAR_NAMES) {
    const value = readCssVar(styles, name);
    if (value) {
      vars[name] = value;
    }
  }

  Object.entries(WIDGET_THEME_PAYLOAD_CONTRACT.legacyAliases).forEach(([legacyName, canonicalName]) => {
    const canonicalValue = vars[canonicalName] || readCssVar(styles, canonicalName);
    const legacyValue = vars[legacyName] || readCssVar(styles, legacyName);
    if (canonicalValue && !vars[legacyName]) {
      vars[legacyName] = canonicalValue;
      appliedLegacyAliases[legacyName] = canonicalName;
    }
    if (legacyValue && !vars[canonicalName]) {
      vars[canonicalName] = legacyValue;
      appliedLegacyAliases[legacyName] = canonicalName;
    }
  });

  const missingRequiredVars = WIDGET_THEME_PAYLOAD_CONTRACT.requiredVars.filter(name => !vars[name]);
  const status = missingRequiredVars.length === 0 ? 'ready' : 'partial';

  return {
    id: root.getAttribute('data-theme') || 'unknown',
    type: root.getAttribute('data-theme-type') || 'dark',
    contractVersion: 1,
    status,
    source: 'host-css-vars',
    missingRequiredVars,
    appliedLegacyAliases,
    ...(status === 'partial'
      ? {
          error: {
            code: 'missing_required_vars' as const,
            message: `Missing generated-widget theme vars: ${missingRequiredVars.join(', ')}`,
          },
        }
      : {}),
    vars,
  };
}
