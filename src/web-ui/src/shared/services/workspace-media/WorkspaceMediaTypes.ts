export type WorkspaceMediaKind = 'image' | 'video' | 'audio';
export type WorkspaceMediaSource = 'generated' | 'input';

export interface WorkspaceMediaError {
  code: 'missing_workspace' | 'unsupported_runtime' | 'scan_failed' | 'trash_failed' | 'unsafe_path';
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
  generatedIdentity?: WorkspaceMediaGeneratedIdentity;
  filePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes?: number;
  modifiedAt?: number;
  sortAt?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  requestedAspectRatio?: string;
  placeholderAspectRatio?: string;
  generationPrompt?: string;
  generationRole?: string;
  generationResultUrl?: string;
}

export interface WorkspaceMediaGeneratedIdentity {
  batchId: string;
  itemIndex: number;
}

export type WorkspaceMediaTrashState = 'active' | 'trashed' | 'expired';

export interface WorkspaceMediaSelection {
  id: string;
  filePath: string;
  stableSlotId?: string;
  kind: WorkspaceMediaKind;
  source: WorkspaceMediaSource;
  generatedIdentity?: WorkspaceMediaGeneratedIdentity;
}

export interface WorkspaceMediaTrashRecord {
  id: string;
  state: Exclude<WorkspaceMediaTrashState, 'active'>;
  originalPath: string;
  trashPath: string;
  fileName: string;
  kind: WorkspaceMediaKind;
  source: WorkspaceMediaSource;
  deletedAt: number;
  stableSlotId?: string;
  generatedIdentity?: WorkspaceMediaGeneratedIdentity;
  sizeBytes?: number;
}

export type WorkspaceMediaTrashStateResult =
  | { status: 'ready'; items: WorkspaceMediaTrashRecord[]; checkedAt: number }
  | { status: 'unsupported'; reason: WorkspaceMediaError }
  | { status: 'error'; error: WorkspaceMediaError };

export interface WorkspaceMediaPendingGeneration {
  id: string;
  batchId: string;
  itemIndex: number;
  kind: Exclude<WorkspaceMediaKind, 'audio'>;
  source: 'generated';
  workspacePath?: string;
  toolId?: string;
  taskId?: string;
  targetStage?: string;
  episodeId?: string;
  artifactId?: string;
  artifactHandle?: string;
  mediaItemId?: string;
  prompt?: string;
  model?: string;
  requestedAspectRatio: string;
  placeholderAspectRatio: string;
  updatedAt?: number;
  startedAt?: number;
}

export type WorkspaceMediaLibraryState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'ready'; items: WorkspaceMediaItem[]; pendingGenerations?: WorkspaceMediaPendingGeneration[]; scannedAt: number; truncated?: boolean }
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
  readTextFile?(path: string): Promise<string>;
  writeTextFile?(path: string, content: string): Promise<void>;
  renameFile?(from: string, to: string): Promise<void>;
  deleteFile?(path: string): Promise<void>;
  deleteDirectory?(path: string, recursive?: boolean): Promise<void>;
  pathExists?(path: string): Promise<boolean>;
}

export interface WorkspaceMediaLibraryService {
  checkAvailability(workspacePath?: string): Promise<WorkspaceMediaAvailability>;
  scanLibrary(workspacePath?: string): Promise<WorkspaceMediaLibraryState>;
  deleteItems?(workspacePath: string | undefined, selections: WorkspaceMediaSelection[], now?: number): Promise<WorkspaceMediaTrashStateResult>;
  listTrash?(workspacePath: string | undefined, now?: number): Promise<WorkspaceMediaTrashStateResult>;
  restoreItems?(workspacePath: string | undefined, trashIds: string[]): Promise<WorkspaceMediaTrashStateResult>;
  purgeItems?(workspacePath: string | undefined, trashIds: string[]): Promise<WorkspaceMediaTrashStateResult>;
  purgeExpiredTrash?(workspacePath: string | undefined, now?: number, olderThanMs?: number): Promise<WorkspaceMediaTrashStateResult>;
}
