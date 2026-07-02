import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  workspaceMediaLibraryService,
  type WorkspaceMediaLibraryService,
  type WorkspaceMediaAvailability,
} from '@/shared/services/workspace-media';
import './WorkspaceMediaEntry.scss';

const WORKSPACE_MEDIA_ENTRY_RECHECK_INTERVAL_MS = 5000;

export interface WorkspaceMediaEntryProps {
  workspacePath?: string;
  service?: WorkspaceMediaLibraryService;
  onOpen?: () => void;
}

export const WorkspaceMediaEntry: React.FC<WorkspaceMediaEntryProps> = ({
  workspacePath,
  service = workspaceMediaLibraryService,
  onOpen,
}) => {
  const { t } = useTranslation('components');
  const [availability, setAvailability] = React.useState<WorkspaceMediaAvailability>({ status: 'unknown' });

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const checkAvailability = async (showChecking: boolean) => {
      if (showChecking) {
        setAvailability({ status: 'checking' });
      }
      const nextAvailability = await service.checkAvailability(workspacePath).catch((error): WorkspaceMediaAvailability => ({
        status: 'error',
        error: {
          code: 'scan_failed',
          message: error instanceof Error ? error.message : 'Failed to check workspace media.',
          cause: error,
        },
      }));
      if (cancelled) {
        return;
      }
      setAvailability(nextAvailability);
      if (nextAvailability.status === 'unavailable') {
        timeoutId = window.setTimeout(() => {
          void checkAvailability(false);
        }, WORKSPACE_MEDIA_ENTRY_RECHECK_INTERVAL_MS);
      }
    };

    void checkAvailability(true);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [service, workspacePath]);

  if (availability.status !== 'available') {
    return null;
  }

  return (
    <button
      type="button"
      className="workspace-media-entry"
      aria-label={t('workspaceMedia.entry')}
      title={t('workspaceMedia.entry')}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
    >
      <ImageIcon size={14} />
    </button>
  );
};

export default WorkspaceMediaEntry;
