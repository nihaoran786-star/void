import { describe, expect, it } from 'vitest';
import { readSourceText } from '@/test-utils/sourceText';

function readSource(relativePath: string): string {
  return readSourceText(new URL(relativePath, import.meta.url));
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

  it('loads the complete chat composer behind the session pane boundary', () => {
    const source = readSource('../scenes/session/ChatPane.tsx');
    const lazyChatInput = readSource(
      '../../flow_chat/components/LazyChatInput.tsx',
    );
    const flowChatBarrel = readSource('../../flow_chat/index.ts');

    expect(source).toContain(
      "from '../../../flow_chat/components/LazyChatInput'",
    );
    expect(source).not.toContain(
      "import { FlowChatContainer, ChatInput } from '../../../flow_chat'",
    );
    expect(lazyChatInput).toContain("await import('./ChatInput')");
    expect(lazyChatInput).toContain('<React.Suspense fallback={null}>');
    expect(flowChatBarrel).toContain(
      "export { LazyChatInput as ChatInput } from './components/LazyChatInput'",
    );
    expect(flowChatBarrel).not.toContain(
      "export { ChatInput } from './components/ChatInput'",
    );
  });

  it('loads the account settings and auth-session module only inside settings', () => {
    const settingsScene = readSource('../scenes/settings/SettingsScene.tsx');
    const accountSettings = readSource(
      '../scenes/settings/components/AccountSettings.tsx',
    );

    expect(settingsScene).toContain(
      "lazy(() => import('./components/AccountSettings'))",
    );
    expect(settingsScene).not.toContain(
      "import AccountSettings from './components/AccountSettings'",
    );
    expect(accountSettings).toContain("from '@/app/auth-session'");
    expect(accountSettings).not.toMatch(/localStorage|sessionStorage|invoke\(|@tauri-apps/);
  });

  it('loads the project-creation dialog only after the user opens it', () => {
    const appLayout = readSource('../layout/AppLayout.tsx');
    const dialogBarrel = readSource(
      '../components/NewProjectDialog/index.ts',
    );
    const lazyDialog = readSource(
      '../components/NewProjectDialog/LazyNewProjectDialog.tsx',
    );

    expect(appLayout).toContain(
      "from '../components/NewProjectDialog'",
    );
    expect(appLayout).not.toContain(
      "from '../components/NewProjectDialog/NewProjectDialog'",
    );
    expect(dialogBarrel).toContain(
      "LazyNewProjectDialog as NewProjectDialog",
    );
    expect(lazyDialog).toContain("await import('./NewProjectDialog')");
    expect(lazyDialog).toContain('if (!props.isOpen)');
  });

  it('loads the remote-connect implementation only after the user opens it', () => {
    const footer = readSource(
      '../components/NavPanel/components/PersistentFooterActions.tsx',
    );
    const dialogBarrel = readSource(
      '../components/RemoteConnectDialog/index.ts',
    );
    const lazyDialog = readSource(
      '../components/RemoteConnectDialog/LazyRemoteConnectDialog.tsx',
    );

    expect(footer).toContain(
      "from '../../RemoteConnectDialog'",
    );
    expect(footer).not.toContain(
      "from '../../RemoteConnectDialog/RemoteConnectDialog'",
    );
    expect(dialogBarrel).toContain(
      'LazyRemoteConnectDialog as RemoteConnectDialog',
    );
    expect(lazyDialog).toContain("await import('./RemoteConnectDialog')");
    expect(lazyDialog).toContain('if (!props.isOpen)');
  });

  it('loads media preview rendering only after a preview event opens it', () => {
    const overlay = readSource(
      '../../shared/services/preview/MediaPreviewOverlay.tsx',
    );
    const content = readSource(
      '../../shared/services/preview/MediaPreviewOverlayContent.tsx',
    );

    expect(overlay).toContain("import('./MediaPreviewOverlayContent')");
    expect(overlay).toContain('MEDIA_PREVIEW_EVENT');
    expect(overlay).not.toContain("from 'lucide-react'");
    expect(overlay).not.toContain("from '@/infrastructure/i18n'");
    expect(overlay).not.toContain("from '@/shared/services/workspace-media'");
    expect(overlay).not.toContain("import './MediaPreviewOverlay.scss'");
    expect(content).toContain("from 'lucide-react'");
    expect(content).toContain("from '@/shared/services/workspace-media'");
    expect(content).toContain("import './MediaPreviewOverlay.scss'");
    expect(content).not.toContain('MEDIA_PREVIEW_EVENT');
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
    expect(source).toContain(
      "const PANEL_LOADING_CLASS = 'void-flexible-panel__loading'",
    );
    expect(source).toMatch(
      /<React\.Suspense\s+fallback=\{<div className=\{PANEL_LOADING_CLASS\}>\{t\('loading\.text'\)\}<\/div>\}>\s*\{renderContent\(\)\}\s*<\/React\.Suspense>/,
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

  it('keeps the empty-canvas media entry independent of feature barrels', () => {
    const emptyState = readSource(
      '../components/panels/content-canvas/empty-state/EmptyState.tsx',
    );
    const tabBar = readSource(
      '../components/panels/content-canvas/tab-bar/TabBar.tsx',
    );

    expect(emptyState).toContain("from '../workspace-media/WorkspaceMediaEntry'");
    expect(emptyState).not.toContain('ShortDramaEntry');
    expect(tabBar).not.toContain('WorkspaceMediaEntry');
    expect(tabBar).not.toContain('ShortDramaEntry');
  });

  it('keeps startup config and workspace-media consumers on concrete module boundaries', () => {
    const configConsumers = [
      readSource('../layout/AppLayout.tsx'),
      readSource('../hooks/useDialogCompletionNotify.ts'),
      readSource('../../infrastructure/update/DailyAppUpdateGate.tsx'),
    ];
    const workspaceMediaEntryConsumers = [
      readSource(
        '../components/panels/content-canvas/empty-state/EmptyState.tsx',
      ),
    ];
    const flexiblePanel = readSource(
      '../components/panels/base/FlexiblePanel.tsx',
    );
    const app = readSource('../App.tsx');
    const chatInput = readSource('../../flow_chat/components/ChatInput.tsx');
    const gitEventService = readSource(
      '../../tools/git/services/GitEventService.ts',
    );
    const sessionsSection = readSource(
      '../components/NavPanel/sections/sessions/SessionsSection.tsx',
    );
    const deferredSessionsSection = readSource(
      '../components/NavPanel/sections/sessions/DeferredSessionsSection.tsx',
    );
    const mainNav = readSource('../components/NavPanel/MainNav.tsx');
    const workspaceItem = readSource(
      '../components/NavPanel/sections/workspaces/WorkspaceItem.tsx',
    );
    const profileScene = readSource('../scenes/profile/ProfileScene.tsx');
    const assistantScene = readSource('../scenes/assistant/AssistantScene.tsx');
    const nurseryView = readSource('../scenes/profile/views/NurseryView.tsx');
    const assistantConfigPage = readSource(
      '../scenes/profile/views/AssistantConfigPage.tsx',
    );

    for (const consumer of configConsumers) {
      expect(consumer).toContain(
        "from '@/infrastructure/config/services/ConfigManager'",
      );
      expect(consumer).not.toContain("from '@/infrastructure/config'");
    }

    for (const consumer of workspaceMediaEntryConsumers) {
      expect(consumer).toContain(
        "from '../workspace-media/WorkspaceMediaEntry'",
      );
      expect(consumer).not.toContain("from '../workspace-media'");
    }

    expect(flexiblePanel).toContain(
      "import('@/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery')",
    );
    expect(flexiblePanel).not.toContain(
      "import('@/app/components/panels/content-canvas/workspace-media')",
    );
    expect(chatInput).toContain("from '@/infrastructure/event-bus'");
    expect(chatInput).not.toMatch(/from ['"]@\/infrastructure['"]/);
    expect(app).toContain(
      "from '@/infrastructure/contexts/ChatProvider'",
    );
    expect(app).toContain(
      "from '@/infrastructure/hooks/useAIInitialization'",
    );
    expect(app).not.toMatch(
      /from ['"](?:@\/infrastructure|\.\.\/infrastructure)['"]/,
    );
    expect(gitEventService).toContain(
      "from '@/infrastructure/event-bus'",
    );
    expect(gitEventService).not.toMatch(
      /from ['"](?:@\/infrastructure|\.\.\/\.\.\/\.\.\/infrastructure)['"]/,
    );
    expect(deferredSessionsSection).toContain("lazy(() => import('./SessionsSection'))");
    expect(mainNav).toContain("from './sections/sessions/DeferredSessionsSection'");
    expect(mainNav).toContain(
      "const NavSearchDialog = React.lazy(() => import('./NavSearchDialog'))",
    );
    expect(mainNav).not.toContain("import NavSearchDialog from './NavSearchDialog'");
    expect(workspaceItem).toContain("from '../sessions/DeferredSessionsSection'");
    expect(sessionsSection).toContain(
      "from './sessionNavProjection'",
    );
    expect(sessionsSection).toContain('useSessionNavProjection(isVisible)');
    expect(sessionsSection).toContain(
      'useSessionRunningPresentation(',
    );
    expect(sessionsSection).toContain(
      'useSessionRunningPresentation(\n    sectionSessions,',
    );
    expect(profileScene).toContain('<NurseryView isActive={isActive} />');
    expect(assistantScene).toContain('isActive={isActive}');
    expect(nurseryView).toContain('<AssistantConfigPage isActive={isActive} />');
    expect(assistantConfigPage).toContain(
      "from '@/app/components/NavPanel/sections/sessions/DeferredSessionsSection'",
    );
    expect(assistantConfigPage).not.toContain(
      "from '@/app/components/NavPanel/sections/sessions/SessionsSection'",
    );
    expect(assistantConfigPage).toContain('isVisible={isActive}');
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

  it('keeps concrete Flow Chat tool cards outside the startup graph', () => {
    const flowToolCard = readSource('../../flow_chat/components/FlowToolCard.tsx');
    const flowToolCardErrorBoundary = readSource(
      '../../flow_chat/components/FlowToolCardErrorBoundary.tsx',
    );
    const registry = readSource('../../flow_chat/tool-cards/toolCardRegistry.tsx');
    const barrel = readSource('../../flow_chat/tool-cards/index.ts');
    const classification = readSource('../../flow_chat/tool-cards/toolCardClassification.ts');
    const modelRound = readSource('../../flow_chat/components/modern/ModelRoundItem.tsx');
    const store = readSource('../../flow_chat/store/modernFlowChatStore.ts');
    const mediaGroup = readSource('../../flow_chat/tool-cards/MediaGenerationToolGroupCard.tsx');
    const mediaGroupRenderer = readSource(
      '../../flow_chat/tool-cards/MediaGenerationToolGroupRenderer.tsx',
    );
    const componentRegistry = readSource('../../component-library/components/registry.tsx');

    expect(flowToolCard).toContain("from '../tool-cards/toolCardMetadata'");
    expect(flowToolCard).toContain("from '../tool-cards/toolCardRegistry'");
    expect(flowToolCard).not.toContain("from '../tool-cards'");
    expect(flowToolCard).toContain('<React.Suspense');
    expect(flowToolCardErrorBoundary).toContain('isChunkLoadError(this.state.error)');
    expect(flowToolCardErrorBoundary).toContain('reloadApplication()');

    for (const moduleName of [
      'ReadFileDisplay',
      'FileOperationToolCard',
      'TaskToolDisplay',
      'CreatePlanDisplay',
      'TerminalToolCard',
      'MCPToolDisplay',
      'DefaultToolCard',
      'MediaGenerationToolCard',
      'ViewImageToolCard',
    ]) {
      expect(registry).toContain(`import('./${moduleName}')`);
      expect(registry).not.toMatch(new RegExp(`from ['"]\\./${moduleName}['"]`));
    }

    expect(barrel).not.toContain("export { PlanDisplay } from './CreatePlanDisplay'");
    expect(classification).not.toContain("from 'react'");
    expect(classification).not.toContain('toolCardRegistry');
    expect(modelRound).toContain("from '../../tool-cards/toolCardClassification'");
    expect(modelRound).toContain(
      "from '../../tool-cards/MediaGenerationToolGroupRenderer'",
    );
    expect(modelRound).not.toContain(
      "from '../../tool-cards/MediaGenerationToolGroupCard'",
    );
    expect(mediaGroupRenderer).toContain("import('./MediaGenerationToolGroupCard')");
    expect(mediaGroupRenderer).toContain('<FlowToolCardErrorBoundary');
    expect(store).toContain("from '../tool-cards/toolCardClassification'");
    expect(mediaGroup).toContain("from './MediaGenerationToolCard'");
    expect(componentRegistry).toContain(
      "from '@/flow_chat/tool-cards/toolCardMetadata'",
    );
  });
});
