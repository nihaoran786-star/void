import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./TeamWorkspacePanel.scss', import.meta.url),
  'utf8',
);

describe('TeamWorkspacePanel 曜岩/霜白 visual contract', () => {
  it('顶栏与对话条一致:36px 细栏,本身即拖拽区', () => {
    expect(source).toMatch(
      /&__map-topbar \{[\s\S]*?min-height: 36px;[\s\S]*?border-bottom: 1px solid var\(--border-subtle\);/,
    );
    expect(source).toMatch(/&__map-topbar-live \{[\s\S]*?color: var\(--color-accent-500\);/);
    expect(source).toMatch(/&__strip, &__map-topbar \{ cursor: grab; \}/);
    expect(source).not.toMatch(/__map-brow/);
  });

  it('成员是一枚 8px 状态点,主理人是 11px 实心点,且没有悬停放大或旋转装饰', () => {
    expect(source).toMatch(/&__map-member-point \{[\s\S]*?width: 8px;[\s\S]*?border-radius: 50%;/);
    expect(source).toMatch(
      /&__map-member\[data-tone='info'\] &__map-member-point \{ background: var\(--color-accent-500\); \}/,
    );
    expect(source).toMatch(/&__map-lead-point \{[\s\S]*?width: 11px;/);
    expect(source).toMatch(/&\[data-running\] &__map-lead-point \{[\s\S]*?outline:/);
    expect(source).not.toMatch(/transform:\s*scale\(1\.4\)/);
    expect(source).not.toMatch(/conic-gradient/);
    expect(source).not.toMatch(/team-workspace-(sonar|march|orbit)/);
    expect(source).not.toMatch(/__map-member-orb/);
    expect(source).not.toMatch(/__map-lead-orb/);
  });

  it('关闭按钮默认可发现,悬停只提升不透明度', () => {
    expect(source).toMatch(
      /&__icon-button--floating \{[\s\S]*?opacity:\s*\.72;[\s\S]*?var\(--workspace-motion-fast\)/,
    );
    expect(source).toMatch(/&:hover &__icon-button--floating,[\s\S]*?opacity:\s*1;/);
  });

  it('阶段是一根发丝进度线,不再是分段色块', () => {
    expect(source).toMatch(/&__map-phases-track \{[\s\S]*?height: 1px;[\s\S]*?background: var\(--border-base\);/);
    expect(source).toMatch(/&__map-phases-fill \{[\s\S]*?background: var\(--color-accent-500\);/);
    expect(source).not.toMatch(/__map-segbar/);
  });

  it('成员切换是纯文字标签,激活态只有一条 1px accent 下划线', () => {
    expect(source).toMatch(/&__member-tab \{[\s\S]*?border: 0;[\s\S]*?letter-spacing: \.06em;/);
    expect(source).toMatch(
      /&__member-tab\[data-active\]::after \{[\s\S]*?height: 1px;[\s\S]*?background: var\(--color-accent-500\);/,
    );
    expect(source).not.toMatch(/__member-switch/);
    expect(source).not.toMatch(/__strip-switcher/);
  });
});
