// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FlexiblePanel.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('FlexiblePanel Canvas surface boundary', () => {
  it('lazy-loads registered surfaces without importing Workspace Media or its registry eagerly', () => {
    expect(source).toContain(
      "import('../content-canvas/registry/CanvasSurfaceRenderer')",
    );
    expect(source).toContain('<CanvasSurfaceRenderer');
    expect(source).not.toContain("from '../content-canvas/registry/CanvasSurfaceRendererRegistry'");
    expect(source).not.toContain("from '../content-canvas/registry/firstPartyCanvasSurfaces'");
    expect(source).not.toContain('const WorkspaceMediaGallery = React.lazy');
    expect(source).not.toContain("case 'workspace-media-gallery':");
  });
});
