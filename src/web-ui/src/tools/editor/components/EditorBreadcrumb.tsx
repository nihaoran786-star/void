/** File path breadcrumb with a dropdown for quick navigation. */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, File, Folder, Code, Loader2, ArrowLeft } from 'lucide-react';
import { getFileIconType } from '@/tools/file-system/utils/fileIcons';
import { workspaceAPI } from '@/infrastructure/api';
import { useI18n } from '@/infrastructure/i18n';
import { createLogger } from '@/shared/utils/logger';
import { computeFixedPopoverPosition } from '@/shared/utils/fixedPopoverViewport';
import { Tooltip } from '@/component-library';
import './EditorBreadcrumb.scss';

const log = createLogger('EditorBreadcrumb');

export interface EditorBreadcrumbProps {
  /** Full file path */
  filePath: string;
  /** Workspace path (for calculating relative path) */
  workspacePath?: string;
  /** Custom class name */
  className?: string;
}

interface PathSegment {
  name: string;
  fullPath: string;
  isFile: boolean;
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Get icon component based on file name */
const getFileIconComponent = (fileName: string, size: number = 12): React.ReactElement => {
  const iconType = getFileIconType({ name: fileName, isDirectory: false } as any);
  
  switch (iconType) {
    case 'javascript':
    case 'typescript':
    case 'react':
    case 'vue':
    case 'python':
    case 'rust':
    case 'go':
    case 'java':
    case 'c-cpp':
    case 'html':
    case 'css':
    case 'sass':
    case 'code':
      return <Code size={size} />;
    default:
      return <File size={size} />;
  }
};

/** Get directory name from path */
const getDirectoryName = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
};

/** Get parent directory path */
const getParentPath = (path: string): string | null => {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return null;
  return normalized.substring(0, lastSlash);
};

/** Dropdown menu component (rendered to body via Portal) */
interface DropdownMenuProps {
  isOpen: boolean;
  items: FileItem[];
  loading: boolean;
  currentDirPath: string;
  initialDirPath: string;
  onSelect: (item: FileItem) => void;
  onGoBack: () => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  currentFilePath: string;
  menuLabel: string;
  goBackLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string | null;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  isOpen,
  items,
  loading,
  currentDirPath,
  initialDirPath,
  onSelect,
  onGoBack,
  onClose,
  anchorEl,
  currentFilePath,
  menuLabel,
  goBackLabel,
  loadingLabel,
  emptyLabel,
  errorLabel,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menu = menuRef.current;
      setPosition(computeFixedPopoverPosition(
        rect,
        menu?.offsetWidth || 220,
        menu?.offsetHeight || Math.min(300, window.innerHeight - 16),
        2,
      ));
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorEl]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        anchorEl?.focus({ preventScroll: true });
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorEl]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const firstMenuItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      (firstMenuItem ?? menuRef.current)?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [isOpen, loading, items]);

  if (!isOpen) return null;

  // Sort: directories first, then by name
  const sortedItems = [...items].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  // Check if we can go back to parent
  const canGoBack = currentDirPath !== initialDirPath;
  const currentDirName = getDirectoryName(currentDirPath);
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const menuItems = menuRef.current
      ? Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'))
      : [];
    if (menuItems.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = document.activeElement instanceof HTMLElement
      ? menuItems.indexOf(document.activeElement)
      : -1;
    let nextIndex = 0;
    if (event.key === 'End') {
      nextIndex = menuItems.length - 1;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex >= menuItems.length - 1 ? 0 : currentIndex + 1;
    }
    menuItems[nextIndex]?.focus();
  };

  const menuContent = (
    <div 
      ref={menuRef} 
      className="editor-breadcrumb-dropdown"
      role="menu"
      aria-label={menuLabel}
      tabIndex={-1}
      onKeyDown={handleMenuKeyDown}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
      }}
    >
      {canGoBack && (
        <div className="editor-breadcrumb-dropdown__header">
          <Tooltip content={goBackLabel} placement="top">
            <button 
              type="button"
              className="editor-breadcrumb-dropdown__back"
              role="menuitem"
              aria-label={goBackLabel}
              onClick={(e) => {
                e.stopPropagation();
                onGoBack();
              }}
            >
              <ArrowLeft size={12} />
            </button>
          </Tooltip>
          <Tooltip content={currentDirPath} placement="top">
            <span className="editor-breadcrumb-dropdown__title">
              {currentDirName}
            </span>
          </Tooltip>
        </div>
      )}
      
      {loading ? (
        <div className="editor-breadcrumb-dropdown__loading" role="status" aria-live="polite">
          <Loader2 size={14} className="editor-breadcrumb-dropdown__spinner" />
          <span>{loadingLabel}</span>
        </div>
      ) : errorLabel ? (
        <div className="editor-breadcrumb-dropdown__empty editor-breadcrumb-dropdown__empty--error" role="alert">
          {errorLabel}
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="editor-breadcrumb-dropdown__empty" role="status">
          {emptyLabel}
        </div>
      ) : (
        <ul className="editor-breadcrumb-dropdown__list" role="none">
          {sortedItems.map((item) => {
            const isCurrentFile = item.path.replace(/\\/g, '/') === currentFilePath.replace(/\\/g, '/');
            return (
              <li key={item.path} role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-current={isCurrentFile ? 'page' : undefined}
                  title={item.name}
                  className={`editor-breadcrumb-dropdown__item ${isCurrentFile ? 'editor-breadcrumb-dropdown__item--current' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(item);
                  }}
                >
                  <span className="editor-breadcrumb-dropdown__item-icon">
                    {item.isDirectory ? (
                      <Folder size={14} />
                    ) : (
                      getFileIconComponent(item.name, 14)
                    )}
                  </span>
                  <span className="editor-breadcrumb-dropdown__item-name">
                    {item.name}
                  </span>
                  {item.isDirectory && (
                    <ChevronRight size={12} className="editor-breadcrumb-dropdown__item-arrow" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return createPortal(menuContent, document.body);
};
export const EditorBreadcrumb: React.FC<EditorBreadcrumbProps> = ({
  filePath,
  workspacePath,
  className = '',
}) => {
  const { t } = useI18n('tools');
  const { t: tCommon } = useI18n('common');
  // Dropdown menu state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownItems, setDropdownItems] = useState<FileItem[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [dropdownError, setDropdownError] = useState<string | null>(null);
  const [currentDirPath, setCurrentDirPath] = useState<string>('');
  const [initialDirPath, setInitialDirPath] = useState<string>('');
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const directoryRequestIdRef = useRef(0);

  // Parse path into segments
  const segments = useMemo<PathSegment[]>(() => {
    if (!filePath) return [];

    const normalizedPath = filePath.replace(/\\/g, '/');
    let relativePath = normalizedPath;
    const normalizedWorkspace = workspacePath ? workspacePath.replace(/\\/g, '/') : '';

    if (normalizedWorkspace) {
      if (normalizedPath.toLowerCase().startsWith(normalizedWorkspace.toLowerCase())) {
        relativePath = normalizedPath.slice(normalizedWorkspace.length).replace(/^\//, '');
      }
    }

    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) return [];

    const result: PathSegment[] = [];
    
    // Add root directory as first level
    if (normalizedWorkspace) {
      const rootName = normalizedWorkspace.split('/').filter(Boolean).pop() || 'root';
      result.push({
        name: rootName,
        fullPath: normalizedWorkspace,
        isFile: false,
      });
    }

    let currentPath = normalizedWorkspace;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      result.push({
        name: part,
        fullPath: currentPath,
        isFile: i === parts.length - 1,
      });
    }

    return result;
  }, [filePath, workspacePath]);

  // Load directory contents
  const loadDirectoryContents = useCallback(async (dirPath: string) => {
    const requestId = ++directoryRequestIdRef.current;
    setDropdownLoading(true);
    setDropdownError(null);
    setCurrentDirPath(dirPath);
    try {
      const fileTree = await workspaceAPI.getFileTree(dirPath, 1);
      if (requestId !== directoryRequestIdRef.current) {
        return;
      }
      const rootNode = fileTree?.[0];
      const children = rootNode?.children || [];
      
      const items: FileItem[] = children
        .filter((entry: any) => {
          const name = entry.name || '';
          return !name.startsWith('.') && 
                 !['node_modules', 'target', 'dist', 'build', '__pycache__', '.git'].includes(name);
        })
        .map((entry: any) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory || false,
        }));

      setDropdownItems(items);
    } catch (error) {
      log.error('Failed to load directory', error);
      if (requestId === directoryRequestIdRef.current) {
        setDropdownItems([]);
        setDropdownError(t('editor.common.loadFailed'));
      }
    } finally {
      if (requestId === directoryRequestIdRef.current) {
        setDropdownLoading(false);
      }
    }
  }, [t]);

  // Handle segment click
  const handleSegmentClick = useCallback((segment: PathSegment, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    const target = event.currentTarget as HTMLElement;
    
    if (openDropdown === segment.fullPath) {
      setOpenDropdown(null);
      setAnchorEl(null);
    } else {
      setOpenDropdown(segment.fullPath);
      setAnchorEl(target);
      
      const dirPath = segment.isFile 
        ? segment.fullPath.substring(0, segment.fullPath.lastIndexOf('/'))
        : segment.fullPath;
      
      setInitialDirPath(dirPath);
      loadDirectoryContents(dirPath);
    }
  }, [openDropdown, loadDirectoryContents]);

  // Handle dropdown item selection
  const handleDropdownSelect = useCallback(async (item: FileItem) => {
    if (item.isDirectory) {
      loadDirectoryContents(item.path);
    } else {
      setOpenDropdown(null);
      setAnchorEl(null);
      
      const { fileTabManager } = await import('@/shared/services/FileTabManager');
      fileTabManager.openFile({
        filePath: item.path,
        fileName: item.name,
        workspacePath
      });
    }
  }, [loadDirectoryContents, workspacePath]);

  const handleGoBack = useCallback(() => {
    const parentPath = getParentPath(currentDirPath);
    if (parentPath) {
      loadDirectoryContents(parentPath);
    }
  }, [currentDirPath, loadDirectoryContents]);

  const handleCloseDropdown = useCallback(() => {
    directoryRequestIdRef.current += 1;
    setOpenDropdown(null);
    setAnchorEl(null);
  }, []);

  if (segments.length === 0) {
    return null;
  }

  const maxVisibleSegments = 6;
  let displaySegments: (PathSegment | { name: string; isEllipsis: true })[] = segments;
  
  if (segments.length > maxVisibleSegments) {
    displaySegments = [
      segments[0],
      { name: '…', isEllipsis: true },
      ...segments.slice(-4)
    ];
  }

  return (
    <nav className={`editor-breadcrumb ${className}`} aria-label={t('editor.breadcrumbs')}>
      {displaySegments.map((segment, index) => {
        const isEllipsis = 'isEllipsis' in segment && segment.isEllipsis;
        const pathSegment = segment as PathSegment;
        const isDropdownOpen = openDropdown === pathSegment.fullPath;

        return (
          <React.Fragment key={isEllipsis ? 'ellipsis' : pathSegment.fullPath}>
            {index > 0 && (
              <ChevronRight 
                size={10} 
                className="editor-breadcrumb__separator" 
                aria-hidden="true"
              />
            )}
            
            {isEllipsis ? (
              <span className="editor-breadcrumb__item editor-breadcrumb__item--ellipsis" aria-hidden="true">
                {segment.name}
              </span>
            ) : (
              <Tooltip content={pathSegment.fullPath} placement="bottom">
                <button
                  type="button"
                  className={`editor-breadcrumb__item ${
                    pathSegment.isFile 
                      ? 'editor-breadcrumb__item--file' 
                      : 'editor-breadcrumb__item--folder'
                  } editor-breadcrumb__item--clickable ${isDropdownOpen ? 'editor-breadcrumb__item--active' : ''}`}
                  onClick={(e) => handleSegmentClick(pathSegment, e)}
                  aria-haspopup="menu"
                  aria-expanded={isDropdownOpen}
                >
                  <span className="editor-breadcrumb__item-icon">
                    {pathSegment.isFile ? (
                      getFileIconComponent(pathSegment.name)
                    ) : (
                      <Folder size={12} />
                    )}
                  </span>
                  <span className="editor-breadcrumb__item-text">
                    {pathSegment.name}
                  </span>
                </button>
              </Tooltip>
            )}
          </React.Fragment>
        );
      })}
      
      <DropdownMenu
        isOpen={openDropdown !== null}
        items={dropdownItems}
        loading={dropdownLoading}
        currentDirPath={currentDirPath}
        initialDirPath={initialDirPath}
        onSelect={handleDropdownSelect}
        onGoBack={handleGoBack}
        onClose={handleCloseDropdown}
        anchorEl={anchorEl}
        currentFilePath={filePath}
        menuLabel={t('editor.breadcrumbs')}
        goBackLabel={tCommon('nav.back')}
        loadingLabel={t('editor.common.loading')}
        emptyLabel={t('fileTree.empty')}
        errorLabel={dropdownError}
      />
    </nav>
  );
};

EditorBreadcrumb.displayName = 'EditorBreadcrumb';

export default EditorBreadcrumb;
