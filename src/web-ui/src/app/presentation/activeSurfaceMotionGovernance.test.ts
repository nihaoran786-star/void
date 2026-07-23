import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('active surface motion governance', () => {
  it('keeps agent controls on paint and compositor transitions', () => {
    const agentsView = readSource('../scenes/agents/AgentsView.scss');
    const agentsMinimal = readSource(
      '../scenes/agents/AgentsScene.minimal.scss',
    );

    expect(agentsView).not.toContain('transition: all');
    expect(agentsView).toContain(
      'background-color $motion-fast $easing-standard',
    );
    expect(agentsMinimal).not.toContain(
      'transition: width var(--workspace-motion-fast)',
    );
  });

  it('does not animate every property on drag and split-pane surfaces', () => {
    const dropZone = readSource(
      '../../shared/context-system/drag-drop/ContextDropZone.scss',
    );
    const sessionScene = readSource('../scenes/session/SessionScene.scss');

    expect(dropZone).not.toContain('transition: all');
    expect(sessionScene).not.toContain('transition: all');
    expect(sessionScene).toContain(
      'background-color $motion-base $easing-standard',
    );
    expect(sessionScene).toContain(
      'opacity $motion-base $easing-standard',
    );
  });
});
