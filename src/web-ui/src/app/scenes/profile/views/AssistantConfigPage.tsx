import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Input,
} from '@/component-library';
import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import { notificationService } from '@/shared/notification-system';
import { createLogger } from '@/shared/utils/logger';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { WorkspaceKind } from '@/shared/types';
import { useMyAgentStore } from '@/app/scenes/my-agent/myAgentStore';
import { useAgentIdentityDocument } from '@/app/scenes/my-agent/useAgentIdentityDocument';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { MEditor } from '@/tools/editor/meditor';
import DeferredSessionsSection from '@/app/components/NavPanel/sections/sessions/DeferredSessionsSection';
import AssistantQuickInput from './AssistantQuickInput';
import { useNurseryStore } from '../nurseryStore';
import { useSceneStore } from '@/app/stores/sceneStore';

const log = createLogger('AssistantConfigPage');

const PERSONA_DOC_FILES = ['IDENTITY.md', 'SOUL.md', 'USER.md'] as const;
type PersonaDocFile = typeof PERSONA_DOC_FILES[number];

function personaDocFullPath(workspaceRoot: string, fileName: PersonaDocFile): string {
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${root}/${fileName}`;
}

function isFileMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|no such file|not found/i.test(message);
}

const DEFAULT_AGENT_NAME = 'void Agent';

type RightPanelView = 'info' | 'personaDoc';

interface PersonaDocState {
  fileName: PersonaDocFile;
  content: string;
  loading: boolean;
  error: string | null;
}

interface AssistantConfigPageProps {
  isActive?: boolean;
}

const AssistantConfigPage: React.FC<AssistantConfigPageProps> = ({ isActive = true }) => {
  const { t } = useTranslation('scenes/profile');
  const openScene = useSceneStore((state) => state.openScene);
  const { isLight } = useTheme();
  const { openGallery, activeWorkspaceId } = useNurseryStore();
  const selectedAssistantWorkspaceId = useMyAgentStore((s) => s.selectedAssistantWorkspaceId);
  const { assistantWorkspacesList, currentWorkspace } = useWorkspaceContext();

  const effectiveWorkspaceId = useMemo(() => {
    const inList = (id: string | null | undefined) =>
      id && assistantWorkspacesList.some((w) => w.id === id) ? id : null;

    // Explicit selection from nursery gallery takes highest priority,
    // followed by the selected assistant store, then the active workspace.
    return (
      inList(activeWorkspaceId) ??
      inList(selectedAssistantWorkspaceId) ??
      (currentWorkspace?.workspaceKind === WorkspaceKind.Assistant ? inList(currentWorkspace.id) : null) ??
      null
    );
  }, [
    activeWorkspaceId,
    assistantWorkspacesList,
    currentWorkspace?.id,
    currentWorkspace?.workspaceKind,
    selectedAssistantWorkspaceId,
  ]);

  const workspace = useMemo(
    () =>
      effectiveWorkspaceId
        ? assistantWorkspacesList.find((w) => w.id === effectiveWorkspaceId) ?? null
        : null,
    [assistantWorkspacesList, effectiveWorkspaceId],
  );
  const workspacePath = workspace?.rootPath ?? '';

  const {
    document: identityDocument,
    updateField: updateIdentityField,
    reload: reloadIdentityDocument,
  } = useAgentIdentityDocument(workspacePath);

  const displayIdentity = useMemo(() => {
    const api = workspace?.identity;
    return {
      name: identityDocument.name.trim() || api?.name?.trim() || '',
      creature: identityDocument.creature.trim() || api?.creature?.trim() || '',
      vibe: identityDocument.vibe.trim() || api?.vibe?.trim() || '',
      emoji: identityDocument.emoji.trim() || api?.emoji?.trim() || '',
    };
  }, [identityDocument, workspace?.identity]);

  const [editingField, setEditingField] = useState<'name' | 'emoji' | 'creature' | 'vibe' | null>(null);
  const [editValue, setEditValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const metaInputRef = useRef<HTMLInputElement>(null);
  const [rightView, setRightView] = useState<RightPanelView>('info');
  const [personaDoc, setPersonaDoc] = useState<PersonaDocState | null>(null);
  const personaSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personaPendingRef = useRef<{ file: PersonaDocFile; content: string } | null>(null);

  const flushPersonaWrite = useCallback(async (file: PersonaDocFile, content: string) => {
    if (!workspacePath) return;
    const fullPath = personaDocFullPath(workspacePath, file);
    try {
      await workspaceAPI.writeFileContent(workspacePath, fullPath, content);
      if (file === 'IDENTITY.md') {
        await reloadIdentityDocument();
      }
    } catch (e) {
      log.error('persona doc save', e);
      notificationService.error(t('nursery.assistant.personaDocSaveFailed'));
    }
  }, [workspacePath, reloadIdentityDocument, t]);

  const flushPersonaWriteRef = useRef(flushPersonaWrite);
  flushPersonaWriteRef.current = flushPersonaWrite;

  const openPersonaDoc = useCallback((fileName: PersonaDocFile) => {
    if (personaDoc?.fileName === fileName) {
      setRightView('info');
      setPersonaDoc(null);
      return;
    }

    setPersonaDoc({ fileName, content: '', loading: true, error: null });
    setRightView('personaDoc');
    personaPendingRef.current = null;

    if (!workspacePath) return;
    const fullPath = personaDocFullPath(workspacePath, fileName);
    workspaceAPI.readFileContent(fullPath)
      .then((content) => {
        setPersonaDoc((prev) => prev?.fileName === fileName ? { ...prev, content, loading: false } : prev);
        personaPendingRef.current = { file: fileName, content };
      })
      .catch((err) => {
        if (isFileMissingError(err)) {
          setPersonaDoc((prev) => prev?.fileName === fileName ? { ...prev, content: '', loading: false } : prev);
          personaPendingRef.current = { file: fileName, content: '' };
        } else {
          setPersonaDoc((prev) => prev?.fileName === fileName
            ? { ...prev, content: '', loading: false, error: err instanceof Error ? err.message : String(err) }
            : prev);
        }
      });
  }, [personaDoc, workspacePath]);

  const handlePersonaDocChange = useCallback((value: string) => {
    if (!personaDoc) return;
    const { fileName } = personaDoc;
    setPersonaDoc((prev) => prev ? { ...prev, content: value } : prev);
    personaPendingRef.current = { file: fileName, content: value };
    if (personaSaveTimerRef.current) {
      clearTimeout(personaSaveTimerRef.current);
    }
    personaSaveTimerRef.current = setTimeout(() => {
      personaSaveTimerRef.current = null;
      const pending = personaPendingRef.current;
      if (!pending || pending.file !== fileName || !workspacePath) return;
      void flushPersonaWrite(pending.file, pending.content);
    }, 600);
  }, [personaDoc, workspacePath, flushPersonaWrite]);

  const closePersonaDoc = useCallback(() => {
    if (personaDoc && personaPendingRef.current) {
      const { file, content } = personaPendingRef.current;
      void flushPersonaWriteRef.current(file, content);
    }
    if (personaSaveTimerRef.current) {
      clearTimeout(personaSaveTimerRef.current);
      personaSaveTimerRef.current = null;
    }
    personaPendingRef.current = null;
    setPersonaDoc(null);
    setRightView('info');
  }, [personaDoc]);

  useEffect(() => {
    return () => {
      if (personaSaveTimerRef.current) clearTimeout(personaSaveTimerRef.current);
      const pending = personaPendingRef.current;
      if (pending && workspacePath) {
        void flushPersonaWriteRef.current(pending.file, pending.content);
      }
    };
  }, [workspacePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rightView === 'personaDoc') closePersonaDoc();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rightView, closePersonaDoc]);

  const startEdit = useCallback((field: 'name' | 'emoji' | 'creature' | 'vibe') => {
    setEditingField(field);
    setEditValue(
      field === 'name'
        ? displayIdentity.name
        : field === 'emoji'
          ? displayIdentity.emoji
          : field === 'creature'
            ? displayIdentity.creature
            : displayIdentity.vibe,
    );
    setTimeout(() => {
      (field === 'name' ? nameInputRef : metaInputRef).current?.focus();
    }, 10);
  }, [displayIdentity]);

  const commitEdit = useCallback(() => {
    if (!editingField) return;
    updateIdentityField(editingField, editValue.trim());
    setEditingField(null);
  }, [editingField, editValue, updateIdentityField]);

  const onEditKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditingField(null);
  }, [commitEdit]);

  const identityName = displayIdentity.name || DEFAULT_AGENT_NAME;
  const handleOpenAutomation = useCallback(() => {
    openScene('automation');
  }, [openScene]);

  // ── Right panel: identity info ──────────────────────────────────────────

  const renderInfoPanel = () => (
    <div className="assistant-desk__side">
      <div className="assistant-desk__side-shell">
        {/* Persona docs */}
        <div className="assistant-desk__section assistant-desk__section--nested">
          <div className="assistant-desk__section-head">
            <span className="assistant-desk__section-title">{t('nursery.assistant.personaDocsTitle')}</span>
          </div>
          <div className="assistant-desk__doc-list">
            {PERSONA_DOC_FILES.map((fileName) => {
              const selected = personaDoc?.fileName === fileName && rightView === 'personaDoc';
              const labelKey = fileName.replace(/\.md$/i, '') as 'SOUL' | 'USER' | 'IDENTITY';
              return (
                <Button
                  key={fileName}
                  type="button"
                  variant="ghost"
                  size="small"
                  className={`assistant-desk__doc-row${selected ? ' assistant-desk__doc-row--selected' : ''}`}
                  onClick={() => openPersonaDoc(fileName)}
                >
                  <span className="assistant-desk__doc-row-icon"><FileText size={12} /></span>
                  <span className="assistant-desk__doc-row-label">{t(`nursery.assistant.personaDocs.${labelKey}`)}</span>
                  <span className="assistant-desk__doc-row-file">{fileName}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="assistant-desk__side-divider" role="separator" aria-hidden="true" />

        {/* Scheduled tasks are managed from the first-level Automation scene. */}
        <div className="assistant-desk__section assistant-desk__section--nested assistant-desk__section--schedule">
          <div className="assistant-desk__section-schedule-body">
            <div className="assistant-desk__automation">
              <div>
                <span className="assistant-desk__automation-title">{t('common:automation.assistantEntry.title')}</span>
                <p>{t('common:automation.assistantEntry.description')}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="small"
                className="assistant-desk__automation-action"
                onClick={handleOpenAutomation}
              >
                {t('common:automation.assistantEntry.button')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Right panel: persona doc editor ────────────────────────────────────

  const renderPersonaDocPanel = () => {
    if (!personaDoc) return null;
    const { fileName, content, loading, error } = personaDoc;
    const docLabelKey = fileName.replace(/\.md$/i, '') as 'SOUL' | 'USER' | 'IDENTITY';
    return (
      <div className="assistant-desk__side">
        <div className="assistant-desk__side-shell assistant-desk__side-shell--editor">
          <div className="assistant-desk__editor">
            <div className="assistant-desk__editor-head">
              <IconButton
                type="button"
                size="xs"
                className="assistant-desk__editor-back"
                onClick={closePersonaDoc}
                aria-label={t('nursery.template.closeDetail')}
                tooltip={t('nursery.template.closeDetail')}
              >
                <ArrowLeft size={13} />
              </IconButton>
              <span className="assistant-desk__editor-title">{t(`nursery.assistant.personaDocs.${docLabelKey}`)}</span>
              <IconButton
                type="button"
                size="xs"
                variant="danger"
                className="assistant-desk__editor-close"
                onClick={closePersonaDoc}
                aria-label={t('nursery.template.closeDetail')}
                tooltip={t('nursery.template.closeDetail')}
              >
                <X size={13} />
              </IconButton>
            </div>
            <div className="assistant-desk__editor-body">
              {error && <p className="assistant-desk__editor-error">{t('nursery.assistant.personaDocLoadFailed')}: {error}</p>}
              {loading ? (
                <div className="assistant-desk__loading"><RefreshCw size={14} className="assistant-hq-spin" /></div>
              ) : (
                <MEditor
                  key={fileName}
                  value={content}
                  onChange={handlePersonaDocChange}
                  theme={isLight ? 'light' : 'dark'}
                  toolbar={false}
                  mode="ir"
                  height="100%"
                  className="assistant-desk__editor-meditor"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="assistant-subpage assistant-desk">
      {/* Slim back bar */}
      <div className="assistant-subpage__bar">
        <IconButton
          type="button"
          size="small"
          className="assistant-subpage__back"
          onClick={openGallery}
          aria-label={t('nursery.backToGallery')}
          tooltip={t('nursery.backToGallery')}
        >
          <ArrowLeft size={13} />
        </IconButton>
        <span className="assistant-subpage__bar-label">{t('nursery.backToGallery')}</span>
      </div>

      {/* Two-column layout */}
      <div className="assistant-desk__layout">
        {/* Left: identity header + quick input + sessions */}
        <div className="assistant-desk__left">
          {/* Identity header above the input */}
          <div className="assistant-desk__header">
            <div className="assistant-desk__header-info">
              {editingField === 'name' ? (
                <Input
                  ref={nameInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onEditKey}
                  className="assistant-desk__name-input"
                />
              ) : (
                <span
                  className="assistant-desk__name"
                  role="button"
                  tabIndex={0}
                  onClick={() => startEdit('name')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit('name'); } }}
                  title={t('hero.editNameTitle')}
                >
                  {identityName}
                </span>
              )}
              <div className="assistant-desk__meta">
                {editingField === 'creature' ? (
                  <Input
                    ref={metaInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={onEditKey}
                    size="small"
                    className="assistant-desk__meta-input"
                  />
                ) : (
                  <span
                    className={`assistant-desk__meta-tag${!displayIdentity.creature ? ' is-empty' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit('creature')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit('creature'); } }}
                  >
                    {displayIdentity.creature || t('identity.creaturePlaceholderShort')}
                  </span>
                )}
                {(displayIdentity.creature || displayIdentity.vibe) && (
                  <span className="assistant-desk__meta-dot" aria-hidden>·</span>
                )}
                {editingField === 'vibe' ? (
                  <Input
                    ref={metaInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={onEditKey}
                    size="small"
                    className="assistant-desk__meta-input"
                  />
                ) : (
                  <span
                    className={`assistant-desk__meta-tag${!displayIdentity.vibe ? ' is-empty' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit('vibe')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit('vibe'); } }}
                  >
                    {displayIdentity.vibe || t('identity.vibePlaceholderShort')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <AssistantQuickInput
            workspacePath={workspacePath}
            workspaceId={workspace?.id}
            assistantName={identityName}
          />
          <div className="assistant-desk__sessions">
            <h2 className="assistant-desk__sessions-title">{t('nursery.assistant.sessionsSectionTitle')}</h2>
            <DeferredSessionsSection
              workspaceId={workspace?.id}
              workspacePath={workspacePath}
              assistantLabel={identityName}
              isActiveWorkspace
              isVisible={isActive}
              showSessionModeIcon={false}
            />
          </div>
        </div>

        {/* Right: persona docs + schedule */}
        <div className="assistant-desk__right">
          {rightView === 'personaDoc' ? renderPersonaDocPanel() : renderInfoPanel()}
        </div>
      </div>
    </div>
  );
};

export default AssistantConfigPage;
