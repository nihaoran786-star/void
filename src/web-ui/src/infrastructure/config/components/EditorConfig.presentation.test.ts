import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./EditorConfig.tsx', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('./EditorConfig.scss', import.meta.url),
  'utf8',
);

describe('EditorConfig presentation contract', () => {
  it('names every compact editor control from its visible setting label', () => {
    const selectLabels = [
      "t('appearance.font')",
      "t('appearance.fontWeight')",
      "t('appearance.cursorStyle')",
      "t('appearance.cursorBlinking')",
      "t('behavior.wordWrap')",
      "t('behavior.lineNumbers')",
      "t('display.minimapPosition')",
      "t('display.minimapSize')",
      "t('display.whitespace')",
      "t('display.lineHighlight')",
    ];
    const inputLabels = [
      "t('appearance.fontSize')",
      "t('appearance.lineHeight')",
      "t('behavior.tabSize')",
    ];
    const switchLabels = [
      "t('behavior.insertSpaces')",
      "t('behavior.smoothScrolling')",
      "t('behavior.scrollBeyondLastLine')",
      "t('display.minimap')",
      "t('advanced.semanticHighlighting')",
      "t('advanced.bracketPairColorization')",
      "t('advanced.formatOnSave')",
      "t('advanced.formatOnPaste')",
      "t('advanced.trimAutoWhitespace')",
    ];

    for (const label of selectLabels) {
      expect(source).toContain(`ariaLabel={${label}}`);
    }
    for (const label of inputLabels) {
      expect(source).toContain(`inputAriaLabel={${label}}`);
    }
    for (const label of switchLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }
  });

  it('uses a wide two-column layout and progressively returns to one column', () => {
    expect(styles).toContain('--config-page-content-max-width: 1040px;');
    expect(styles).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(styles).toContain('border-width: 1px 0 0;');
    expect(styles).toContain(
      '--row-grid-cols: minmax(0, 1fr) minmax(120px, 38%);',
    );
    expect(styles).toContain('@container config-panel (max-width: 720px)');
    expect(styles).toContain('@container config-panel (max-width: 360px)');
  });
});
