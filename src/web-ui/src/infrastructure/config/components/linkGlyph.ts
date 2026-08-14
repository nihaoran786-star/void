/**
 * Connector link glyph — a deterministic link route per connector identity.
 *
 * Agents get animated orb avatars (living things), skills get static sigils
 * (tools); connectors get link glyphs (channels) — two endpoints joined by a
 * route whose shape derives from the identity hash, so every connector owns a
 * permanent path. Connection state is the only motion: connected renders a
 * solid route, idle breaks it into dashes, connecting sends one pulse along
 * the path (the single moment a channel is literally alive), and error keeps
 * the break in the error ink. Ink always comes from `currentColor`.
 */

export type ConnectorLinkState = 'connected' | 'idle' | 'connecting' | 'error';

/** Four deterministic routes: straight / arc up / arc down / polyline. */
export const LINK_PATHS: readonly string[] = [
  'M3,10 L17,10',
  'M3,10 Q10,2 17,10',
  'M3,10 Q10,18 17,10',
  'M3,10 L7,6 L13,14 L17,10',
];

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveLinkPath(identity: string): string {
  return LINK_PATHS[fnv1a(`link:${identity}`) % LINK_PATHS.length];
}
