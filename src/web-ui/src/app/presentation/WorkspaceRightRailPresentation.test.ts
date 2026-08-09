import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const extractScssBlock = (source: string, marker: string): string => {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing SCSS marker: ${marker}`);

  const openBraceIndex = source.indexOf('{', markerIndex);
  if (openBraceIndex < 0) throw new Error(`Missing opening brace after: ${marker}`);

  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }

  throw new Error(`Unbalanced SCSS block after: ${marker}`);
};

const sessionSource = read('../scenes/session/SessionScene.scss');
const auxPaneSource = read('../scenes/session/AuxPane.scss');
const canvasSource = read(
  '../components/panels/content-canvas/ContentCanvas.scss',
);
const shortDramaSource = read(
  '../components/panels/content-canvas/short-drama/ShortDramaCenterPanel.minimal.scss',
);
const teamWorkspaceSource = read(
  '../../team_workspace/components/TeamWorkspacePanel.scss',
);

describe('Porcelain Air right rail presentation contract', () => {
  it('keeps the wide Team Workspace inset without changing its absolute third-column ownership', () => {
    expect(sessionSource).toMatch(
      /\.void-ui--minimal \.void-session-scene--has-team-workspace \{[\s\S]*?--team-workspace-column-width: clamp\(340px, 23vw, 400px\);[\s\S]*?padding-right: calc\([\s\S]*?var\(--team-workspace-column-width\) \+ var\(--workspace-space-2\)[\s\S]*?\);/,
    );
    expect(sessionSource).toMatch(
      /\.void-ui--minimal \.void-session-scene__team-workspace \{[\s\S]*?top: var\(--workspace-space-2\);[\s\S]*?right: var\(--workspace-space-2\);[\s\S]*?bottom: var\(--workspace-space-2\);[\s\S]*?border-radius: var\(--workspace-radius-shell\);/,
    );
  });

  it('uses a compact three-column rail at high-DPI desktop CSS widths', () => {
    expect(sessionSource).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279px\)[\s\S]*?--team-workspace-column-width: clamp\(280px, 25vw, 320px\);[\s\S]*?padding-right: calc\([\s\S]*?var\(--team-workspace-column-width\) \+ var\(--workspace-space-2\)[\s\S]*?\);/,
    );
    expect(sessionSource).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279px\)[\s\S]*?\.void-session-scene__chat-pane \{[\s\S]*?min-width: 280px;[\s\S]*?max-width: 34%;/,
    );
    expect(sessionSource).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279px\)[\s\S]*?\.void-session-scene__aux-pane:not\(\.void-session-scene__aux-pane--collapsed\) \{[\s\S]*?min-width: 240px;[\s\S]*?max-width: calc\(100% - 281px\);/,
    );
  });

  it('gives the Canvas one inset shell and removes it only while maximized', () => {
    expect(auxPaneSource).toMatch(
      /\.void-ui--minimal \.void-aux-pane \{[\s\S]*?padding: var\(--workspace-space-2\);/,
    );
    expect(canvasSource).toMatch(
      /\.void-ui--minimal \.canvas-content-canvas \{[\s\S]*?border: 1px solid var\(--workspace-border-subtle\);[\s\S]*?border-radius: var\(--workspace-radius-shell\);/,
    );
    expect(canvasSource).toMatch(
      /&\.is-maximized \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?box-shadow: none;/,
    );
  });

  it('uses one compact height contract for Canvas and Team headers', () => {
    const shortDramaTopbar = extractScssBlock(
      shortDramaSource,
      '.void-ui--minimal .short-drama-center__topbar',
    );
    const classicTeamWorkspace = extractScssBlock(
      teamWorkspaceSource,
      '.team-workspace-panel',
    );
    const minimalTeamWorkspace = extractScssBlock(
      teamWorkspaceSource,
      '.void-ui--minimal .team-workspace-panel',
    );
    const classicConversationHeader = extractScssBlock(
      classicTeamWorkspace,
      '&__conversation-header',
    );
    const minimalHeader = extractScssBlock(minimalTeamWorkspace, '&__header');
    const minimalConversationHeader = extractScssBlock(
      minimalTeamWorkspace,
      '&__conversation-header',
    );

    expect(shortDramaTopbar).toContain('height: var(--workspace-topbar-height);');
    expect(shortDramaTopbar).toContain('min-height: var(--workspace-topbar-height);');
    expect(classicConversationHeader).toContain('min-height: 52px;');
    expect(minimalHeader).toContain('height: 44px;');
    expect(minimalHeader).toContain('min-height: 44px;');
    expect(minimalConversationHeader).toContain('height: 44px;');
    expect(minimalConversationHeader).toContain('min-height: 44px;');
  });

  it('does not add presentation-only force overrides', () => {
    const minimalStart = auxPaneSource.indexOf('.void-ui--minimal .void-aux-pane');
    const classicStart = auxPaneSource.indexOf('.void-ui--classic .void-aux-pane');
    const minimalAuxPane = auxPaneSource.slice(minimalStart, classicStart);
    const classicAuxPane = extractScssBlock(
      auxPaneSource,
      '.void-ui--classic .void-aux-pane',
    );
    const minimalCanvas = extractScssBlock(
      canvasSource,
      '.void-ui--minimal .canvas-content-canvas',
    );
    const minimalTeamWorkspace = extractScssBlock(
      teamWorkspaceSource,
      '.void-ui--minimal .team-workspace-panel',
    );

    expect(minimalStart).toBeGreaterThanOrEqual(0);
    expect(classicStart).toBeGreaterThan(minimalStart);
    expect(minimalAuxPane).not.toContain('!important');
    expect(minimalCanvas).not.toContain('!important');
    expect(minimalTeamWorkspace).not.toContain('!important');
    expect(classicAuxPane).toContain('!important');
  });
});
