import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('content canvas action accessibility contract', () => {
  it('names anchor controls and exposes their toggle state', () => {
    const source = read('./anchor-zone/AnchorZone.tsx');

    expect(source).toContain("aria-label={isCollapsed ? t('tooltip.expand') : t('tooltip.collapse')}");
    expect(source).toContain('aria-expanded={!isCollapsed}');
    expect(source).toContain("aria-label={isMaximized ? t('windowControls.restore') : t('windowControls.maximize')}");
    expect(source).toContain('aria-pressed={isMaximized}');
    expect(source).toContain("aria-label={t('tooltip.close')}");
  });

  it('keeps mission control and its icon actions semantically complete', () => {
    const source = read('./mission-control/MissionControl.tsx');

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="canvas-mission-control-title"');
    expect(source).toContain("aria-label={t('tooltip.close')}");
    expect(source).toContain('aria-pressed={selectedGroups.has(id)}');
  });

  it('makes thumbnails keyboard-operable and names their icon actions', () => {
    const source = read('./mission-control/ThumbnailCard.tsx');

    expect(source).toContain("e.key === 'Enter' || e.key === ' '");
    expect(source).toContain('role="button"');
    expect(source).toContain('tabIndex={0}');
    expect(source).toContain('aria-label={titleWithDeleted}');
    expect(source).toContain("aria-label={tab.state === 'pinned' ? t('tabs.unpin') : t('tabs.pin')}");
    expect(source).toContain("aria-label={t('tabs.close')}");
  });

  it('names both media selection reset actions', () => {
    const source = read('./workspace-media/WorkspaceMediaGallery.tsx');
    const labels = source.match(
      /aria-label=\{t\('workspaceMedia\.actions\.clearVisibleSelection'\)\}/g,
    );

    expect(labels).toHaveLength(2);
  });
});
