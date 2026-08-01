import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Puzzle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { CatalogIconAvatar } from './CatalogIconAvatar';
import { resolveCatalogIconTone } from './catalogIconTone';

describe('CatalogIconAvatar', () => {
  it('assigns a stable presentation tone without changing the raw identity', () => {
    const identity = 'user::home.codex::arrange';
    expect(resolveCatalogIconTone(identity)).toBe(resolveCatalogIconTone(identity));
    expect(resolveCatalogIconTone(identity)).toBeGreaterThanOrEqual(0);
    expect(resolveCatalogIconTone(identity)).toBeLessThan(6);
  });

  it('renders a decorative circular catalog identity', () => {
    const markup = renderToStaticMarkup(
      <CatalogIconAvatar
        identity="skill:arrange"
        icon={<Puzzle />}
        label="布局优化"
      />,
    );

    expect(markup).toContain('catalog-icon-avatar--card');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('title="布局优化"');
  });
});
