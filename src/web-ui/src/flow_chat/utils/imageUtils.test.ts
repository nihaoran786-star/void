import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createImageContextFromClipboard, createImageContextFromFile } from './imageUtils';

const DATA_URL = 'data:image/png;base64,abc123';

class TestFileReader {
  public onload: ((event: { target?: { result: string } }) => void) | null = null;
  public onerror: (() => void) | null = null;

  readAsDataURL() {
    this.onload?.({ target: { result: DATA_URL } });
  }
}

class TestImage {
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public width = 64;
  public height = 32;

  set src(_value: string) {
    this.onload?.();
  }
}

function installImageDomMocks() {
  vi.stubGlobal('FileReader', TestFileReader);
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('document', {
    createElement: (tagName: string) => {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected element: ${tagName}`);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
        }),
        toDataURL: () => 'data:image/jpeg;base64,thumb',
      };
    },
  });
}

describe('imageUtils', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installImageDomMocks();
  });

  it('keeps a data URL for file uploads even when the browser exposes a file path', async () => {
    const file = new File(['image-bytes'], 'thor-reference.png', { type: 'image/png' });
    Object.defineProperty(file, 'path', {
      value: 'C:/Users/example/Pictures/thor-reference.png',
    });

    const context = await createImageContextFromFile(file);

    expect(context).toMatchObject({
      imagePath: 'C:/Users/example/Pictures/thor-reference.png',
      imageName: 'thor-reference.png',
      dataUrl: DATA_URL,
      source: 'file',
      isLocal: true,
      width: 64,
      height: 32,
    });
  });

  it('copies file uploads into the workspace media input folder when a workspace path is available', async () => {
    const file = new File(['image-bytes'], 'Thor Reference.png', { type: 'image/png' });
    Object.defineProperty(file, 'path', {
      value: 'C:/Users/example/Pictures/Thor Reference.png',
    });
    const storageAdapter = {
      ensureDirectory: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    };

    const context = await createImageContextFromFile(file, {
      workspacePath: 'C:/work',
      storageAdapter,
    });

    expect(storageAdapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/input');
    expect(storageAdapter.copyFile).toHaveBeenCalledWith(
      'C:/Users/example/Pictures/Thor Reference.png',
      expect.stringMatching(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-thor-reference\.png$/)
    );
    expect(storageAdapter.writeFile).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      imageName: 'Thor Reference.png',
      dataUrl: DATA_URL,
      source: 'file',
      isLocal: true,
      metadata: {
        mediaInputPath: expect.stringMatching(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-thor-reference\.png$/),
      },
    });
    expect(context.imagePath).toMatch(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-thor-reference\.png$/);
  });

  it('keeps a data URL for clipboard uploads without requiring a workspace path', async () => {
    const file = new File(['image-bytes'], 'image.png', { type: 'image/png' });

    const context = await createImageContextFromClipboard(file);

    expect(context).toMatchObject({
      imagePath: '',
      dataUrl: DATA_URL,
      source: 'clipboard',
      isLocal: false,
      width: 64,
      height: 32,
      metadata: {
        fromClipboard: true,
      },
    });
    expect(context.imageName).toMatch(/^clipboard-\d{8}-\d{6}-\d{3}\.png$/);
  });

  it('writes clipboard images into the workspace media input folder when a workspace path is available', async () => {
    const file = new File(['image-bytes'], 'image.png', { type: 'image/png' });
    const storageAdapter = {
      ensureDirectory: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    };

    const context = await createImageContextFromClipboard(file, {
      workspacePath: 'C:/work',
      storageAdapter,
    });

    expect(storageAdapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/input');
    expect(storageAdapter.copyFile).not.toHaveBeenCalled();
    expect(storageAdapter.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-clipboard-\d{8}-\d{6}-\d{3}\.png$/),
      expect.any(Uint8Array)
    );
    expect(context).toMatchObject({
      imagePath: expect.stringMatching(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-clipboard-\d{8}-\d{6}-\d{3}\.png$/),
      dataUrl: DATA_URL,
      source: 'clipboard',
      isLocal: true,
      metadata: {
        fromClipboard: true,
        mediaInputPath: expect.stringMatching(/^C:\/work\/media\/input\/\d+-[a-z0-9]+-clipboard-\d{8}-\d{6}-\d{3}\.png$/),
      },
    });
  });
});
