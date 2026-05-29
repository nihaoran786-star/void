import { convertFileSrc } from '@tauri-apps/api/core';
import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import type {
  WorkspaceMediaError,
  WorkspaceMediaItem,
  WorkspaceMediaKind,
  WorkspaceMediaLibraryService,
  WorkspaceMediaLibraryState,
  WorkspaceMediaNode,
  WorkspaceMediaNodeAdapter,
  WorkspaceMediaSource,
} from './WorkspaceMediaTypes';
import { joinWorkspaceMediaPath } from './WorkspaceMediaPaths';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  'target',
  'coverage',
  '.turbo',
  '.vite',
]);

const MANAGED_MEDIA_SOURCES: Array<{ source: WorkspaceMediaSource; relativePath: string; createIfMissing: boolean }> = [
  { source: 'generated', relativePath: 'media/generated', createIfMissing: true },
  { source: 'input', relativePath: 'media/input', createIfMissing: true },
  { source: 'generated', relativePath: '.void/media/generated', createIfMissing: false },
  { source: 'input', relativePath: '.void/media/uploads', createIfMissing: false },
];

interface WorkspaceMediaLibraryOptions {
  maxResults?: number;
  maxVisitedDirectories?: number;
}

interface WorkspaceMediaSourceRoot {
  source: WorkspaceMediaSource;
  path: string;
  createIfMissing: boolean;
}

interface WorkspaceMediaPendingDirectory {
  source: WorkspaceMediaSource;
  path: string;
}

const DEFAULT_OPTIONS: Required<WorkspaceMediaLibraryOptions> = {
  maxResults: 500,
  maxVisitedDirectories: 1500,
};

export function getMediaKindForPath(filePath: string): WorkspaceMediaKind | null {
  const extension = getExtension(filePath);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return null;
}

export function shouldIgnoreWorkspaceMediaDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name.trim().toLowerCase());
}

function getExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspace = normalizeSlashes(workspacePath).replace(/\/+$/, '');
  const normalizedFile = normalizeSlashes(filePath);
  const prefix = `${normalizedWorkspace}/`;
  return normalizedFile.startsWith(prefix) ? normalizedFile.slice(prefix.length) : normalizedFile;
}

function stableId(filePath: string): string {
  let hash = 0;
  for (let index = 0; index < filePath.length; index += 1) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(index);
    hash |= 0;
  }
  return `workspace-media-${Math.abs(hash).toString(36)}`;
}

function previewUrlForPath(filePath: string): string | undefined {
  try {
    return convertFileSrc(filePath);
  } catch {
    return undefined;
  }
}

function errorState(code: WorkspaceMediaError['code'], message: string, cause?: unknown): WorkspaceMediaError {
  return { code, message, cause };
}

function hasWorkspacePath(workspacePath?: string): workspacePath is string {
  return typeof workspacePath === 'string' && workspacePath.trim().length > 0;
}

function toMediaItem(
  workspacePath: string,
  node: WorkspaceMediaNode,
  kind: WorkspaceMediaKind,
  source: WorkspaceMediaSource
): WorkspaceMediaItem {
  const fileName = node.name || getFileName(node.path);
  const item: WorkspaceMediaItem = {
    id: stableId(node.path),
    kind,
    source,
    filePath: node.path,
    relativePath: relativePath(workspacePath, node.path),
    fileName,
    extension: getExtension(fileName || node.path),
  };

  if (typeof node.sizeBytes === 'number') {
    item.sizeBytes = node.sizeBytes;
  }
  if (typeof node.modifiedAt === 'number') {
    item.modifiedAt = node.modifiedAt;
  }

  const previewUrl = previewUrlForPath(node.path);
  if (previewUrl) {
    item.previewUrl = previewUrl;
    if (kind === 'image') {
      item.thumbnailUrl = previewUrl;
    }
  }

  return item;
}

export function createWorkspaceMediaLibraryService(
  adapter: WorkspaceMediaNodeAdapter,
  options: WorkspaceMediaLibraryOptions = {}
): WorkspaceMediaLibraryService {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };

  const walk = async (
    workspacePath: string,
    mode: 'availability' | 'library'
  ): Promise<{ items: WorkspaceMediaItem[]; truncated: boolean }> => {
    const sourceRoots: WorkspaceMediaSourceRoot[] = MANAGED_MEDIA_SOURCES.map((entry) => ({
      source: entry.source,
      path: joinWorkspaceMediaPath(workspacePath, entry.relativePath),
      createIfMissing: entry.createIfMissing,
    }));
    const sourceRootPaths = new Set(sourceRoots.map(root => normalizeSlashes(root.path)));
    const pendingDirectories: WorkspaceMediaPendingDirectory[] = sourceRoots.map(root => ({
      source: root.source,
      path: root.path,
    }));
    const items: WorkspaceMediaItem[] = [];
    let visitedDirectories = 0;
    let truncated = false;

    if (adapter.ensureDirectory) {
      for (const root of sourceRoots) {
        if (root.createIfMissing) {
          await adapter.ensureDirectory(root.path);
        }
      }
    }

    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.shift();
      if (!currentDirectory) break;

      visitedDirectories += 1;
      if (visitedDirectories > resolvedOptions.maxVisitedDirectories) {
        truncated = true;
        break;
      }

      let children: WorkspaceMediaNode[];
      try {
        children = await adapter.listChildren(currentDirectory.path);
      } catch (error) {
        if (sourceRootPaths.has(normalizeSlashes(currentDirectory.path))) {
          continue;
        }
        throw error;
      }

      for (const child of children) {
        if (child.isDirectory) {
          if (!shouldIgnoreWorkspaceMediaDirectory(child.name)) {
            pendingDirectories.push({ source: currentDirectory.source, path: child.path });
          }
          continue;
        }

        const kind = getMediaKindForPath(child.name || child.path);
        if (!kind) {
          continue;
        }

        items.push(toMediaItem(workspacePath, child, kind, currentDirectory.source));

        if (mode === 'availability') {
          return { items, truncated: false };
        }

        if (items.length > resolvedOptions.maxResults) {
          truncated = true;
        }
      }
    }

    return { items, truncated };
  };

  return {
    async checkAvailability(workspacePath) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }

      const rootPath = workspacePath.trim();
      try {
        const result = await walk(rootPath, 'availability');
        return result.items.length > 0
          ? { status: 'available', firstDetectedAt: Date.now() }
          : { status: 'unavailable', checkedAt: Date.now() };
      } catch (error) {
        return {
          status: 'error',
          error: errorState('scan_failed', error instanceof Error ? error.message : 'Failed to check workspace media.', error),
        };
      }
    },

    async scanLibrary(workspacePath) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }

      const rootPath = workspacePath.trim();
      try {
        const result = await walk(rootPath, 'library');
        const sortedItems = result.items
          .sort((left, right) => (right.modifiedAt || 0) - (left.modifiedAt || 0))
          .slice(0, resolvedOptions.maxResults);

        if (sortedItems.length === 0) {
          return { status: 'empty', scannedAt: Date.now() };
        }

        const state: WorkspaceMediaLibraryState = {
          status: 'ready',
          items: sortedItems,
          scannedAt: Date.now(),
        };
        if (result.truncated || result.items.length > resolvedOptions.maxResults) {
          state.truncated = true;
        }
        return state;
      } catch (error) {
        return {
          status: 'error',
          error: errorState('scan_failed', error instanceof Error ? error.message : 'Failed to scan workspace media.', error),
        };
      }
    },
  };
}

export const workspaceMediaNodeAdapter: WorkspaceMediaNodeAdapter = {
  async ensureDirectory(path: string) {
    try {
      const metadata = await workspaceAPI.getFileMetadata(path);
      if (metadata.isDir) {
        return;
      }
    } catch {
      // Missing paths are created below. Other errors will surface from createDirectory.
    }
    await workspaceAPI.createDirectory(path);
  },

  async listChildren(path: string) {
    const children = await workspaceAPI.getDirectoryChildren(path);
    return children.map((child): WorkspaceMediaNode => ({
      path: child.path,
      name: child.name,
      isDirectory: child.isDirectory,
      sizeBytes: typeof child.size === 'number' ? child.size : undefined,
      modifiedAt: typeof child.lastModified === 'number' ? child.lastModified : undefined,
    }));
  },
};

export const workspaceMediaLibraryService = createWorkspaceMediaLibraryService(workspaceMediaNodeAdapter);
