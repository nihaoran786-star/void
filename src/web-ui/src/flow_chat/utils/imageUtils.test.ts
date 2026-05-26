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
});
