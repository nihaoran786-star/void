/**
 * Branch selection modal
 * Supports selecting existing branches or creating new branches
 */

import React, { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Plus, X } from 'lucide-react';
import { createLogger } from '@/shared/utils/logger';
import { IconButton, Button, Input, Checkbox } from '@/component-library';
import { useI18n } from '@/infrastructure/i18n';
import { gitAPI, type GitBranch as GitBranchType } from '../../../infrastructure/api/service-api/GitAPI';
import './BranchSelectModal.scss';

const log = createLogger('BranchSelectModal');

const BRANCH_DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type SelectableBranch = GitBranchType & {
  isCurrent?: boolean;
  hasWorktree?: boolean;
};

export interface BranchSelectResult {
  branch: string;
  isNew: boolean;
  openAfterCreate: boolean;
}

export interface BranchSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: BranchSelectResult) => void;
  repositoryPath: string;
  title?: string;
  currentBranch?: string;
  existingWorktreeBranches?: string[];
  showOpenAfterCreate?: boolean;
  defaultOpenAfterCreate?: boolean;
}

export const BranchSelectModal: React.FC<BranchSelectModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  repositoryPath,
  title,
  currentBranch,
  existingWorktreeBranches = [],
  showOpenAfterCreate = false,
  defaultOpenAfterCreate = false,
}) => {
  const { t } = useI18n('panels/git');
  const { t: tCommon } = useI18n('common');
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [openAfterCreate, setOpenAfterCreate] = useState(defaultOpenAfterCreate);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const resolvedTitle = title ?? t('branchSelect.title');

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedBranch(null);
      setIsNewBranch(false);
      setOpenAfterCreate(defaultOpenAfterCreate);
      setError(null);
    }
  }, [defaultOpenAfterCreate, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      const previouslyFocusedElement = previouslyFocusedElementRef.current;
      previouslyFocusedElementRef.current = null;
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const branchList = await gitAPI.getBranches(repositoryPath, false);
      setBranches(branchList);
    } catch (err) {
      log.error('Failed to load branches', err);
      setError(t('branchSelect.errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [repositoryPath, t]);

  useEffect(() => {
    if (isOpen && repositoryPath) {
      void loadBranches();
    }
  }, [isOpen, loadBranches, repositoryPath]);

  const filteredBranches = useMemo<SelectableBranch[]>(() => {
    let result = branches;

    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(branch =>
        branch.name.toLowerCase().includes(lowerSearch)
      );
    }

    const availableBranches: SelectableBranch[] = [];
    const unavailableBranches: SelectableBranch[] = [];
    const existingWorktreeSet = new Set(existingWorktreeBranches);

    result.forEach(branch => {
      const isCurrent = branch.name === currentBranch;
      const hasWorktree = existingWorktreeSet.has(branch.name);

      if (isCurrent || hasWorktree) {
        unavailableBranches.push({ ...branch, isCurrent, hasWorktree });
      } else {
        availableBranches.push(branch);
      }
    });

    return [...availableBranches, ...unavailableBranches];
  }, [branches, searchTerm, currentBranch, existingWorktreeBranches]);

  const canCreateNewBranch = useMemo(() => {
    if (!searchTerm.trim()) return false;
    const exists = branches.some(
      branch => branch.name.toLowerCase() === searchTerm.toLowerCase()
    );
    return !exists;
  }, [branches, searchTerm]);

  const handleSelectBranch = useCallback((branchName: string, isNew: boolean) => {
    setSelectedBranch(branchName);
    setIsNewBranch(isNew);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedBranch) {
      onSelect({
        branch: selectedBranch,
        isNew: isNewBranch,
        openAfterCreate,
      });
      onClose();
    }
  }, [selectedBranch, isNewBranch, onClose, onSelect, openAfterCreate]);

  const handleDoubleClick = useCallback((branchName: string, isNew: boolean) => {
    onSelect({
      branch: branchName,
      isNew: isNew,
      openAfterCreate,
    });
    onClose();
  }, [onClose, onSelect, openAfterCreate]);

  const handleDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = dialogRef.current;
    const focusableElements = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(BRANCH_DIALOG_FOCUSABLE_SELECTOR))
        .filter(element => element.getClientRects().length > 0)
      : [];

    if (!dialog || focusableElements.length === 0) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex = activeElement instanceof HTMLElement
      ? focusableElements.indexOf(activeElement)
      : -1;
    const nextIndex = activeIndex < 0
      ? (event.shiftKey ? focusableElements.length - 1 : 0)
      : (
        activeIndex
        + (event.shiftKey ? -1 : 1)
        + focusableElements.length
      ) % focusableElements.length;

    event.preventDefault();
    focusableElements[nextIndex]?.focus();
  }, [onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="branch-select-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="branch-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <IconButton 
          className="branch-select-dialog__close"
          variant="ghost"
          size="xs"
          type="button"
          onClick={onClose}
          tooltip={tCommon('actions.close')}
          aria-label={tCommon('actions.close')}
        >
          <X size={14} />
        </IconButton>

        <div className="branch-select-dialog__header">
          <h2 id={titleId} className="branch-select-dialog__title">{resolvedTitle}</h2>
        </div>

        <div className="branch-select-dialog__content">
          <div className="branch-select-dialog__input-wrapper">
            <Input
              ref={inputRef}
              type="text"
              placeholder={t('branchSelect.inputPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="branch-select-dialog__input"
            />
          </div>

          {error && (
            <div className="branch-select-dialog__error" role="alert">
              {error}
            </div>
          )}

          <div className="branch-select-dialog__list">
            {isLoading ? (
              <div className="branch-select-dialog__loading" role="status" aria-live="polite">
                <div className="branch-select-dialog__loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                  <span>{t('branchSelect.loading')}</span>
              </div>
            ) : (
              <>
                {canCreateNewBranch && (
                  <button
                    type="button"
                    className={`branch-select-dialog__item branch-select-dialog__item--new ${
                      selectedBranch === searchTerm && isNewBranch ? 'selected' : ''
                    }`}
                    aria-pressed={selectedBranch === searchTerm && isNewBranch}
                    onClick={() => handleSelectBranch(searchTerm.trim(), true)}
                    onDoubleClick={() => handleDoubleClick(searchTerm.trim(), true)}
                  >
                    <Plus size={14} className="branch-select-dialog__item-icon branch-select-dialog__item-icon--new" />
                    <span className="branch-select-dialog__item-name">
                      {t('branchSelect.createNewLabel')} <strong>{searchTerm.trim()}</strong>
                    </span>
                  </button>
                )}

                {filteredBranches.map((branch) => {
                  const isDisabled = branch.isCurrent || branch.hasWorktree;
                  const hasWorktree = branch.hasWorktree;

                  return (
                    <button
                      type="button"
                      key={branch.name}
                      className={`branch-select-dialog__item ${
                        selectedBranch === branch.name && !isNewBranch ? 'selected' : ''
                      } ${branch.isCurrent ? 'current' : ''} ${isDisabled ? 'disabled' : ''}`}
                      aria-pressed={selectedBranch === branch.name && !isNewBranch}
                      disabled={isDisabled}
                      onClick={() => handleSelectBranch(branch.name, false)}
                      onDoubleClick={() => handleDoubleClick(branch.name, false)}
                    >
                      <GitBranch size={14} className="branch-select-dialog__item-icon" />
                      <span className="branch-select-dialog__item-name">
                        {branch.name}
                      </span>
                      {branch.isCurrent && (
                        <span className="branch-select-dialog__item-badge">{t('branch.current')}</span>
                      )}
                      {hasWorktree && !branch.isCurrent && (
                        <span className="branch-select-dialog__item-badge branch-select-dialog__item-badge--worktree">
                          {t('branchSelect.badges.inUse')}
                        </span>
                      )}
                    </button>
                  );
                })}

                {filteredBranches.length === 0 && !canCreateNewBranch && (
                  <div className="branch-select-dialog__empty">
                    {searchTerm ? t('empty.noMatchingBranches') : t('empty.noBranches')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="branch-select-dialog__footer">
          {showOpenAfterCreate ? (
            <div className="branch-select-dialog__options">
              <Checkbox
                checked={openAfterCreate}
                onChange={(event) => setOpenAfterCreate(event.target.checked)}
                label={t('branchSelect.openAfterCreate.label')}
                description={t('branchSelect.openAfterCreate.description')}
              />
            </div>
          ) : null}
          <Button
            className="branch-select-dialog__btn branch-select-dialog__btn--cancel"
            variant="ghost"
            type="button"
            onClick={onClose}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button
            className="branch-select-dialog__btn branch-select-dialog__btn--confirm"
            variant="primary"
            type="button"
            onClick={handleConfirm}
            disabled={!selectedBranch}
          >
            {tCommon('actions.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

export default BranchSelectModal;
