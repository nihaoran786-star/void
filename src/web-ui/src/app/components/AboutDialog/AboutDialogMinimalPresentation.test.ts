import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
  readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');

const minimalProjection = (source: string): string =>
  source.split(
    '// ==================== Minimal presentation projection ====================',
  )[1] ?? '';

describe('About and update Minimal presentation', () => {
  it('keeps presentation ownership at the shared portal root', () => {
    const aboutSource = readSource('./AboutDialog.tsx');
    const appLayoutSource = readSource('../../layout/AppLayout.tsx');
    const footerSource = readSource(
      '../NavPanel/components/PersistentFooterActions.tsx',
    );
    const dailyGateSource = readSource(
      '../../../infrastructure/update/DailyAppUpdateGate.tsx',
    );
    const availableSource = readSource(
      '../../../infrastructure/update/UpdateAvailableDialog.tsx',
    );
    const progressSource = readSource(
      '../../../infrastructure/update/UpdateInstallProgressModal.tsx',
    );

    expect(aboutSource).not.toContain('readWorkspacePresentation');
    expect(aboutSource.match(/overlayClassName=\{overlayClassName\}/g))
      .toHaveLength(2);
    expect(appLayoutSource).toContain(
      'applyWorkspacePresentationToPortalRoot(\n      document.body,\n      workspacePresentation,',
    );
    expect(appLayoutSource).not.toContain(
      'overlayClassName={workspacePresentationClassName(workspacePresentation)}',
    );
    expect(footerSource).not.toContain('readWorkspacePresentation');
    expect(footerSource).not.toContain('overlayClassName=');
    expect(dailyGateSource.match(/overlayClassName=\{overlayClassName\}/g))
      .toHaveLength(2);
    expect(availableSource).toContain(
      'overlayClassName={overlayClassName}',
    );
    expect(progressSource).toContain(
      'overlayClassName={overlayClassName}',
    );
  });

  it('uses workspace tokens and removes decorative Minimal presentation', () => {
    const stylesheets = [
      minimalProjection(readSource('./AboutDialog.scss')),
      minimalProjection(
        readSource('../../../infrastructure/update/UpdateAvailableDialog.scss'),
      ),
      minimalProjection(
        readSource('../../../infrastructure/update/UpdateInstallProgressModal.scss'),
      ),
    ];

    for (const stylesheet of stylesheets) {
      expect(stylesheet).toContain('.void-ui--minimal .modal-overlay');
      expect(stylesheet).toContain('var(--workspace-surface-raised)');
      expect(stylesheet).toContain('var(--workspace-border-subtle)');
      expect(stylesheet).toContain('var(--workspace-radius-panel)');
      expect(stylesheet).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
      expect(stylesheet).not.toMatch(/\blinear-gradient\s*\(/i);
    }

    expect(stylesheets[0]).toContain(
      '&__divider,\n    &__dots {\n      display: none;',
    );
    expect(stylesheets[0]).toContain(
      '&__title {\n      margin: 0 0 var(--workspace-space-1);',
    );
    expect(stylesheets[0]).toContain('animation: none;');
    expect(stylesheets[1]).toContain(
      '&__lead-icon {\n      display: none;',
    );
    expect(stylesheets[2]).toContain('max-width: 360px;');
  });
});
