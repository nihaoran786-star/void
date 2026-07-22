import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('retired global theme debt', () => {
  it('does not ship the unused glass form system', () => {
    const stylesEntry = readSource('./index.scss');
    const utilityStyles = readSource('./utilities/index.css');
    const animationStyles = readSource('./utilities/animations.css');
    const retiredFormPath = fileURLToPath(
      new URL('./components/forms.css', import.meta.url),
    );

    expect(existsSync(retiredFormPath)).toBe(false);
    expect(stylesEntry).not.toContain("components/forms.css");

    for (const retiredSelector of [
      '.text-blue',
      '.bg-glass',
      '.border-focus',
      '.glass-panel',
      '.glass-button',
      '.glass-input',
      '.glass-base',
      '.glass-hover',
      '.glass-active',
      '.glass-top-shine',
      '.glass-gradient-overlay',
      '.hover-glow',
    ]) {
      expect(`${utilityStyles}\n${animationStyles}`).not.toContain(retiredSelector);
    }

    for (const retiredToken of [
      '--color-primary-400',
      '--color-primary-500',
      '--glass-bg-active',
      '--glass-bg-base',
      '--glass-bg-hover',
      '--glass-blur-base',
      '--glass-blur-sm',
      '--glass-shadow-base',
      '--glass-shadow-lg',
      '--glass-shadow-sm',
      '--glass-shadow-xl',
    ]) {
      expect(`${utilityStyles}\n${animationStyles}`).not.toContain(retiredToken);
    }
  });

  it('uses canonical semantic tokens for the remaining live consumers', () => {
    const sshDialog = readSource(
      '../../features/ssh-remote/SSHConnectionDialog.scss',
    );
    const smartRecommendations = readSource(
      '../../flow_chat/components/smart-recommendations/SmartRecommendations.scss',
    );

    expect(sshDialog).toContain('background: var(--status-success-bg);');
    expect(sshDialog).toContain('color: var(--status-success-text);');
    expect(sshDialog).not.toContain('--color-success-100');
    expect(sshDialog).not.toContain('--color-success-500');

    expect(smartRecommendations).toContain('background: var(--color-error);');
    expect(smartRecommendations).not.toContain('--color-danger-hover');
  });

  it('keeps live component consumers on defined theme contracts', () => {
    const notificationButton = readSource(
      '../components/TitleBar/NotificationButton.scss',
    );
    const miniAppScene = readSource('../scenes/miniapps/MiniAppScene.scss');
    const userMessage = readSource('../../flow_chat/components/UserMessage.scss');
    const retiredUserMessagePath = fileURLToPath(
      new URL('../../flow_chat/components/UserMessage.css', import.meta.url),
    );
    const toolCardCommon = readSource(
      '../../flow_chat/tool-cards/_tool-card-common.scss',
    );
    const taskToolDisplay = readSource(
      '../../flow_chat/tool-cards/TaskToolDisplay.scss',
    );
    const workspaceManager = readSource(
      '../../tools/workspace/components/WorkspaceManager.css',
    );

    expect(notificationButton).toContain('box-shadow: var(--shadow-sm);');
    expect(miniAppScene).toContain('box-shadow: var(--shadow-sm);');
    expect(`${notificationButton}\n${miniAppScene}`).not.toContain('--shadow-md');

    expect(existsSync(retiredUserMessagePath)).toBe(false);
    expect(userMessage).not.toContain('--tag-color');

    expect(toolCardCommon).toContain('var(--color-accent-400)');
    expect(toolCardCommon).not.toContain('--loading-color-light');
    expect(taskToolDisplay).toContain('background: var(--tool-card-bg-hover);');
    expect(taskToolDisplay).not.toContain('--tool-card-bg-tertiary');
    expect(workspaceManager).toContain('background-color: var(--element-bg-soft);');
    expect(workspaceManager).toContain('color: var(--color-text-secondary);');
    expect(workspaceManager).not.toContain('--secondary-bg');
  });

  it('exports the canonical layer scale for plain CSS consumers', () => {
    const tokens = readSource('../../component-library/styles/tokens.scss');
    const utilityStyles = readSource('./utilities/index.css');

    for (const layer of [
      'base',
      'decoration',
      'content',
      'header',
      'sticky',
      'bottom-bar',
      'floating',
      'dropdown',
      'overlay',
      'drawer',
      'modal',
      'modal-active',
      'fullscreen',
      'toast',
      'tooltip',
      'popover',
      'notification',
      'context-menu',
      'extreme',
    ]) {
      expect(tokens).toContain(`--z-${layer}: #{$z-${layer}};`);
    }

    expect(utilityStyles).toContain('.z-50 { z-index: var(--z-floating); }');
    expect(utilityStyles).not.toContain('.z-50 { z-index: var(--z-modal); }');
  });
});
