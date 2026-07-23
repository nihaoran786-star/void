import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Git Minimal presentation contract', () => {
  const scene = readSource('./GitScene.minimal.scss');
  const workingCopy = readSource('./views/WorkingCopyView.minimal.scss');
  const branches = readSource('./views/BranchesView.minimal.scss');
  const graph = readSource('./views/GraphView.minimal.scss');
  const nav = readSource('./GitNav.minimal.scss');

  it('loads each projection once through its feature stylesheet', () => {
    const sceneOwner = readSource('./GitScene.scss');
    const workingCopyOwner = readSource('./views/WorkingCopyView.scss');
    const branchesOwner = readSource('./views/BranchesView.scss');
    const graphOwner = readSource('./views/GraphView.scss');
    const navOwner = readSource('./GitNav.scss');

    expect(sceneOwner.match(/@use '\.\/GitScene\.minimal' as minimal;/g)).toHaveLength(1);
    expect(sceneOwner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(
      workingCopyOwner.match(/@use '\.\/WorkingCopyView\.minimal' as minimal;/g),
    ).toHaveLength(1);
    expect(workingCopyOwner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(
      branchesOwner.match(/@use '\.\/BranchesView\.minimal' as minimal;/g),
    ).toHaveLength(1);
    expect(branchesOwner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(
      graphOwner.match(/@use '\.\/GraphView\.minimal' as minimal;/g),
    ).toHaveLength(1);
    expect(graphOwner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(navOwner.match(/@use '\.\/GitNav\.minimal' as minimal;/g)).toHaveLength(1);
    expect(navOwner.match(/@include minimal\.styles;/g)).toHaveLength(1);
  });

  it('scopes both projections to the Minimal Git scene', () => {
    expect(scene).toContain('.void-ui--minimal .void-git-scene {');
    expect(workingCopy).toContain(
      '.void-ui--minimal .void-git-scene-working-copy {',
    );
    expect(branches).toContain(
      '.void-ui--minimal .void-git-scene-branches {',
    );
    expect(graph).toContain('.void-ui--minimal .void-git-scene-graph {');
    expect(nav).toContain('.void-ui--minimal .void-git-scene-nav {');
  });

  it('keeps branch and commit lists compact and virtualizable', () => {
    expect(branches).toMatch(
      /&__row,[\s\S]*?&__commit \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 32px;/,
    );
    expect(branches).toMatch(/&__commit-header \{[\s\S]*?min-height: 36px;/);
    expect(branches).toContain('@media (max-width: 760px)');
    expect(nav).toMatch(/&__item \{[\s\S]*?height: 30px;/);
    expect(graph).toMatch(/&__header \{[\s\S]*?min-height: 44px;/);
  });

  it('compresses the commit composer without changing its controls', () => {
    expect(workingCopy).toMatch(
      /grid-template-areas:[\s\S]*?'status status'[\s\S]*?'message actions';/,
    );
    expect(workingCopy).toMatch(
      /\.void-textarea__field \{[\s\S]*?min-height: 48px;[\s\S]*?max-height: 96px;/,
    );
    expect(readSource('./views/WorkingCopyView.tsx')).toContain(
      'onClick={handleQuickCommit}',
    );
  });

  it('keeps long file lists cheap and feedback flat', () => {
    expect(workingCopy).toMatch(
      /\.void-git-scene-working-copy__file-row \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 28px;/,
    );
    expect(`${scene}\n${workingCopy}\n${branches}\n${graph}\n${nav}`).not.toMatch(
      /(?:linear|radial|conic)-gradient/i,
    );
    expect(`${scene}\n${workingCopy}\n${branches}\n${graph}\n${nav}`).not.toMatch(
      /transition\s*:\s*all/i,
    );
    expect(`${scene}\n${workingCopy}\n${branches}\n${graph}\n${nav}`).not.toMatch(
      /\b(?:translate|scale)\s*\(/i,
    );
  });

  it('removes decorative empty-state furniture and supports reduced motion', () => {
    expect(scene).toMatch(
      /\.void-git-scene__init-decoration,[\s\S]*?display: none;/,
    );
    expect(scene).toContain('@media (prefers-reduced-motion: reduce)');
    expect(workingCopy).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
