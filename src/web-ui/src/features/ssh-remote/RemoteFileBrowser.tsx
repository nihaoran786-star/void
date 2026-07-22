/**
 * Remote File Browser Component
 * Used to browse and select remote directory as workspace
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/infrastructure/i18n';
import { Button, Modal } from '@/component-library';
import { ConfirmDialog } from './ConfirmDialog';
import type { RemoteFileEntry } from './types';
import { sshApi } from './sshApi';
import {
  X,
  RefreshCw,
  Folder,
  File,
  Link,
  ChevronRight,
  Home,
  ArrowLeft,
  Loader2,
  Upload,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';
import './RemoteFileBrowser.scss';

interface RemoteFileBrowserProps {
  connectionId: string;
  /** Defaults to `/tmp` if parent does not pass a resolved absolute home (avoid literal `~` for SFTP). */
  initialPath?: string;
  /** Used by the Home button; defaults to `initialPath`. */
  homePath?: string;
  /** When true, only directories can be chosen and files are not selectable. */
  selectDirectoriesOnly?: boolean;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  entry: RemoteFileEntry | null;
}

interface DeleteConfirmState {
  show: boolean;
  entry: RemoteFileEntry | null;
}

function joinRemotePath(dir: string, fileName: string): string {
  const name = fileName.replace(/^\/+/, '');
  if (!dir || dir === '/') {
    return `/${name}`;
  }
  if (dir === '~') {
    return name ? `~/${name}` : '~';
  }
  const base = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${base}/${name}`;
}

/** Parent directory for remote paths (supports `~` and absolute POSIX paths). */
function getRemoteParentPath(path: string): string | null {
  if (path === '/' || path === '~') return null;
  if (path.startsWith('~/')) {
    const rest = path.slice(2);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    parts.pop();
    if (parts.length === 0) return '~';
    return `~/${parts.join('/')}`;
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return '/';
  parts.pop();
  return `/${parts.join('/')}`;
}

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export const RemoteFileBrowser: React.FC<RemoteFileBrowserProps> = ({
  connectionId,
  initialPath = '/tmp',
  homePath,
  selectDirectoriesOnly = false,
  onSelect,
  onCancel,
}) => {
  const homeAnchor = homePath ?? initialPath;
  const { t } = useI18n('common');
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [pathInputValue, setPathInputValue] = useState(initialPath);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const [renameEntry, setRenameEntry] = useState<RemoteFileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    show: false,
    entry: null,
  });
  const [transferBusy, setTransferBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus());
      }
    };
  }, []);

  // One-shot retry: when the SSH session was torn down by a transient network
  // blip, the backend transparently reconnects on the next call but the
  // already-in-flight request still fails. Retrying once gives the recovery
  // path a chance to succeed before surfacing an error to the user.
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    const fetchOnce = () => sshApi.readDir(connectionId, path);
    try {
      let result;
      try {
        result = await fetchOnce();
      } catch (firstErr) {
        // Brief pause lets the backend complete its reconnect handshake before
        // we hammer it again.
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          result = await fetchOnce();
        } catch {
          throw firstErr;
        }
      }
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  const closeContextMenu = useCallback((restoreFocus = false) => {
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
    const returnTarget = contextMenuReturnFocusRef.current;
    contextMenuReturnFocusRef.current = null;
    if (restoreFocus && returnTarget?.isConnected) {
      window.requestAnimationFrame(() => returnTarget.focus());
    }
  }, []);

  // Close context menu when clicking outside.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.show) {
      return;
    }
    const focusFrame = window.requestAnimationFrame(() => {
      contextMenuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [contextMenu.show]);

  const handleDialogKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.contains(event.target as Node)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (contextMenu.show) {
        closeContextMenu(true);
      } else {
        onCancel();
      }
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, [closeContextMenu, contextMenu.show, onCancel]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setPathInputValue(path);
    setSelectedPath(null);
    setIsEditingPath(false);
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = pathInputValue.trim();
      if (val) {
        const nav = val.startsWith('~')
          ? val
          : val.startsWith('/')
            ? val
            : `/${val}`;
        navigateTo(nav);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setPathInputValue(currentPath);
      setIsEditingPath(false);
    }
  };

  const handlePathInputBlur = () => {
    setPathInputValue(currentPath);
    setIsEditingPath(false);
  };

  const handleEntryClick = (entry: RemoteFileEntry) => {
    if (entry.isDir) {
      navigateTo(entry.path);
    } else if (!selectDirectoriesOnly) {
      setSelectedPath(entry.path);
    }
    closeContextMenu(false);
  };

  const handleEntryDoubleClick = (entry: RemoteFileEntry) => {
    if (entry.isDir) {
      navigateTo(entry.path);
    }
  };

  const openContextMenu = (
    entry: RemoteFileEntry,
    x: number,
    y: number,
    returnTarget: HTMLElement,
  ) => {
    contextMenuReturnFocusRef.current = returnTarget;
    setContextMenu({
      show: true,
      x: Math.min(x, Math.max(8, window.innerWidth - 184)),
      y: Math.min(y, Math.max(8, window.innerHeight - 176)),
      entry,
    });
  };

  const handleContextMenu = (
    e: React.MouseEvent<HTMLTableRowElement>,
    entry: RemoteFileEntry,
  ) => {
    e.preventDefault();
    openContextMenu(entry, e.clientX, e.clientY, e.currentTarget);
  };

  const focusRelativeRow = (
    row: HTMLTableRowElement,
    offset: -1 | 1,
  ) => {
    const rows = Array.from(
      row.closest('tbody')?.querySelectorAll<HTMLTableRowElement>(
        '[data-remote-file-row]',
      ) ?? [],
    );
    const currentIndex = rows.indexOf(row);
    if (currentIndex < 0 || rows.length === 0) {
      return;
    }
    const nextIndex = (currentIndex + offset + rows.length) % rows.length;
    rows[nextIndex]?.focus();
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    entry: RemoteFileEntry | null,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusRelativeRow(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (entry) {
        handleEntryClick(entry);
      } else {
        const parent = getRemoteParentPath(currentPath);
        if (parent !== null) navigateTo(parent);
      }
      return;
    }
    if (
      entry
      && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
    ) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openContextMenu(entry, rect.left + 24, rect.top + 24, event.currentTarget);
    }
  };

  const handleDownloadEntry = async (entry: RemoteFileEntry) => {
    if (entry.isDir) return;
    if (!isTauriDesktop()) {
      setError(t('ssh.remote.transferNeedsDesktop'));
      return;
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const localPath = await save({
      title: t('ssh.remote.downloadDialogTitle'),
      defaultPath: entry.name,
    });
    if (localPath === null) return;

    setTransferBusy(true);
    setError(null);
    try {
      await sshApi.downloadToLocalPath(connectionId, entry.path, localPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ssh.remote.transferFailed'));
    } finally {
      setTransferBusy(false);
    }
  };

  const handleContextMenuAction = async (action: string) => {
    if (!contextMenu.entry) return;

    const entry = contextMenu.entry;
    closeContextMenu(false);

    try {
      switch (action) {
        case 'delete':
          setDeleteConfirm({ show: true, entry });
          break;
        case 'open':
          if (entry.isDir) {
            navigateTo(entry.path);
          } else if (!selectDirectoriesOnly) {
            onSelect(entry.path);
          }
          break;
        case 'rename':
          setRenameEntry(entry);
          setRenameValue(entry.name);
          break;
        case 'download': {
          void handleDownloadEntry(entry);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    }
  };

  const closeRenameDialog = () => {
    setRenameEntry(null);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.entry) return;
    const entry = deleteConfirm.entry;
    setDeleteConfirm({ show: false, entry: null });

    try {
      await sshApi.remove(connectionId, entry.path, entry.isDir);
      loadDirectory(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleRename = async () => {
    if (!renameEntry || !renameValue.trim()) return;
    if (renameValue.trim() === renameEntry.name) {
      closeRenameDialog();
      return;
    }

    const parentPath = getRemoteParentPath(renameEntry.path) ?? '/';
    const newPath = parentPath.endsWith('/')
      ? `${parentPath}${renameValue.trim()}`
      : `${parentPath}/${renameValue.trim()}`;

    try {
      await sshApi.rename(connectionId, renameEntry.path, newPath);
      closeRenameDialog();
      loadDirectory(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  const handleUploadToCurrentDir = async () => {
    if (!isTauriDesktop()) {
      setError(t('ssh.remote.transferNeedsDesktop'));
      return;
    }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: t('ssh.remote.uploadDialogTitle'),
      multiple: true,
      directory: false,
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    setTransferBusy(true);
    setError(null);
    try {
      for (const localPath of paths) {
        const segments = localPath.split(/[/\\]/);
        const base = segments.pop();
        if (!base) continue;
        const remotePath = joinRemotePath(currentPath, base);
        await sshApi.uploadFromLocalPath(connectionId, localPath, remotePath);
      }
      await loadDirectory(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ssh.remote.transferFailed'));
    } finally {
      setTransferBusy(false);
    }
  };

  const openSelectedWorkspace = () => {
    onSelect(selectDirectoriesOnly ? currentPath : (selectedPath || currentPath));
  };

  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '-';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  };

  const getEntryIcon = (entry: RemoteFileEntry) => {
    if (entry.isDir) {
      return (
        <Folder
          size={18}
          className="remote-file-browser__entry-icon"
          aria-hidden="true"
        />
      );
    }
    if (entry.isSymlink) {
      return (
        <Link
          size={18}
          className="remote-file-browser__entry-icon remote-file-browser__entry-icon--link"
          aria-hidden="true"
        />
      );
    }
    return (
      <File
        size={18}
        className="remote-file-browser__entry-icon remote-file-browser__entry-icon--file"
        aria-hidden="true"
      />
    );
  };

  const pathParts = (() => {
    if (currentPath === '/' || currentPath === '') return [];
    if (currentPath === '~') return ['~'];
    if (currentPath.startsWith('~/')) {
      return ['~', ...currentPath.slice(2).split('/').filter(Boolean)];
    }
    return currentPath.split('/').filter(Boolean);
  })();

  const pathAtSegment = (index: number) => {
    if (pathParts[0] === '~') {
      if (index === 0) return '~';
      return `~/${pathParts.slice(1, index + 1).join('/')}`;
    }
    return `/${pathParts.slice(0, index + 1).join('/')}`;
  };

  const browser = (
    <div className="remote-file-browser-overlay">
      <div
        ref={dialogRef}
        className="remote-file-browser"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Header */}
        <div className="remote-file-browser__header">
          <h2 id={titleId} className="remote-file-browser__header-title">
            {t('ssh.remote.selectWorkspace')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="remote-file-browser__close-btn"
            onClick={onCancel}
            aria-label={t('actions.close')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Path Breadcrumb / Input */}
        <div className="remote-file-browser__breadcrumb">
          {isEditingPath ? (
            <input
              ref={pathInputRef}
              className="remote-file-browser__path-input"
              value={pathInputValue}
              onChange={(e) => setPathInputValue(e.target.value)}
              onKeyDown={handlePathInputKeyDown}
              onBlur={handlePathInputBlur}
              autoFocus
              spellCheck={false}
              aria-label={t('ssh.remote.clickToEditPath')}
            />
          ) : (
            <div className="remote-file-browser__breadcrumb-path">
              <button
                type="button"
                className="remote-file-browser__breadcrumb-btn"
                onClick={(e) => { e.stopPropagation(); navigateTo(homeAnchor); }}
                aria-label={t('ssh.remote.homeFolder')}
              >
                <Home size={14} aria-hidden="true" />
              </button>
              <ChevronRight
                size={12}
                className="remote-file-browser__breadcrumb-sep"
                aria-hidden="true"
              />
              {pathParts.length === 0 ? (
                <span className="remote-file-browser__breadcrumb-current">/</span>
              ) : (
                pathParts.map((part, index) => {
                  const segPath = pathAtSegment(index);
                  const isLast = index === pathParts.length - 1;
                  return (
                    <React.Fragment key={segPath}>
                      <button
                        type="button"
                        className={`remote-file-browser__breadcrumb-btn ${isLast ? 'remote-file-browser__breadcrumb-btn--current' : ''}`}
                        onClick={(e) => { e.stopPropagation(); navigateTo(segPath); }}
                      >
                        {part}
                      </button>
                      {!isLast && (
                        <ChevronRight
                          size={12}
                          className="remote-file-browser__breadcrumb-sep"
                          aria-hidden="true"
                        />
                      )}
                    </React.Fragment>
                  );
                })
              )}
              <button
                type="button"
                className="remote-file-browser__breadcrumb-btn remote-file-browser__breadcrumb-btn--edit"
                onClick={() => {
                  setIsEditingPath(true);
                  window.requestAnimationFrame(() => pathInputRef.current?.select());
                }}
                aria-label={t('ssh.remote.clickToEditPath')}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="remote-file-browser__toolbar">
          <button
            type="button"
            className="remote-file-browser__toolbar-btn"
            onClick={() => loadDirectory(currentPath)}
            aria-label={t('actions.refresh')}
            disabled={transferBusy}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="remote-file-browser__toolbar-btn"
            onClick={() => {
              const p = getRemoteParentPath(currentPath);
              if (p !== null) navigateTo(p);
            }}
            aria-label={t('ssh.remote.goToParent')}
            disabled={getRemoteParentPath(currentPath) === null || transferBusy}
          >
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="remote-file-browser__toolbar-btn"
            onClick={() => void handleUploadToCurrentDir()}
            aria-label={t('ssh.remote.upload')}
            disabled={transferBusy}
          >
            <Upload size={15} aria-hidden="true" />
          </button>
        </div>

        {transferBusy && (
          <div className="remote-file-browser__transfer-status" role="status">
            <Loader2
              size={16}
              className="remote-file-browser__spinner-inline"
              aria-hidden="true"
            />
            <span>{t('ssh.remote.transferring')}</span>
          </div>
        )}

        {/* File List */}
        <div className="remote-file-browser__content">
          {error && (
            <div className="remote-file-browser__error" role="alert">
              <span>{error}</span>
              <div className="remote-file-browser__error-actions">
              <button
                type="button"
                onClick={() => loadDirectory(currentPath)}
                aria-label={t('actions.retry')}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label={t('actions.close')}
              >
                <X size={14} aria-hidden="true" />
              </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="remote-file-browser__loading" role="status">
              <Loader2
                size={28}
                className="remote-file-browser__spinner"
                aria-hidden="true"
              />
              <span>{t('app.loading')}</span>
            </div>
          ) : (
            <table
              className="remote-file-browser__table"
              aria-busy={loading || transferBusy}
            >
              <thead className="remote-file-browser__thead">
                <tr>
                  <th className="remote-file-browser__th remote-file-browser__th--name">
                    {t('ssh.remote.name')}
                  </th>
                  <th className="remote-file-browser__th remote-file-browser__th--size">
                    {t('ssh.remote.size')}
                  </th>
                  <th className="remote-file-browser__th remote-file-browser__th--date">
                    {t('ssh.remote.modified')}
                  </th>
                </tr>
              </thead>
              <tbody className="remote-file-browser__tbody">
                {/* Parent directory link */}
                {getRemoteParentPath(currentPath) !== null && (
                  <tr
                    data-remote-file-row
                    tabIndex={0}
                    onClick={() => {
                      const parent = getRemoteParentPath(currentPath);
                      if (parent !== null) navigateTo(parent);
                    }}
                    onKeyDown={(event) => handleRowKeyDown(event, null)}
                    className="remote-file-browser__row remote-file-browser__row--parent"
                  >
                    <td colSpan={3}>
                      <Folder
                        size={16}
                        className="remote-file-browser__entry-icon remote-file-browser__entry-icon--parent"
                        aria-hidden="true"
                      />
                      <span>..</span>
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.path}
                    data-remote-file-row
                    data-remote-file-path={entry.path}
                    tabIndex={0}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => handleEntryDoubleClick(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                    onKeyDown={(event) => handleRowKeyDown(event, entry)}
                    aria-selected={selectedPath === entry.path}
                    className={`remote-file-browser__row ${selectedPath === entry.path ? 'remote-file-browser__row--selected' : ''}`}
                  >
                    <td className="remote-file-browser__td remote-file-browser__td--name">
                      <div className="remote-file-browser__name-cell">
                        {getEntryIcon(entry)}
                        <span className="remote-file-browser__name">{entry.name}</span>
                      </div>
                    </td>
                    <td className="remote-file-browser__td remote-file-browser__td--size">
                      {entry.isDir ? '-' : formatFileSize(entry.size)}
                    </td>
                    <td className="remote-file-browser__td remote-file-browser__td--date">
                      {formatDate(entry.modified)}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && !loading && (
                  <tr>
                    <td colSpan={3} className="remote-file-browser__empty">
                      {t('ssh.remote.emptyDirectory')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu.show && contextMenu.entry && (
          <div
            ref={contextMenuRef}
            className="remote-file-browser__context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            aria-label={t('actions.more')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeContextMenu(true);
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                return;
              }
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]:not(:disabled)',
                ),
              );
              const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
              const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (
                    currentIndex
                    + (event.key === 'ArrowUp' ? -1 : 1)
                    + items.length
                  ) % items.length;
              event.preventDefault();
              items[nextIndex]?.focus();
            }}
          >
            <button
              type="button"
              className="remote-file-browser__context-menu-item"
              onClick={() => handleContextMenuAction('open')}
              role="menuitem"
            >
              <Folder size={14} aria-hidden="true" />
              <span>{t('actions.open') || 'Open'}</span>
            </button>
            {!contextMenu.entry.isDir && (
              <button
                type="button"
                className="remote-file-browser__context-menu-item"
                onClick={() => handleContextMenuAction('download')}
                role="menuitem"
              >
                <Download size={14} aria-hidden="true" />
                <span>{t('ssh.remote.download')}</span>
              </button>
            )}
            <button
              type="button"
              className="remote-file-browser__context-menu-item"
              onClick={() => handleContextMenuAction('rename')}
              role="menuitem"
            >
              <Pencil size={14} aria-hidden="true" />
              <span>{t('ssh.remote.rename')}</span>
            </button>
            <div
              className="remote-file-browser__context-menu-divider"
              role="separator"
            />
            <button
              type="button"
              className="remote-file-browser__context-menu-item remote-file-browser__context-menu-item--danger"
              onClick={() => handleContextMenuAction('delete')}
              role="menuitem"
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>{t('actions.delete') || 'Delete'}</span>
            </button>
          </div>
        )}

        {/* Rename Dialog */}
        {renameEntry && (
          <Modal
            isOpen
            onClose={closeRenameDialog}
            title={t('ssh.remote.rename')}
            size="small"
            showCloseButton
          >
            <div className="remote-file-browser__rename">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="remote-file-browser__dialog-input"
                autoFocus
                aria-label={t('ssh.remote.rename')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    closeRenameDialog();
                  }
                }}
              />
              <div className="remote-file-browser__dialog-actions">
                <Button variant="secondary" size="small" onClick={closeRenameDialog}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleRename}
                  disabled={!renameValue.trim() || renameValue.trim() === renameEntry.name}
                >
                  {t('actions.confirm')}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirm.show}
          title={t('ssh.remote.deleteTitle') || 'Delete'}
          message={deleteConfirm.entry
            ? t('ssh.remote.deleteConfirm') || `Delete "${deleteConfirm.entry.name}"?`
            : ''
          }
          confirmText={t('actions.delete') || 'Delete'}
          cancelText={t('actions.cancel')}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteConfirm({ show: false, entry: null });
            window.requestAnimationFrame(() => dialogRef.current?.focus());
          }}
          destructive
        />

        {/* Footer */}
        <div className="remote-file-browser__footer">
          <div className="remote-file-browser__footer-info">
            {!selectDirectoriesOnly && selectedPath ? (
              <>
                <span className="remote-file-browser__footer-label">{t('ssh.remote.selected')}: </span>
                <span className="remote-file-browser__footer-path">{selectedPath}</span>
              </>
            ) : (
              <span className="remote-file-browser__footer-hint">
                {selectDirectoriesOnly ? currentPath : t('ssh.remote.clickToSelect')}
              </span>
            )}
          </div>
          <div className="remote-file-browser__footer-actions">
            <Button variant="secondary" size="small" onClick={onCancel}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={openSelectedWorkspace}
            >
              {t('ssh.remote.openWorkspace')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(browser, document.body);
};

export default RemoteFileBrowser;
