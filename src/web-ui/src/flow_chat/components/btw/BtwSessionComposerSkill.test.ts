import { describe, expect, it } from 'vitest';
import type { ModeSkillInfo } from '@/infrastructure/config/types';
import {
  buildChildSkillCommandMessage,
  filterRuntimeSkillsForChildComposer,
} from './BtwSessionComposerSkill';

function skill(
  name: string,
  overrides: Partial<ModeSkillInfo> = {},
): ModeSkillInfo {
  return {
    key: `user:${name}`,
    name,
    description: `${name} description`,
    path: `C:/skills/${name}`,
    level: 'user',
    sourceSlot: 'user',
    dirName: name,
    isBuiltin: false,
    defaultEnabled: true,
    effectiveEnabled: true,
    disabledByMode: false,
    selectedForRuntime: true,
    stateReason: 'custom_user_default_enabled',
    ...overrides,
  };
}

describe('BtwSessionComposerSkill', () => {
  it('keeps only skills that are enabled and selected for runtime', () => {
    const result = filterRuntimeSkillsForChildComposer([
      skill('剧本猫咪拯救法'),
      skill('被禁用', { effectiveEnabled: false }),
      skill('被同名覆盖', { selectedForRuntime: false }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({ name: '剧本猫咪拯救法' }),
    ]);
  });

  it('filters runtime skills by case-insensitive name query', () => {
    const result = filterRuntimeSkillsForChildComposer([
      skill('Script Rewrite'),
      skill('Image Prompt Polish'),
    ], 'image');

    expect(result.map(item => item.name)).toEqual(['Image Prompt Polish']);
  });

  it('converts a direct slash skill command into a normal child session message', () => {
    const result = buildChildSkillCommandMessage(
      '/skill 剧本猫咪拯救法 帮我重写第一场对白',
      [skill('剧本猫咪拯救法')],
    );

    expect(result).toEqual({
      kind: 'skill',
      message: 'Use the "剧本猫咪拯救法" skill. 帮我重写第一场对白',
      skillName: '剧本猫咪拯救法',
    });
  });

  it('matches the longest runtime skill name before taking the instruction text', () => {
    const result = buildChildSkillCommandMessage(
      '/skill Image Prompt Polish 生成一个雨夜车站分镜',
      [skill('Image'), skill('Image Prompt Polish')],
    );

    expect(result).toEqual({
      kind: 'skill',
      message: 'Use the "Image Prompt Polish" skill. 生成一个雨夜车站分镜',
      skillName: 'Image Prompt Polish',
    });
  });

  it('leaves non-skill messages unchanged', () => {
    expect(buildChildSkillCommandMessage('普通消息', [skill('Script')])).toEqual({
      kind: 'plain',
      message: '普通消息',
    });
  });

  it('does not treat slash commands with a longer prefix as /skill', () => {
    expect(buildChildSkillCommandMessage('/skills list', [skill('Script')])).toEqual({
      kind: 'plain',
      message: '/skills list',
    });
  });
});
