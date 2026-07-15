import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('Web UI startup import boundaries', () => {
  it('keeps Monaco runtime configuration out of the application entry', () => {
    const source = readSource('../../main.tsx');

    for (const forbidden of [
      '@monaco-editor/react',
      'editor.main.css',
      'MonacoEnvironment',
      'getMonacoPath',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps application theme state editor agnostic', () => {
    const source = readSource('../../infrastructure/theme/core/ThemeService.ts');
    const themeBarrel = readSource('../../infrastructure/theme/index.ts');
    expect(source).not.toContain('MonacoThemeSync');
    expect(source).not.toContain('monacoThemeSync');
    expect(themeBarrel).not.toContain('MonacoThemeSync');
    expect(themeBarrel).not.toContain('monacoThemeSync');
  });

  it('keeps settings outside the primary session scene bundle', () => {
    const source = readSource('../scenes/SceneViewport.tsx');

    expect(source).toContain("import SessionScene from './session/SessionScene'");
    expect(source).toContain("lazy(() => import('./settings/SettingsScene'))");
    expect(source).not.toContain("import SettingsScene from './settings/SettingsScene'");
  });

  it('loads optional panel implementations from concrete module boundaries', () => {
    const source = readSource('../components/panels/base/FlexiblePanel.tsx');
    const componentLibraryBarrel = readSource('../../component-library/components/index.ts');
    const componentLibraryCodeEditor = readSource(
      '../../component-library/components/CodeEditor/index.ts',
    );

    expect(source).not.toContain("from '@/tools/editor'");
    expect(source).not.toContain(
      "from '@/tools/git/components/GitDiffEditor/GitDiffEditor'",
    );
    expect(source).toContain("import('@/tools/editor/components/CodeEditor')");
    expect(source).toContain("import('@/tools/editor/components/MarkdownEditor')");
    expect(source).toContain("import('@/tools/editor/components/ImageViewer')");
    expect(source).toContain("import('@/tools/editor/components/DiffEditor')");
    expect(source).toContain(
      "import('@/tools/git/components/GitDiffEditor/GitDiffEditor')",
    );
    expect(source).toContain(
      "import('@/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel')",
    );
    expect(source).toContain('default: module.ShortDramaCenterPanel');
    expect(source).toMatch(
      /<React\.Suspense\s+fallback=\{<div className="void-flexible-panel__loading">\{t\('loading\.text'\)\}<\/div>\}>\s*\{renderContent\(\)\}\s*<\/React\.Suspense>/,
    );
    expect(componentLibraryBarrel).toContain("export * from './CodeEditor'");
    expect(componentLibraryCodeEditor).toContain("lazy(() => import('./CodeEditor'))");
    expect(componentLibraryCodeEditor).toContain("export type { CodeEditorProps }");
    expect(componentLibraryCodeEditor).not.toContain(
      "export { CodeEditor } from './CodeEditor'",
    );
  });

  it('loads terminal implementations from concrete module boundaries', () => {
    const terminalToolCard = readSource(
      '../../flow_chat/tool-cards/TerminalToolCard.tsx',
    );
    const flexiblePanel = readSource('../components/panels/base/FlexiblePanel.tsx');
    const shellNav = readSource('../scenes/shell/ShellNav.tsx');
    const terminalSessions = readSource(
      '../scenes/shell/hooks/useTerminalSessions.ts',
    );
    const basicsConfig = readSource(
      '../../infrastructure/config/components/BasicsConfig.tsx',
    );

    expect(terminalToolCard).toContain(
      "from '@/tools/terminal/components/LazyTerminalOutputRenderer'",
    );
    expect(terminalToolCard).not.toContain("from '@/tools/terminal/components'");
    expect(flexiblePanel).toContain(
      "import('@/tools/terminal/components/ConnectedTerminal')",
    );
    expect(flexiblePanel).not.toContain("import('@/tools/terminal')");
    expect(shellNav).toContain(
      "from '@/tools/terminal/services/TerminalService'",
    );
    expect(shellNav).toContain("from '@/tools/terminal/types/session'");
    expect(terminalSessions).toContain(
      "from '@/tools/terminal/services/TerminalService'",
    );
    expect(basicsConfig).toContain(
      "from '@/tools/terminal/services/TerminalService'",
    );
  });

  it('keeps the Markdown facade lightweight while preserving call sites', () => {
    const markdownFacade = readSource(
      '../../component-library/components/Markdown/index.ts',
    );
    const modelThinkingDisplay = readSource(
      '../../flow_chat/tool-cards/ModelThinkingDisplay.tsx',
    );
    const taskToolDisplay = readSource(
      '../../flow_chat/tool-cards/TaskToolDisplay.tsx',
    );

    expect(markdownFacade).toContain("import('./Markdown')");
    expect(markdownFacade).toContain("lazy(() =>");
    expect(markdownFacade).toContain("String(content ?? '')");
    expect(markdownFacade).toContain("whiteSpace: 'pre-wrap'");
    expect(markdownFacade).not.toContain("export { Markdown } from './Markdown'");
    expect(modelThinkingDisplay).toContain(
      "from '@/component-library/components/Markdown'",
    );
    expect(taskToolDisplay).toContain(
      "from '@/component-library/components/Markdown'",
    );
  });

  it('keeps lightweight short-drama entries independent of the feature barrel', () => {
    const emptyState = readSource(
      '../components/panels/content-canvas/empty-state/EmptyState.tsx',
    );
    const tabBar = readSource(
      '../components/panels/content-canvas/tab-bar/TabBar.tsx',
    );

    expect(emptyState).toContain("from '../short-drama/ShortDramaEntry'");
    expect(tabBar).toContain("from '../short-drama/ShortDramaEntry'");
  });

  it('defers Monaco registry lookup until the DOM fast path misses', () => {
    const activeEditTargetService = readSource(
      '../../tools/editor/services/ActiveEditTargetService.ts',
    );
    const monacoHelper = readSource('../../shared/helpers/MonacoHelper.ts');
    const commands = [
      readSource('../../shared/context-menu-system/commands/builtin/CutCommand.ts'),
      readSource('../../shared/context-menu-system/commands/builtin/PasteCommand.ts'),
      readSource('../../shared/context-menu-system/commands/builtin/SelectAllCommand.ts'),
    ];

    expect(activeEditTargetService).toContain(
      "import type * as monaco from 'monaco-editor'",
    );
    expect(monacoHelper).toContain("import type * as monaco from 'monaco-editor'");
    expect(monacoHelper).not.toContain("import * as monaco from 'monaco-editor'");
    expect(monacoHelper).toContain("await import('monaco-editor')");
    expect(monacoHelper.indexOf("['__monaco_editor__']")).toBeLessThan(
      monacoHelper.indexOf("await import('monaco-editor')"),
    );

    for (const command of commands) {
      expect(command).toContain('await MonacoHelper.getEditorFromElement');
    }
  });
});
