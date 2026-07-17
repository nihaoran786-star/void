import React, { useState } from 'react';
import { FolderOpen, Clock, FileText, Code, Folder, Bot } from 'lucide-react';
import { useWorkspaceContext } from '../../../infrastructure/contexts/WorkspaceContext';
import { WorkspaceInfo, WorkspaceKind, WorkspaceType } from '../../../shared/types';
import { Modal } from '@/component-library';
import { i18nService, useI18n } from '@/infrastructure/i18n';
import { createLogger } from '@/shared/utils/logger';
import { getRecentWorkspaceLineParts } from '@/shared/utils/recentWorkspaceDisplay';
import {
  workspacePresentationClassName,
  type WorkspacePresentation,
} from '@/app/presentation/workspacePresentation';
import './WorkspaceManager.css';

const log = createLogger('WorkspaceManager');

export interface WorkspaceManagerProps {
  isVisible: boolean;
  onClose: () => void;
  onWorkspaceSelect?: (workspace: WorkspaceInfo) => void;
  presentation?: WorkspacePresentation;
}

/**
 * Workspace management component.
 * Displays current workspace status and recent workspaces.
 */
const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  isVisible,
  onClose,
  onWorkspaceSelect,
  presentation = 'classic',
}) => {
  const { t } = useI18n('common');
  const {
    currentWorkspace,
    recentWorkspaces,
    assistantWorkspacesList,
    loading,
    error,
    switchWorkspace,
    closeWorkspace,
    scanWorkspaceInfo
  } = useWorkspaceContext();

  const [scanning, setScanning] = useState(false);

  const getWorkspaceDisplayName = (workspace: WorkspaceInfo) => {
    const emoji = workspace.identity?.emoji?.trim();
    return emoji ? `${emoji} ${workspace.name}` : workspace.name;
  };

  const renderIdentityDetails = (workspace: WorkspaceInfo) => {
    const entries = [
      workspace.identity?.creature
        ? { label: t('workspaceManager.identity.creature'), value: workspace.identity.creature }
        : null,
      workspace.identity?.vibe
        ? { label: t('workspaceManager.identity.vibe'), value: workspace.identity.vibe }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    if (entries.length === 0) {
      return null;
    }

    return (
      <div className="workspace-identity">
        {entries.map(entry => (
          <span key={entry.label} className="workspace-identity__item">
            <span className="workspace-identity__label">{entry.label}</span>
            <span className="workspace-identity__value">{entry.value}</span>
          </span>
        ))}
      </div>
    );
  };

  const renderRelatedPaths = (workspace: WorkspaceInfo) => {
    const relatedPaths = workspace.relatedPaths ?? [];
    if (relatedPaths.length === 0) {
      return null;
    }

    return (
      <div className="workspace-related-paths">
        <span className="workspace-related-paths__label">
          {t('nav.workspaces.relatedPaths.dialog.title')}
        </span>
        <div className="workspace-related-paths__list">
          {relatedPaths.slice(0, 3).map(path => (
            <div key={path.path} className="workspace-related-paths__item">
              <span className="workspace-related-paths__path">{path.path}</span>
              {path.description?.trim() ? (
                <span className="workspace-related-paths__desc">{path.description}</span>
              ) : null}
            </div>
          ))}
          {relatedPaths.length > 3 ? (
            <div className="workspace-related-paths__more">
              +{relatedPaths.length - 3}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const handleWorkspaceSelect = async (workspace: WorkspaceInfo) => {
    try {
      await switchWorkspace(workspace);
      onWorkspaceSelect?.(workspace);
      onClose();
    } catch (err) {
      log.error('Failed to switch workspace', { workspaceId: workspace.id, error: err });
    }
  };

  const handleCloseWorkspace = async () => {
    try {
      await closeWorkspace();
    } catch (err) {
      log.error('Failed to close workspace', err);
    }
  };

  const handleScanWorkspace = async () => {
    try {
      setScanning(true);
      await scanWorkspaceInfo();
    } catch (err) {
      log.error('Failed to scan workspace', err);
    } finally {
      setScanning(false);
    }
  };

  const getWorkspaceIcon = (workspace: WorkspaceInfo) => {
    if (workspace.workspaceKind === WorkspaceKind.Assistant) {
      return <Bot size={16} />;
    }

    const type = workspace.workspaceType;
    switch (type) {
      case WorkspaceType.SingleProject:
        return <Code size={16} />;
      case WorkspaceType.Documentation:
        return <FileText size={16} />;
      case WorkspaceType.MultiProject:
        return <Folder size={16} />;
      default:
        return <FolderOpen size={16} />;
    }
  };

  const getWorkspaceTypeLabel = (workspaceType: WorkspaceType) => {
    switch (workspaceType) {
      case WorkspaceType.SingleProject:
        return t('workspaceManager.types.singleProject');
      case WorkspaceType.MultiProject:
        return t('workspaceManager.types.multiProject');
      case WorkspaceType.Documentation:
        return t('workspaceManager.types.documentation');
      default:
        return t('workspaceManager.types.other');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return i18nService.formatDate(new Date(dateStr), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const otherAssistantWorkspaces = assistantWorkspacesList.filter(
    workspace => workspace.id !== currentWorkspace?.id
  );

  return (
    <Modal
      isOpen={isVisible}
      onClose={onClose}
      title={t('workspaceManager.title')}
      size="medium"
      overlayClassName={workspacePresentationClassName(presentation)}
    >
      <div className="workspace-manager">
        {error && (
          <div className="error-message" role="alert">
            <span>{t('workspaceManager.error', { error })}</span>
          </div>
        )}

        <div className="current-workspace-section">
          <h3>{t('workspaceManager.currentWorkspace')}</h3>
          {currentWorkspace ? (
            <div className="workspace-card current">
              <div className="workspace-header">
                <div className="workspace-icon">
                  {getWorkspaceIcon(currentWorkspace)}
                </div>
                <div className="workspace-info">
                  <div className="workspace-name">{getWorkspaceDisplayName(currentWorkspace)}</div>
                  <div className="workspace-path">{currentWorkspace.rootPath}</div>
                  <div className="workspace-meta">
                    <span className="workspace-type">
                      {getWorkspaceTypeLabel(currentWorkspace.workspaceType)}
                    </span>
                    {currentWorkspace.lastAccessed && (
                      <span className="workspace-time">
                        <Clock size={12} />
                        {formatDate(currentWorkspace.lastAccessed)}
                      </span>
                    )}
                  </div>
                  {renderIdentityDetails(currentWorkspace)}
                  {renderRelatedPaths(currentWorkspace)}
                </div>
              </div>
              
              <div className="workspace-actions">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={handleScanWorkspace}
                  disabled={scanning}
                  type="button"
                >
                  {scanning
                    ? t('workspaceManager.actions.scanning')
                    : t('workspaceManager.actions.rescan')}
                </button>
                <button
                  className="btn btn-danger btn-small"
                  onClick={handleCloseWorkspace}
                  disabled={loading}
                  type="button"
                >
                  {t('workspaceManager.actions.close')}
                </button>
              </div>

              {currentWorkspace.statistics && (
                <div className="workspace-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t('workspaceManager.stats.files')}</span>
                    <span className="stat-value">{currentWorkspace.statistics.totalFiles}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('workspaceManager.stats.lines')}</span>
                    <span className="stat-value">{currentWorkspace.statistics.totalLines?.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('workspaceManager.stats.totalSize')}</span>
                    <span className="stat-value">{(currentWorkspace.statistics.totalSize / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="no-workspace">
              <FolderOpen size={32} />
              <p>{t('workspaceManager.empty.current')}</p>
            </div>
          )}
        </div>

        <div className="recent-workspaces-section">
          <h3>{t('workspaceManager.recentWorkspaces')}</h3>
          {recentWorkspaces.length > 0 ? (
            <div className="workspace-list">
              {recentWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className="workspace-card recent"
                  type="button"
                  onClick={() => handleWorkspaceSelect(workspace)}
                >
                  <div className="workspace-header">
                    <div className="workspace-icon">
                      {getWorkspaceIcon(workspace)}
                    </div>
                    <div className="workspace-info">
                      <div className="workspace-name">
                        {(() => {
                          const { hostPrefix } = getRecentWorkspaceLineParts(workspace);
                          return (
                            <>
                              {hostPrefix ? (
                                <span className="workspace-name__ssh-host">{hostPrefix} · </span>
                              ) : null}
                              {getWorkspaceDisplayName(workspace)}
                            </>
                          );
                        })()}
                      </div>
                      <div className="workspace-path">{workspace.rootPath}</div>
                      <div className="workspace-meta">
                        <span className="workspace-type">
                          {getWorkspaceTypeLabel(workspace.workspaceType)}
                        </span>
                        {workspace.lastAccessed && (
                          <span className="workspace-time">
                            <Clock size={12} />
                            {formatDate(workspace.lastAccessed)}
                          </span>
                        )}
                      </div>
                      {renderIdentityDetails(workspace)}
                      {renderRelatedPaths(workspace)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="no-recent">
              <p>{t('workspaceManager.empty.recent')}</p>
            </div>
          )}
        </div>

        <div className="recent-workspaces-section">
          <h3>{t('workspaceManager.personalAssistants')}</h3>
          {otherAssistantWorkspaces.length > 0 ? (
            <div className="workspace-list">
              {otherAssistantWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className="workspace-card recent"
                  type="button"
                  onClick={() => handleWorkspaceSelect(workspace)}
                >
                  <div className="workspace-header">
                    <div className="workspace-icon">
                      <Bot size={16} />
                    </div>
                    <div className="workspace-info">
                      <div className="workspace-name">{getWorkspaceDisplayName(workspace)}</div>
                      <div className="workspace-path">{workspace.rootPath}</div>
                      <div className="workspace-meta">
                        <span className="workspace-type">{t('workspaceManager.assistantType')}</span>
                        {workspace.lastAccessed && (
                          <span className="workspace-time">
                            <Clock size={12} />
                            {formatDate(workspace.lastAccessed)}
                          </span>
                        )}
                      </div>
                      {renderIdentityDetails(workspace)}
                      {renderRelatedPaths(workspace)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="no-recent">
              <p>{t('workspaceManager.empty.assistants')}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default WorkspaceManager;
