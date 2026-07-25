import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./SessionConfig.tsx', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('./AIFeaturesConfig.scss', import.meta.url),
  'utf8',
);

describe('SessionConfig presentation contract', () => {
  it('keeps personalization and permissions on independently scoped layouts', () => {
    expect(source).toContain(
      'void-func-agent-config void-func-agent-config--${variant}',
    );
    expect(styles).toContain(
      '.void-ui--minimal .void-func-agent-config--permissions',
    );
  });

  it('pairs permission groups on wide screens and returns to one column', () => {
    expect(styles).toContain('--config-page-content-max-width: 1040px;');
    expect(styles).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(styles).toContain(
      '.void-func-agent-config__section--workspace-search',
    );
    expect(styles).toContain('border-width: 1px 0 0;');
    expect(styles).toContain('@container config-panel (max-width: 720px)');
  });

  it('keeps personalization flat, compact, and motion-on-demand', () => {
    expect(styles).toMatch(
      /\.void-ui--minimal \.void-func-agent-config--personalization[\s\S]*?\.void-config-page-section__body \{[\s\S]*?border-width: 1px 0 0;[\s\S]*?background: transparent;/,
    );
    expect(styles).toMatch(
      /\.void-func-agent-config__pet-preview-sprite \{[\s\S]*?animation: none;/,
    );
    expect(styles).toMatch(
      /@container config-panel \(max-width: 520px\)[\s\S]*?\.void-config-page-row\.void-func-agent-config__model-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.model-selection-radio--horizontal \{[\s\S]*?flex-direction: row;/,
    );
  });

  it('uses native pressed buttons for companion choices', () => {
    expect(source).toContain('role="group"');
    expect(source).toContain('aria-pressed={isSelected}');
    expect(source).not.toContain('role="radiogroup"');
    expect(source).not.toContain('role="radio"');
  });
});
