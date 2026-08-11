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
  it('presents the Team Workspace as one floating 9:16 surface above the scene', () => {
    expect(sessionSource).toMatch(
      /\.void-session-scene__team-workspace \{[\s\S]*?position: absolute;[\s\S]*?aspect-ratio: 9 \/ 16;[\s\S]*?border: 1px solid var\(--workspace-border-strong, var\(--border-medium\)\);[\s\S]*?border-radius: 16px;[\s\S]*?box-shadow: var\(--workspace-shadow-raised, var\(--shadow-xs\)\), var\(--shadow-lg\);/,
    );
    // 悬浮面板不再预留第三列,会话与画布保持完整场景宽度。
    expect(sessionSource).not.toMatch(/--team-workspace-column-width/);
    expect(sessionSource).not.toMatch(/padding-right:\s*clamp\(340px/);
  });

  it('quiets only the floating Team chrome on outside interaction', () => {
    const dimmedBlock = extractScssBlock(
      sessionSource,
      "&[data-dimmed='true']",
    );

    expect(dimmedBlock).not.toContain('opacity:');
    expect(dimmedBlock).toContain(
      'border-color: var(--workspace-border-subtle, var(--border-subtle));',
    );
    expect(sessionSource).toMatch(
      /\[data-dimmed='true'\]\s*\{[\s\S]*?box-shadow: var\(--workspace-shadow-raised, var\(--shadow-xs\)\);/,
    );
  });

  it('uses the 36px top bar itself as the drag handle, with no separate grabber', () => {
    expect(sessionSource).not.toMatch(/team-grabber/);
    expect(teamWorkspaceSource).toMatch(
      /&__map-topbar \{[\s\S]*?min-height: 36px;/,
    );
    expect(teamWorkspaceSource).toMatch(
      /&__strip, &__map-topbar \{ cursor: grab; \}/,
    );
  });

  it('flattens the Canvas into the single scene plane behind one hairline', () => {
    expect(auxPaneSource).toMatch(
      /\.void-ui--minimal \.void-aux-pane \{[\s\S]*?padding: var\(--workspace-space-2\);/,
    );
    expect(canvasSource).toMatch(
      /\.void-ui--minimal \.canvas-content-canvas \{[\s\S]*?border: 0;[\s\S]*?border-left: 1px solid var\(--workspace-border-subtle\);[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
    );
    expect(canvasSource).toMatch(
      /&\.is-maximized \{[\s\S]*?border-left: 0;/,
    );
  });

  it('uses one compact strip contract for Canvas and Team member conversation chrome', () => {
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
    const classicStrip = extractScssBlock(
      classicTeamWorkspace,
      '&__strip',
    );
    const minimalStrip = extractScssBlock(
      minimalTeamWorkspace,
      '&__strip',
    );

    expect(shortDramaTopbar).toContain('height: var(--workspace-topbar-height);');
    expect(shortDramaTopbar).toContain('min-height: var(--workspace-topbar-height);');
    expect(classicStrip).toContain('min-height: 36px;');
    expect(minimalStrip).toContain('min-height: 36px;');
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
