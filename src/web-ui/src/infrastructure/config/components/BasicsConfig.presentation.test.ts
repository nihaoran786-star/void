import { describe, expect, it } from 'vitest';
import { readSourceText } from '@/test-utils/sourceText';

const source = readSourceText(new URL('./BasicsConfig.tsx', import.meta.url));
const styles = readSourceText(new URL('./BasicsConfig.scss', import.meta.url));

describe('BasicsConfig control accessibility', () => {
  it('names every compact switch from its visible setting label', () => {
    const expectedSwitchLabels = [
      "t('launchAtLogin.toggleLabel')",
      "t('autoUpdate.toggleLabel')",
      "t('logging.sensitiveDiagnostics.label')",
      "t('notifications.dialogCompletion.label')",
      "t('notifications.startupTips.label')",
    ];

    for (const label of expectedSwitchLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }
  });

  it('names every compact select from its visible setting label', () => {
    const expectedSelectLabels = [
      "t('windowBehavior.closeButtonLabel')",
      "t('logging.sections.level')",
      "t('terminal.sections.defaultTerminal')",
    ];

    for (const label of expectedSelectLabels) {
      expect(source).toContain(`ariaLabel={${label}}`);
    }
  });

  it('names the icon-only log-folder action', () => {
    expect(source).toContain(
      "aria-label={t('logging.actions.openFolderTooltip')}",
    );
  });

  it('uses a flat tokenized list and keeps simple controls inline when narrow', () => {
    expect(styles).toContain(
      '.void-ui--minimal .void-basics-config {\n  .void-config-page-section__body {',
    );
    expect(styles).toContain('border-width: 1px 0 0;');
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(112px, 34%);',
    );
  });
});
