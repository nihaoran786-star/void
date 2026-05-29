/**
 * Image processing utility functions
 */

import type { ImageContext } from '@/shared/types/context';
import { isImageFile as checkIsImageFile } from '@/infrastructure/language-detection';
import { createLogger } from '@/shared/utils/logger';
import { workspaceAPI } from '@/infrastructure/api';
import { workspaceMediaInputDirectory } from '@/shared/services/workspace-media/WorkspaceMediaPaths';
import { writeFile as writeBinaryFile } from '@tauri-apps/plugin-fs';

const log = createLogger('imageUtils');

export interface WorkspaceImageStorageAdapter {
  ensureDirectory(path: string): Promise<void>;
  copyFile(sourcePath: string, destinationPath: string): Promise<void>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
}

interface CreateImageContextOptions {
  workspacePath?: string;
  storageAdapter?: WorkspaceImageStorageAdapter;
}

const defaultWorkspaceImageStorageAdapter: WorkspaceImageStorageAdapter = {
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

  async copyFile(sourcePath: string, destinationPath: string) {
    await workspaceAPI.exportLocalFileToPath(sourcePath, destinationPath);
  },

  async writeFile(path: string, content: Uint8Array) {
    await writeBinaryFile(path, content);
  },
};

/**
 * Build a human-readable, unique-ish filename for an image that came from the
 * clipboard (which has no real path). We deliberately avoid an incrementing
 * `image-N` counter because that name used to leak into the prompt and made
 * the model believe a file named `image-1.png` actually existed on disk.
 */
function generateClipboardImageName(mimeType: string): string {
  const ext = (mimeType.split('/')[1] || 'png').toLowerCase();
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `-${pad(now.getMilliseconds(), 3)}`;
  return `clipboard-${stamp}.${ext}`;
}

function sanitizeWorkspaceMediaFileName(fileName: string): string {
  const parts = fileName.split('.');
  const extension = parts.length > 1 ? `.${parts.pop()}` : '.png';
  const name = (parts.join('.') || 'image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9.]+/g, '');
  return `${name}${safeExtension || '.png'}`;
}

function joinMediaInputPath(workspacePath: string, fileName: string): string {
  const directory = workspaceMediaInputDirectory(workspacePath);
  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
  const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${directory}${separator}${uniquePrefix}-${sanitizeWorkspaceMediaFileName(fileName)}`;
}

async function persistImageToWorkspaceInput(
  file: File,
  imageName: string,
  options?: CreateImageContextOptions
): Promise<string | undefined> {
  const workspacePath = options?.workspacePath?.trim();
  if (!workspacePath) {
    return undefined;
  }

  const storageAdapter = options?.storageAdapter || defaultWorkspaceImageStorageAdapter;
  const directory = workspaceMediaInputDirectory(workspacePath);
  const destinationPath = joinMediaInputPath(workspacePath, imageName);

  try {
    await storageAdapter.ensureDirectory(directory);
    const sourcePath = (file as File & { path?: string }).path;
    if (sourcePath) {
      await storageAdapter.copyFile(sourcePath, destinationPath);
    } else {
      await storageAdapter.writeFile(destinationPath, new Uint8Array(await file.arrayBuffer()));
    }
    return destinationPath;
  } catch (error) {
    log.warn('Failed to persist image in workspace media input folder', {
      fileName: imageName,
      workspacePath,
      error,
    });
    return undefined;
  }
}

/**
 * Generate image thumbnail
 * @param file Image file
 * @param maxSize Maximum size (default 200px)
 * @returns Base64 encoded thumbnail
 */
export async function generateThumbnail(
  file: File,
  maxSize: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);
        
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(thumbnailDataUrl);
      };
      
      img.onerror = () => {
        reject(new Error('Image loading failed'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('File reading failed'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Generate thumbnail from file path (Tauri environment)
 * @param filePath File path
 * @returns Base64 encoded thumbnail
 */
export async function generateThumbnailFromPath(
  filePath: string
): Promise<string> {
  // In a Tauri environment, the backend can generate thumbnails.
  // Here we simplify the process and return the file path directly.
  // TODO: Implement backend thumbnail generation
  return `file://${filePath}`;
}

/**
 * Validate image file
 * @param file File object
 * @returns Validation result
 */
export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const supportedTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  ];
  
  if (!supportedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported image format: ${file.type}`
    };
  }
  
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Image too large (${(file.size / 1024 / 1024).toFixed(2)}MB), maximum supported 20MB`
    };
  }
  
  return { valid: true };
}

/**
 * Get image dimensions
 * @param file Image file
 * @returns Image width and height
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height
        });
      };
      
      img.onerror = () => {
        reject(new Error('Failed to get image dimensions'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('File reading failed'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Get MIME type from filename
 * @param filename Filename
 * @returns MIME type
 */
export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  
  const mimeMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  
  return mimeMap[ext || ''] || 'image/jpeg';
}

/**
 * Create ImageContext from file
 * @param file File object
 * @returns ImageContext
 */
export async function createImageContextFromFile(
  file: File,
  options?: CreateImageContextOptions,
): Promise<ImageContext> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  let dimensions = { width: 0, height: 0 };
  try {
    dimensions = await getImageDimensions(file);
  } catch (error) {
    log.warn('Failed to get image dimensions', { fileName: file.name, error });
  }
  
  let thumbnailUrl: string | undefined;
  try {
    thumbnailUrl = await generateThumbnail(file);
  } catch (error) {
    log.warn('Failed to generate thumbnail', { fileName: file.name, error });
  }
  
  const dataUrl = await readFileAsDataUrl(file);
  const originalPath = (file as File & { path?: string }).path || '';
  const persistedPath = await persistImageToWorkspaceInput(file, file.name, options);

  const imageContext: ImageContext = {
    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'image',
    imagePath: persistedPath || originalPath, // Electron/Tauri environments may have a path property.
    imageName: file.name,
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    mimeType: file.type,
    dataUrl,
    source: 'file',
    isLocal: Boolean(persistedPath || originalPath),
    timestamp: Date.now(),
    thumbnailUrl,
    metadata: persistedPath ? { mediaInputPath: persistedPath } : {}
  };
  
  return imageContext;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    
    reader.onerror = () => {
      reject(new Error('File reading failed'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Create ImageContext from clipboard
 * @param file File object from clipboard
 * @returns ImageContext
 */
export async function createImageContextFromClipboard(
  file: File,
  options?: CreateImageContextOptions,
): Promise<ImageContext> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  let dimensions = { width: 0, height: 0 };
  try {
    dimensions = await getImageDimensions(file);
  } catch (error) {
    log.warn('Failed to get image dimensions', { fileName: file.name, error });
  }
  
  let thumbnailUrl: string | undefined;
  try {
    thumbnailUrl = await generateThumbnail(file);
  } catch (error) {
    log.warn('Failed to generate thumbnail', { fileName: file.name, error });
  }
  
  const dataUrl = await readFileAsDataUrl(file);
  const imageName = (() => {
    const raw = file.name || '';
    const genericPattern = /^image\.\w+$/i;
    if (!raw || genericPattern.test(raw)) {
      return generateClipboardImageName(file.type || 'image/png');
    }
    return raw;
  })();
  const persistedPath = await persistImageToWorkspaceInput(file, imageName, options);
  
  const imageContext: ImageContext = {
    id: `img-clipboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'image',
    imagePath: persistedPath || '', // Clipboard images do not have a source path.
    imageName,
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    mimeType: file.type,
    dataUrl,
    source: 'clipboard',
    isLocal: Boolean(persistedPath),
    timestamp: Date.now(),
    thumbnailUrl,
    metadata: {
      fromClipboard: true,
      ...(persistedPath ? { mediaInputPath: persistedPath } : {}),
    }
  };

  return imageContext;
}

/**
 * Check if file is an image
 * Use global language detection service
 * @param filename Filename
 * @returns Whether it is an image
 */
export function isImageFile(filename: string): boolean {
  return checkIsImageFile(filename);
}

/**
 * Format file size
 * @param bytes Bytes
 * @returns Formatted string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

