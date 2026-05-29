export type WorkspaceMediaKind = 'image' | 'video' | 'audio';
export type WorkspaceMediaSource = 'generated' | 'input';

export interface WorkspaceMediaError {
  code: 'missing_workspace' | 'unsupported_runtime' | 'scan_failed';
  message: string;
  cause?: unknown;
}

export type WorkspaceMediaAvailability =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'available'; firstDetectedAt: number }
  | { status: 'unavailable'; checkedAt: number }
  | { status: 'unsupported'; reason: WorkspaceMediaError }
  | { status: 'error'; error: WorkspaceMediaError };

export interface WorkspaceMediaItem {
  id: string;
  kind: WorkspaceMediaKind;
  source: WorkspaceMediaSource;
  filePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes?: number;
  modifiedAt?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export type WorkspaceMediaLibraryState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'ready'; items: WorkspaceMediaItem[]; scannedAt: number; truncated?: boolean }
  | { status: 'empty'; scannedAt: number }
  | { status: 'unsupported'; reason: WorkspaceMediaError }
  | { status: 'error'; error: WorkspaceMediaError };

export interface WorkspaceMediaNode {
  path: string;
  name: string;
  isDirectory: boolean;
  sizeBytes?: number;
  modifiedAt?: number;
}

export interface WorkspaceMediaNodeAdapter {
  ensureDirectory?(path: string): Promise<void>;
  listChildren(path: string): Promise<WorkspaceMediaNode[]>;
  readFileContent?(path: string): Promise<string>;
  deleteFile?(path: string): Promise<void>;
}

export interface WorkspaceMediaLibraryService {
  checkAvailability(workspacePath?: string): Promise<WorkspaceMediaAvailability>;
  scanLibrary(workspacePath?: string): Promise<WorkspaceMediaLibraryState>;
}
