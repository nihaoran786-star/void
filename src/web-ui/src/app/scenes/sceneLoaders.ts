/**
 * Scene chunk loaders shared by SceneViewport and intent-based navigation preloads.
 * Keep these as concrete imports so opening one catalog does not pull in the others.
 */

export const loadSettingsScene = () => import('./settings/SettingsScene');
export const loadTerminalScene = () => import('./terminal/TerminalScene');
export const loadGitScene = () => import('./git/GitScene');
export const loadFileViewerScene = () => import('./file-viewer/FileViewerScene');
export const loadProfileScene = () => import('./profile/ProfileScene');
export const loadAgentsScene = () => import('./agents/AgentsScene');
export const loadSkillsScene = () => import('./skills/SkillsScene');
export const loadConnectorsScene = () => import('./connectors/ConnectorsScene');
export const loadMiniAppGalleryScene = () => import('./miniapps/MiniAppGalleryScene');
export const loadBrowserScene = () => import('./browser/BrowserScene');
export const loadInsightsScene = () => import('./my-agent/InsightsScene');
export const loadAutomationScene = () => import('./automation/AutomationScene');
export const loadShellScene = () => import('./shell/ShellScene');
export const loadWelcomeScene = () => import('./welcome/WelcomeScene');
export const loadMiniAppScene = () => import('./miniapps/MiniAppScene');
export const loadPanelViewScene = () => import('./panel-view/PanelViewScene');

const preload = (loader: () => Promise<unknown>): void => {
  void loader().catch(() => undefined);
};

export const preloadAgentsScene = (): void => preload(loadAgentsScene);
export const preloadSkillsScene = (): void => preload(loadSkillsScene);
export const preloadConnectorsScene = (): void => preload(loadConnectorsScene);
