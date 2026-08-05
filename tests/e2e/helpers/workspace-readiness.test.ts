import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { isWorkspaceReady } from './workspace-readiness.js';

describe('workspace readiness', () => {
  const workspacePath = 'D:\\codex\\void-source\\tests\\e2e';

  it('does not require a rendered workspace-name label', () => {
    assert.equal(isWorkspaceReady({
      currentWorkspacePath: workspacePath,
      openedWorkspacePaths: [workspacePath],
      managerCurrentWorkspacePath: workspacePath,
      managerLoading: false,
      applicationShellReady: true,
    }, workspacePath), true);
  });

  it('waits for the manager and application shell to settle', () => {
    const readyState = {
      currentWorkspacePath: workspacePath,
      openedWorkspacePaths: [workspacePath],
      managerCurrentWorkspacePath: workspacePath,
      managerLoading: false,
      applicationShellReady: true,
    };

    assert.equal(isWorkspaceReady({ ...readyState, managerLoading: true }, workspacePath), false);
    assert.equal(isWorkspaceReady({ ...readyState, applicationShellReady: false }, workspacePath), false);
    assert.equal(isWorkspaceReady({
      ...readyState,
      managerCurrentWorkspacePath: 'D:\\other-workspace',
    }, workspacePath), false);
  });
});
