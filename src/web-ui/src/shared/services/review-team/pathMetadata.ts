import type { ReviewTargetClassification } from '../reviewTargetClassifier';

// Content-free path metadata shared by risk, cache, summary, and evidence builders.
// Keep this module independent from manifest construction to avoid circular policy flow.

const SECURITY_SENSITIVE_PATH_PATTERN =
  /(^|[/._-])(auth|oauth|crypto|security|permission|permissions|secret|secrets|token|tokens|credential|credentials)([/._-]|$)/;

export interface WorkspaceAreaFileBucket {
  key: string;
  index: number;
  files: string[];
}

export function isSecuritySensitiveReviewPath(normalizedPath: string): boolean {
  return SECURITY_SENSITIVE_PATH_PATTERN.test(normalizedPath.toLowerCase());
}

const CRATE_LAYER_DIRS = new Set([
  'contracts',
  'interfaces',
  'adapters',
  'execution',
  'services',
  'assembly',
]);

export function workspaceAreaForReviewPath(normalizedPath: string): string {
  // Crates live at src/crates/<layer>/<crate>; the layer directory is not an
  // area identity, so skip it when present.
  const crateMatch = normalizedPath.match(/^src\/crates\/([^/]+)(?:\/([^/]+))?/);
  if (crateMatch) {
    const [, first, second] = crateMatch;
    const crateName = CRATE_LAYER_DIRS.has(first) && second ? second : first;
    return `crate:${crateName}`;
  }

  const appMatch = normalizedPath.match(/^src\/apps\/([^/]+)/);
  if (appMatch) {
    return `app:${appMatch[1]}`;
  }

  if (normalizedPath.startsWith('src/web-ui/')) {
    return 'web-ui';
  }

  if (normalizedPath.startsWith('Void-Installer/')) {
    return 'installer';
  }

  const [root] = normalizedPath.split('/');
  return root || 'unknown';
}

export function groupFilesByWorkspaceArea(files: string[]): WorkspaceAreaFileBucket[] {
  const buckets: WorkspaceAreaFileBucket[] = [];
  const bucketByKey = new Map<string, WorkspaceAreaFileBucket>();

  for (const file of files) {
    const key = workspaceAreaForReviewPath(file);
    let bucket = bucketByKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        index: buckets.length,
        files: [],
      };
      buckets.push(bucket);
      bucketByKey.set(key, bucket);
    }
    bucket.files.push(file);
  }

  return buckets;
}

export function includedReviewTargetFiles(target: ReviewTargetClassification): string[] {
  return target.files
    .filter((file) => !file.excluded)
    .map((file) => file.normalizedPath);
}

export function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
