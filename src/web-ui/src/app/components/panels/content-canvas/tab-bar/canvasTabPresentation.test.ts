import { describe, expect, it } from 'vitest';
import type { CanvasTab } from '../types';
import {
  getCanvasTabDisplayTitle,
  orderCanvasTabsForPresentation,
} from './canvasTabPresentation';

const createTab = (
  title: string,
  shortDramaStage?: string,
): CanvasTab => ({
  id: title,
  title,
  content: {
    type: 'btw-session',
    title,
    metadata: shortDramaStage ? { shortDramaStage } : undefined,
  },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
});

const labels: Record<string, string> = {
  'shortDrama.tabs.script': '剧本',
  'shortDrama.tabs.assets': '资产',
  'shortDrama.tabs.storyboards': '分镜',
  'shortDrama.tabs.video': '视频',
  'shortDrama.tabs.post': '后期',
};

describe('getCanvasTabDisplayTitle', () => {
  it.each([
    ['ScriptAI', 'script', '剧本 AI'],
    ['AssetAI', 'assets', '资产 AI'],
    ['SplitAI', 'storyboards', '分镜 AI'],
    ['VideoAI', 'video', '视频 AI'],
    ['EditorAI', 'post', '后期 AI'],
  ])('projects %s through its stage metadata', (title, stage, expected) => {
    expect(getCanvasTabDisplayTitle(
      createTab(title, stage),
      key => labels[key] ?? key,
    )).toBe(expected);
  });

  it('leaves ordinary and malformed runtime titles unchanged', () => {
    expect(getCanvasTabDisplayTitle(
      createTab('浏览器'),
      key => labels[key] ?? key,
    )).toBe('浏览器');
    expect(getCanvasTabDisplayTitle(
      createTab('External AI', 'unknown'),
      key => labels[key] ?? key,
    )).toBe('External AI');
  });

  it('sorts only stage-agent slots and preserves ordinary tool positions', () => {
    const browser = {
      ...createTab('浏览器'),
      content: { type: 'browser' as const, title: '浏览器' },
    };
    const tabs = [
      browser,
      createTab('EditorAI', 'post'),
      createTab('VideoAI', 'video'),
      createTab('SplitAI', 'storyboards'),
      createTab('AssetAI', 'assets'),
      createTab('ScriptAI', 'script'),
    ];

    expect(orderCanvasTabsForPresentation(tabs).map(tab => tab.title)).toEqual([
      '浏览器',
      'ScriptAI',
      'AssetAI',
      'SplitAI',
      'VideoAI',
      'EditorAI',
    ]);
    expect(tabs.map(tab => tab.title)).toEqual([
      '浏览器',
      'EditorAI',
      'VideoAI',
      'SplitAI',
      'AssetAI',
      'ScriptAI',
    ]);
  });
});
