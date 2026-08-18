import { beforeEach, describe, expect, it } from 'vitest';
import { useNavWorkspaceFoldStore } from './navWorkspaceFoldStore';

// The fold state used to live in WorkspaceItem's local state, so it died with
// the component. These assertions pin the two behaviours that made the nav tree
// feel broken: a fold has to survive, and it has to be per workspace.

describe('navWorkspaceFoldStore', () => {
  beforeEach(() => {
    useNavWorkspaceFoldStore.setState({ foldedWorkspaceIds: new Set<string>() });
  });

  it('starts expanded and remembers a fold per workspace', () => {
    const { isFolded, toggleFolded } = useNavWorkspaceFoldStore.getState();

    expect(isFolded('alpha')).toBe(false);

    toggleFolded('alpha');
    expect(useNavWorkspaceFoldStore.getState().isFolded('alpha')).toBe(true);
    expect(useNavWorkspaceFoldStore.getState().isFolded('beta')).toBe(false);

    toggleFolded('alpha');
    expect(useNavWorkspaceFoldStore.getState().isFolded('alpha')).toBe(false);
  });

  it('setFolded is idempotent and keeps the same set identity when nothing changes', () => {
    const { setFolded } = useNavWorkspaceFoldStore.getState();

    setFolded('alpha', true);
    const afterFirst = useNavWorkspaceFoldStore.getState().foldedWorkspaceIds;

    setFolded('alpha', true);
    expect(useNavWorkspaceFoldStore.getState().foldedWorkspaceIds).toBe(afterFirst);

    setFolded('alpha', false);
    expect(useNavWorkspaceFoldStore.getState().isFolded('alpha')).toBe(false);
  });

  it('keeps every other workspace untouched when one is folded', () => {
    const { setFolded } = useNavWorkspaceFoldStore.getState();

    setFolded('alpha', true);
    setFolded('beta', true);
    setFolded('alpha', false);

    const state = useNavWorkspaceFoldStore.getState();
    expect(state.isFolded('alpha')).toBe(false);
    expect(state.isFolded('beta')).toBe(true);
  });
});
