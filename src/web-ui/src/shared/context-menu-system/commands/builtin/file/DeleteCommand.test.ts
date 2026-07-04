import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDanger } from '@/component-library/components/ConfirmDialog/confirmService';
import { globalEventBus } from '@/infrastructure/event-bus';
import { ContextType, type FileNodeContext } from '../../../types/context.types';
import { DeleteFileCommand } from './DeleteCommand';

vi.mock('@/component-library/components/ConfirmDialog/confirmService', () => ({
  confirmDanger: vi.fn(),
}));

vi.mock('@/infrastructure/i18n', () => ({
  i18nService: {
    getT: () => (key: string, params?: Record<string, string>) =>
      params?.name ? `${key}:${params.name}` : key,
  },
}));

function fileContext(overrides: Partial<FileNodeContext> = {}): FileNodeContext {
  return {
    type: ContextType.FILE_NODE,
    event: {} as MouseEvent,
    targetElement: {} as HTMLElement,
    position: { x: 0, y: 0 },
    timestamp: 0,
    filePath: '/workspace/file.txt',
    fileName: 'file.txt',
    isDirectory: false,
    ...overrides,
  };
}

describe('DeleteFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared danger confirm dialog before deleting', async () => {
    vi.mocked(confirmDanger).mockResolvedValue(true);
    const emitSpy = vi.spyOn(globalEventBus, 'emit').mockReturnValue(true);

    const result = await new DeleteFileCommand().execute(fileContext());

    expect(result.success).toBe(true);
    expect(confirmDanger).toHaveBeenCalledWith(
      'common:file.delete',
      'common:contextMenu.confirmDeleteFile:file.txt',
      { confirmText: 'common:actions.delete' }
    );
    expect(emitSpy).toHaveBeenCalledWith('file:delete', {
      path: '/workspace/file.txt',
      isDirectory: false,
    });
  });

  it('does not emit delete when confirmation is cancelled', async () => {
    vi.mocked(confirmDanger).mockResolvedValue(false);
    const emitSpy = vi.spyOn(globalEventBus, 'emit').mockReturnValue(true);

    const result = await new DeleteFileCommand().execute(fileContext());

    expect(result.success).toBe(false);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
