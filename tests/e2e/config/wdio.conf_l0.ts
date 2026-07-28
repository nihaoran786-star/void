import { createEmbeddedConfig } from './embedded-driver';

export const config = createEmbeddedConfig(
  [
    '../specs/l0-smoke.spec.ts',
    '../specs/l0-webdriver-protocol.spec.ts',
    '../specs/l0-open-workspace.spec.ts',
    '../specs/l0-open-settings.spec.ts',
    '../specs/l0-observe.spec.ts',
    '../specs/l0-navigation.spec.ts',
    '../specs/l0-tabs.spec.ts',
    '../specs/l0-theme.spec.ts',
    '../specs/l0-theme-token-visual.spec.ts',
    '../specs/l0-settings-theme-visual.spec.ts',
    '../specs/l0-floating-mini-chat-visual.spec.ts',
    '../specs/l0-i18n.spec.ts',
    '../specs/l0-notification.spec.ts',
    '../specs/l0-media-toolbar-minimal-visual.spec.ts',
    '../specs/l0-short-drama-navigation-minimal-visual.spec.ts',
    '../specs/l0-session-team-capability-rail-visual.spec.ts',
    '../specs/l0-automation-minimal-visual.spec.ts',
    '../specs/l0-user-message-minimal-visual.spec.ts',
    '../specs/l0-tool-card-shell-minimal-visual.spec.ts',
  ],
  'L0'
);

export default config;
