import { describe, expect, it } from 'vitest';
import { createBrowserPanelWebviewLabel } from './browserWebviewLabels';

describe('browserWebviewLabels', () => {
  it('creates unique labels across multiple browser panel instances', () => {
    const labels = Array.from({ length: 20 }, () => createBrowserPanelWebviewLabel());

    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/^embedded-browser-panel-view-\d+-/);
    }
  });
});
