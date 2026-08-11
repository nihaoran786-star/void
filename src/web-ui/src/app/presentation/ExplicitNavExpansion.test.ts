import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const useAppSource = read('../hooks/useApp.ts');
const appLayoutSource = read('../layout/AppLayout.tsx');
const btwSessionSource = read('../../flow_chat/services/openBtwSession.ts');
const customizationDispatchSource = read('../services/CustomizationTaskDispatchService.ts');

const extract = (source: string, start: RegExp, end: RegExp): string => {
  const startMatch = start.exec(source);
  if (!startMatch) throw new Error(`Missing start marker: ${start}`);
  const tail = source.slice(startMatch.index);
  const endMatch = end.exec(tail.slice(startMatch[0].length));
  if (!endMatch) throw new Error(`Missing end marker: ${end}`);
  return tail.slice(0, startMatch[0].length + endMatch.index);
};

describe('collapsed navigation explicit-expansion contract', () => {
  it('keeps collapsed-state writes out of destination and session-opening actions', () => {
    const switchLeftPanelTab = extract(
      useAppSource,
      /const switchLeftPanelTab = useCallback/,
      /const updateLeftPanelWidth/,
    );
    const switchToFiles = extract(
      appLayoutSource,
      /const handleSwitchToFilesPanel = \(\) => \{/,
      /window\.addEventListener\('switch-to-files-panel'/,
    );
    const openMainSession = extract(
      btwSessionSource,
      /export async function openMainSession/,
      /export function openBtwSessionInAuxPane/,
    );
    const openCustomizationDraft = extract(
      customizationDispatchSource,
      /openDraft: async \(\) => \{/,
      /persistPersona: async/,
    );

    for (const action of [
      switchLeftPanelTab,
      switchToFiles,
      openMainSession,
      openCustomizationDraft,
    ]) {
      expect(action).not.toContain('leftPanelCollapsed: false');
      expect(action).not.toContain('toggleLeftPanel()');
    }
  });

  it('retains the established explicit toggle as the collapsed-state owner', () => {
    const toggleLeftPanel = extract(
      useAppSource,
      /const toggleLeftPanel = useCallback/,
      /const toggleRightPanel/,
    );

    expect(toggleLeftPanel).toContain(
      'leftPanelCollapsed: !state.layout.leftPanelCollapsed',
    );
  });
});
