import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const workspaceBodySource = read('../layout/WorkspaceBody.scss');
const navItemSource = read('../components/NavPanel/components/NavItem.tsx');
const mainNavSource = read('../components/NavPanel/MainNav.tsx');
const workspaceItemSource = read(
  '../components/NavPanel/sections/workspaces/WorkspaceItem.tsx',
);
const sessionsSource = read(
  '../components/NavPanel/sections/sessions/SessionsSection.tsx',
);

const navActionSources = [
  navItemSource,
  mainNavSource,
  workspaceItemSource,
  sessionsSource,
];

describe('OpenWork-inspired welcome and workspace stability contract', () => {
  it('raises only the scene containing a maximized Canvas above the navigation', () => {
    expect(workspaceBodySource).toMatch(
      /\.void-workspace-body__scene-area:has\(\.canvas-content-canvas\.is-maximized\) \{[\s\S]*?z-index: 11;/,
    );
    expect(workspaceBodySource).toContain('isolation: isolate;');
  });

  it('passes numeric dimensions to Lucide navigation action icons', () => {
    navActionSources.forEach((source) => {
      expect(source).not.toContain(
        'size="var(--void-nav-row-action-icon-size)"',
      );
    });

    expect(navItemSource.match(/<ActionIcon size=\{13\} \/>/g)).toHaveLength(2);
    expect(mainNavSource).toContain('<Plus size={13} />');
    expect(
      workspaceItemSource.match(/<Folder size=\{13\} aria-hidden="true" \/>/g),
    ).toHaveLength(2);
    expect(
      workspaceItemSource.match(
        /<MoreHorizontal size=\{13\} aria-hidden="true" \/>/g,
      ),
    ).toHaveLength(2);
    expect(sessionsSource).toContain('<MoreHorizontal size={13} />');
  });
});
