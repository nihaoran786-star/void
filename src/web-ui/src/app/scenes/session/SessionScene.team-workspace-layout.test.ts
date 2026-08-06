import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SessionScene.scss', import.meta.url),
  'utf8',
);

describe('SessionScene Team Workspace layout contract', () => {
  it('在窄屏使用边界内右侧覆盖层，不挤出主会话和画布', () => {
    expect(source).toMatch(
      /\.void-session-scene__team-workspace\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*12px;[\s\S]*?width:\s*min\(368px, calc\(100% - 24px\)\);[\s\S]*?min-width:\s*0;/,
    );
  });

  it('在宽屏只使用一个稳定第三列，左侧会话与中间画布可收缩', () => {
    expect(source).toMatch(
      /@media \(min-width:\s*1280px\)[\s\S]*?\.void-session-scene--has-team-workspace[\s\S]*?\.void-session-scene__chat-pane\s*\{[\s\S]*?flex:\s*1 1 400px;[\s\S]*?max-width:\s*min\(520px, 36%\);/,
    );
    expect(source).toMatch(
      /@media \(min-width:\s*1280px\)[\s\S]*?\.void-session-scene__aux-pane:not\(\.void-session-scene__aux-pane--collapsed\)[\s\S]*?flex:\s*1 1 auto;[\s\S]*?max-width:\s*calc\(100% - 741px\);/,
    );
    expect(source).toMatch(
      /@media \(min-width:\s*1280px\)[\s\S]*?\.void-session-scene__team-workspace\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*clamp\(340px, 23vw, 400px\);[\s\S]*?flex:\s*0 0 clamp\(340px, 23vw, 400px\);/,
    );
  });
});
