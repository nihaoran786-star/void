import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSibling(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('model round action accessibility contract', () => {
  it('names fork, copy, and image export icon actions', () => {
    const forkSource = readSibling('./ForkSessionButton.tsx');
    const roundSource = readSibling('./ModelRoundItem.tsx');
    const exportSource = readSibling('./ExportImageButton.tsx');

    expect(forkSource).toContain('type="button"');
    expect(forkSource).toContain(
      "aria-label={t('modelRound.forkDialog')}",
    );
    expect(forkSource).toContain('<GitFork size={14} aria-hidden="true" />');

    expect(roundSource).toContain('type="button"');
    expect(roundSource).toContain(
      "aria-label={copied ? t('modelRound.copiedDialog') : t('modelRound.copyDialog')}",
    );
    expect(roundSource).toContain('<Copy size={14} aria-hidden="true" />');

    expect(exportSource).toContain('type="button"');
    expect(exportSource).toContain(
      "i18nService.t('flow-chat:exportImage.exportToImage')",
    );
    expect(exportSource).toContain('<Image size={14} aria-hidden="true" />');
  });
});
