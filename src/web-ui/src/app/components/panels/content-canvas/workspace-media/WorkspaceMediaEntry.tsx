import React from 'react';
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
  onOpenShortDrama?: () => void;
  activeSurface?: 'media' | 'short-drama' | null;
}

export const WorkspaceMediaEntry: React.FC<WorkspaceMediaEntryProps> = ({
  workspacePath,
  service = workspaceMediaLibraryService,
  onOpen,
  onOpenShortDrama,
  activeSurface = null,
}) => {
  const { t } = useTranslation('components');
  const [availability, setAvailability] = React.useState<WorkspaceMediaAvailability>({ status: 'unknown' });
  const isMediaSessionSwitcher = Boolean(onOpenShortDrama);

  React.useEffect(() => {
    if (isMediaSessionSwitcher) {
      return;
    }

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
  }, [isMediaSessionSwitcher, service, workspacePath]);

  if (!isMediaSessionSwitcher && availability.status !== 'available') {
    return null;
  }

  const mediaLabel = t('workspaceMedia.entry');
  const shortDramaLabel = t('shortDrama.entry');
  const shortDramaSwitcherLabel = t('shortDrama.switcher');

  return (
    <div
      className={[
        'workspace-media-entry',
        isMediaSessionSwitcher ? 'workspace-media-entry--switcher' : '',
      ].filter(Boolean).join(' ')}
      role="group"
      aria-label={mediaLabel}
    >
      <button
        type="button"
        className={[
          'workspace-media-entry__option',
          activeSurface === 'media' ? 'is-active' : '',
        ].filter(Boolean).join(' ')}
        aria-label={mediaLabel}
        aria-pressed={activeSurface === null ? undefined : activeSurface === 'media'}
        title={mediaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.();
        }}
      >
        {mediaLabel}
      </button>
      {onOpenShortDrama && (
        <button
          type="button"
          className={[
            'workspace-media-entry__option',
            activeSurface === 'short-drama' ? 'is-active' : '',
          ].filter(Boolean).join(' ')}
          aria-label={shortDramaLabel}
          aria-pressed={activeSurface === null ? undefined : activeSurface === 'short-drama'}
          title={shortDramaLabel}
          onClick={(event) => {
            event.stopPropagation();
            onOpenShortDrama();
          }}
        >
          {shortDramaSwitcherLabel}
        </button>
      )}
    </div>
  );
};

export default WorkspaceMediaEntry;
