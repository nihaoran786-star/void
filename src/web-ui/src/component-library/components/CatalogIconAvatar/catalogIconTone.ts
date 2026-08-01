const CATALOG_ICON_TONE_COUNT = 6;

function hashIdentity(identity: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function resolveCatalogIconTone(identity: string): number {
  const stableIdentity = identity.trim().toLocaleLowerCase('en-US') || 'void-capability';
  return hashIdentity(stableIdentity) % CATALOG_ICON_TONE_COUNT;
}
