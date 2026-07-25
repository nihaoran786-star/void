const SKILL_REFERENCE_PREFIX = '[[void-skill:';
const SKILL_REFERENCE_PATTERN = /\[\[void-skill:([^\]\r\n]+)\]\]/g;

export interface SkillPromptReferenceMatch {
  token: string;
  name: string;
  start: number;
  end: number;
}

export function createSkillPromptReferenceToken(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('Skill name is required');
  }
  return `${SKILL_REFERENCE_PREFIX}${encodeURIComponent(normalized)}]]`;
}

export function parseSkillPromptReferenceToken(token: string): string | null {
  const match = /^\[\[void-skill:([^\]\r\n]+)\]\]$/.exec(token);
  if (!match) return null;
  try {
    const name = decodeURIComponent(match[1]).trim();
    return name || null;
  } catch {
    return null;
  }
}

export function getSkillPromptReferenceMatches(text: string): SkillPromptReferenceMatch[] {
  const matches: SkillPromptReferenceMatch[] = [];
  SKILL_REFERENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SKILL_REFERENCE_PATTERN.exec(text)) !== null) {
    const name = parseSkillPromptReferenceToken(match[0]);
    if (name) {
      matches.push({
        token: match[0],
        name,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return matches;
}

export function expandSkillPromptReferences(text: string): string {
  return text.replace(SKILL_REFERENCE_PATTERN, (token) => {
    const name = parseSkillPromptReferenceToken(token);
    return name ? `Please use the Skill tool with command "${name}".` : token;
  });
}
