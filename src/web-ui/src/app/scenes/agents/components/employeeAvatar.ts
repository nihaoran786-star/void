const EMPLOYEE_AVATAR_COUNT = 24;

const KNOWN_EMPLOYEE_AVATARS: Readonly<Record<string, number>> = {
  agentic: 1,
  cowork: 2,
  media: 3,
  computeruse: 4,
  plan: 5,
  debug: 6,
  multitask: 7,
  team: 8,
  deepresearch: 9,
  claw: 10,
  explore: 11,
  filefinder: 12,
  codereview: 13,
  generatedoc: 14,
  generalpurpose: 15,
  researchspecialist: 16,
  deepreview: 17,
  reviewbusinesslogic: 18,
  reviewperformance: 19,
  reviewsecurity: 20,
  reviewarchitecture: 21,
  reviewfrontend: 22,
  reviewjudge: 23,
  reviewfixer: 24,
};

function normalizeIdentity(identity: string): string {
  return identity.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
}

function hashIdentity(identity: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function resolveEmployeeAvatarIndex(identity: string): number {
  const normalizedIdentity = normalizeIdentity(identity);
  const scopedIdentity = identity.split('::').at(-1) ?? identity;
  const normalizedScopedIdentity = normalizeIdentity(scopedIdentity);
  const knownIndex = KNOWN_EMPLOYEE_AVATARS[normalizedIdentity]
    ?? KNOWN_EMPLOYEE_AVATARS[normalizedScopedIdentity];

  if (knownIndex) {
    return knownIndex;
  }

  const stableIdentity = identity.trim().toLocaleLowerCase('en-US') || 'void-employee';
  return (hashIdentity(stableIdentity) % EMPLOYEE_AVATAR_COUNT) + 1;
}

export function resolveEmployeeAvatarUrl(identity: string): string {
  const index = resolveEmployeeAvatarIndex(identity);
  return `/agent-avatars/employee-${String(index).padStart(2, '0')}.webp`;
}

export { EMPLOYEE_AVATAR_COUNT };
