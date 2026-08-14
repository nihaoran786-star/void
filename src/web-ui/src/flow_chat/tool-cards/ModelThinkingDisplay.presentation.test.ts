import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./ModelThinkingDisplay.tsx', import.meta.url),
  'utf8',
);

const originalSource = readFileSync(
  new URL('../../component-library/preview/beautiful-ui-original/components/thinking-state.tsx', import.meta.url),
  'utf8',
);

describe('ModelThinkingDisplay presentation contract', () => {
  it('renders the original Beautiful UI thinking component with real summaries', () => {
    expect(componentSource).toContain("components/thinking-state'");
    expect(componentSource).toContain('rows={rows}');
    expect(componentSource).toContain('working={isActive}');
    expect(componentSource).toContain('alwaysExpanded');
    expect(componentSource).toContain('data-beautiful-component="thinking-state"');
  });

  it('removes the duplicate Flow Chat hide and replay animation layer', () => {
    expect(componentSource).not.toContain('useThinkingElapsed');
    expect(componentSource).not.toContain('useTypewriter');
    expect(componentSource).not.toContain('thinking-expand-container');
    expect(originalSource).toContain('alwaysExpanded');
    expect(originalSource).toContain('shimmer-text 1.4s linear infinite');
  });
});
