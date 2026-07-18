import { describe, expect, it } from 'vitest';

import {
  shouldVirtualizeWorkspaceMediaList,
} from './WorkspaceMediaVirtualMasonryModel';

describe('WorkspaceMediaVirtualMasonryModel', () => {
  it('keeps small galleries on the stable CSS path and virtualizes large ones', () => {
    expect(shouldVirtualizeWorkspaceMediaList(60)).toBe(false);
    expect(shouldVirtualizeWorkspaceMediaList(61)).toBe(true);
    expect(shouldVirtualizeWorkspaceMediaList(500)).toBe(true);
  });
});
