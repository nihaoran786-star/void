import { describe, expect, it } from 'vitest';
import { readSourceText } from '@/test-utils/sourceText';

const appLayoutSource = readSourceText(
  new URL('../layout/AppLayout.tsx', import.meta.url),
);

describe('workspace presentation portal root contract', () => {
  it('projects presentation once at the application composition boundary', () => {
    expect(appLayoutSource).toContain('useLayoutEffect(() => {');
    expect(appLayoutSource).toContain(
      'applyWorkspacePresentationToPortalRoot(\n      document.body,\n      workspacePresentation,',
    );
  });

  it('keeps portal presentation out of runtime and feature adapters', () => {
    expect(appLayoutSource).not.toContain('workspaceAPI.setPresentation');
    expect(appLayoutSource).not.toContain('systemAPI.setPresentation');
    expect(appLayoutSource).not.toContain('FlowChatManager.setPresentation');
  });
});
