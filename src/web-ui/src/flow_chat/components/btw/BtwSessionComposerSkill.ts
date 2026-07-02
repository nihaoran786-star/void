import type { ModeSkillInfo } from '@/infrastructure/config/types';

export type ChildComposerSkillCommand =
  | {
      kind: 'plain';
      message: string;
    }
  | {
      kind: 'skill';
      message: string;
      skillName: string;
    };

export function filterRuntimeSkillsForChildComposer(
  skills: ModeSkillInfo[],
  query = '',
): ModeSkillInfo[] {
  const normalizedQuery = query.trim().toLowerCase();
  return skills
    .filter(skill => skill.effectiveEnabled && skill.selectedForRuntime)
    .filter(skill => {
      if (!normalizedQuery) {
        return true;
      }
      return skill.name.toLowerCase().includes(normalizedQuery)
        || skill.key.toLowerCase().includes(normalizedQuery)
        || skill.description.toLowerCase().includes(normalizedQuery);
    });
}

export function buildChildSkillCommandMessage(
  input: string,
  runtimeSkills: Pick<ModeSkillInfo, 'name'>[],
): ChildComposerSkillCommand {
  const trimmed = input.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed !== '/skill' && !lowerTrimmed.startsWith('/skill ')) {
    return { kind: 'plain', message: input };
  }

  const remaining = trimmed.slice('/skill'.length).trim();
  if (!remaining) {
    return { kind: 'plain', message: input };
  }

  const matchedSkill = [...runtimeSkills]
    .sort((left, right) => right.name.length - left.name.length)
    .find(skill => {
      const lowerRemaining = remaining.toLowerCase();
      const lowerName = skill.name.toLowerCase();
      return lowerRemaining === lowerName || lowerRemaining.startsWith(`${lowerName} `);
    });

  const skillName = matchedSkill?.name ?? remaining.split(/\s+/, 1)[0];
  const instruction = remaining.slice(skillName.length).trim();
  const message = instruction
    ? `Use the "${skillName}" skill. ${instruction}`
    : `Use the "${skillName}" skill.`;

  return {
    kind: 'skill',
    message,
    skillName,
  };
}
