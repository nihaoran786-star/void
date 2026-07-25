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
});
