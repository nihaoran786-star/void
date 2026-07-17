import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('workspace status reachability', () => {
  it('connects the navigation action to the existing workspace manager dialog', () => {
    const layout = read('./AppLayout.tsx');
    const footer = read('../components/NavPanel/components/PersistentFooterActions.tsx');

    expect(footer).toContain("window.dispatchEvent(new Event('nav:workspace-status'))");
    expect(layout).toContain("window.addEventListener('nav:workspace-status', onShowWorkspaceStatus)");
    expect(layout).toContain('const onShowWorkspaceStatus = () => setShowWorkspaceStatus(true)');
    expect(layout).toContain('isVisible={showWorkspaceStatus}');
    expect(layout).toContain('presentation={workspacePresentation}');
  });
});
