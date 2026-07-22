import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

type DebtMultiset = Map<string, number>;

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const excludedPathSegment =
  /(^|\/)(?:preview|generated|dist|node_modules|__tests__|tests?)(?:\/|$)/;
const excludedStylesheet = /\.(?:test|spec)\.(?:scss|css)$/;
const directPixelFontSize =
  /(?<![-\w])font-size\s*:\s*(\d+(?:\.\d+)?)px\b/g;

const baseline = `
app/components/AgentCompanionDesktopPet/AgentCompanionDesktopPet.scss|10:2,11:1
app/components/GalleryLayout/GalleryLayout.scss|10:1,11:1
app/components/MCPInteractionDialog/MCPInteractionDialog.scss|12:4
app/components/NavPanel/sections/workspaces/WorkspaceRelatedPathsDialog.scss|11:2,12:4,14:1
app/components/panels/BranchSelectModal.scss|10:1,12:3,13:2,14:1
app/components/panels/DiffFullscreenViewer.css|11:1,12:2,13:2,14:2
app/components/panels/FilesPanel.scss|10:3,11:4
app/components/panels/TerminalEditModal.scss|11:1,12:2,13:1,14:1
app/components/panels/base/PanelHeader.scss|12:1
app/components/panels/content-canvas/anchor-zone/AnchorZone.scss|12:1
app/components/panels/content-canvas/editor-area/DropZone.scss|12:1
app/components/panels/content-canvas/editor-area/EditorGroup.scss|13:1
app/components/panels/content-canvas/empty-state/EmptyState.scss|16:1
app/components/panels/content-canvas/mission-control/MissionControl.scss|9:1,10:1,11:2,12:2
app/components/panels/content-canvas/mission-control/SearchFilter.scss|11:1
app/components/panels/content-canvas/mission-control/ThumbnailCard.scss|8:1,9:2,10:1,11:1
app/components/panels/content-canvas/quick-look/QuickLook.scss|11:1,13:1
app/components/panels/content-canvas/tab-bar/Tab.scss|10:1,12:1
app/components/panels/content-canvas/tab-bar/TabOverflowMenu.scss|8:1,10:1,12:3
app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.scss|12:1
app/layout/FloatingMiniChat.scss|12:2
app/scenes/miniapps/components/MiniAppCard.scss|10:2
app/scenes/terminal/TerminalScene.scss|13:1
app/styles/global.scss|16:1
component-library/components/Switch/Switch.scss|9:1,11:1
component-library/components/TextStrokeEffect/TextStrokeEffect.scss|72:3
flow_chat/components/ChatInputPixelPet.scss|30:1,40:1,54:1
flow_chat/components/DeepReviewConsentDialog.scss|10.5:1,21:1
flow_chat/components/ImageAnalysisCard.scss|14:1
flow_chat/components/TurnHistoryPanel.scss|14:3,16:1
flow_chat/components/modern/ExportImageButton.scss|14:1,16:1
flow_chat/components/subagent/SubagentProjectionView.scss|12:1
flow_chat/components/usage/SessionUsagePanel.scss|14:1,16:1
flow_chat/tool-cards/MediaGenerationToolCard.scss|10:1,11:4,12:4
flow_chat/tool-cards/SnapshotFullscreenDiffViewer.css|14:3,16:1
infrastructure/i18n/components/LanguageSelector.scss|11:1,12:1,13:4,14:1,16:1
infrastructure/update/UpdateAvailableDialog.scss|11:1,12:3,13:2
infrastructure/update/UpdateInstallProgressModal.scss|12:1,13:1
shared/announcement-system/styles/FeatureModal.scss|11:2,12:1,13:2,13.5:1,22:1
tools/file-system/styles/FileExplorer.scss|11:1
tools/generative-widget/GenerativeWidgetPanel.scss|12:3,13:1
tools/lsp/components/ReferencesPanel/ReferencesPanel.scss|11:2
tools/terminal/components/Terminal.scss|11:1,12:1,13:1,14:2,32:1
tools/workspace/components/WorkspaceManager.css|11:2,12:7,14:1,16:2,18:2
`.trim();

const parseBaseline = (source: string): DebtMultiset => {
  const parsed = new Map<string, number>();

  for (const line of source.split('\n')) {
    const [path, sizes] = line.trim().split('|');
    for (const entry of sizes.split(',')) {
      const [size, count] = entry.split(':');
      parsed.set(`${path}|${size}`, Number(count));
    }
  }

  return parsed;
};

const walkStylesheets = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkStylesheets(path);
    }
    return entry.isFile() && /\.(?:scss|css)$/.test(entry.name) ? [path] : [];
  });

const scanDebt = (): DebtMultiset => {
  const debt = new Map<string, number>();

  for (const path of walkStylesheets(sourceRoot)) {
    const relativePath = relative(sourceRoot, path).split(sep).join('/');
    if (
      excludedPathSegment.test(relativePath) ||
      excludedStylesheet.test(relativePath)
    ) {
      continue;
    }

    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(directPixelFontSize)) {
      const key = `${relativePath}|${match[1]}`;
      debt.set(key, (debt.get(key) ?? 0) + 1);
    }
  }

  return debt;
};

const findGrowth = (
  current: DebtMultiset,
  allowed: DebtMultiset,
): string[] =>
  [...current.entries()]
    .filter(([key, count]) => count > (allowed.get(key) ?? 0))
    .map(
      ([key, count]) =>
        `${key}: current ${count}, allowed ${allowed.get(key) ?? 0}`,
    )
    .sort();

describe('production font-size debt governance', () => {
  const allowedDebt = parseBaseline(baseline);

  it('locks the exact per-file and per-value baseline while allowing reductions', () => {
    expect([...allowedDebt.values()].reduce((sum, count) => sum + count, 0))
      .toBe(158);
    expect(findGrowth(scanDebt(), allowedDebt)).toEqual([]);
  });

  it('detects both count growth and a new file/value pair', () => {
    const mutated = new Map(allowedDebt);
    const existingKey =
      'app/components/MCPInteractionDialog/MCPInteractionDialog.scss|12';
    mutated.set(existingKey, (mutated.get(existingKey) ?? 0) + 1);
    mutated.set('app/components/SyntheticDialog.scss|17', 1);

    expect(findGrowth(mutated, allowedDebt)).toEqual([
      'app/components/MCPInteractionDialog/MCPInteractionDialog.scss|12: current 5, allowed 4',
      'app/components/SyntheticDialog.scss|17: current 1, allowed 0',
    ]);
  });
});
