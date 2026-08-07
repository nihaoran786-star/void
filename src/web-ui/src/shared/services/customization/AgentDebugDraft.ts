export interface AgentDebugDraft {
  displayName: string;
  description: string;
  prompt: string;
  tools: string[];
  readonly: boolean;
  review: boolean;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

function canonicalizeTools(tools: readonly string[]): string[] {
  const trimmed = tools.map((tool) => tool.trim()).filter((tool) => tool.length > 0);
  return Array.from(new Set(trimmed)).sort();
}

export function computeAgentDraftFingerprint(draft: AgentDebugDraft): string {
  const canonical = {
    displayName: draft.displayName.trim(),
    description: draft.description.trim(),
    prompt: draft.prompt.trim(),
    tools: canonicalizeTools(draft.tools),
    readonly: draft.readonly,
    review: draft.review,
  };
  const hash = fnv1a32(JSON.stringify(canonical));
  return hash.toString(16).padStart(8, '0');
}
