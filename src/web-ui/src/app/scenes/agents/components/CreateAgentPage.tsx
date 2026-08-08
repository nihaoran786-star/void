import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  FileText,
  SlidersHorizontal,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Switch, Textarea } from '@/component-library';
import {
  SubagentAPI,
  type SubagentLevel,
} from '@/infrastructure/api/service-api/SubagentAPI';
import { toolAPI } from '@/infrastructure/api/service-api/ToolAPI';
import { useCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { Session } from '@/flow_chat/types/flow-chat';
import {
  organizeAgentDraft,
  scenariosFromAllowedParentAgentIds,
  type AgentAuthoringDiagnostic,
  type AgentAuthoringRoute,
  type AgentAuthoringTemplate,
  type AgentScenarioId,
} from '@/shared/services/customization';
import {
  customizationRuntimeCapabilityService,
  type CustomizationRuntimeCapabilityReader,
} from '@/shared/services/customization/CustomizationRuntimeCapabilityService';
import { computeAgentDraftFingerprint } from '@/shared/services/customization/AgentDebugDraft';
import { useNotification } from '@/shared/notification-system';
import { useAgentsStore } from '../agentsStore';
import { useAgentDebugSession } from '../hooks/useAgentDebugSession';
import { AgentDebugChatPanel } from './AgentDebugChatPanel';
import {
  filterToolsForReviewMode,
  normalizeReviewModeState,
  type SubagentEditorToolInfo,
} from './subagentEditorUtils';
import '../AgentsView.scss';
import './CreateAgentPage.scss';

const AUTHORING_ROUTES: Array<{
  id: AgentAuthoringRoute;
  icon: LucideIcon;
}> = [
  { id: 'describe', icon: WandSparkles },
  { id: 'material', icon: FileText },
  { id: 'manual', icon: SlidersHorizontal },
];
const SCENARIOS: AgentScenarioId[] = ['code', 'cowork', 'media'];

type AgentEditorTab = 'name' | 'prompt' | 'tools';

const noopStoreSubscribe = (callback: () => void) => flowChatStore.subscribe(callback);

function useFlowChatSessionById(sessionId: string | undefined): Session | null {
  const getSnapshot = useCallback(
    () => (sessionId ? flowChatStore.getState().sessions.get(sessionId) ?? null : null),
    [sessionId],
  );
  return useSyncExternalStore(noopStoreSubscribe, getSnapshot, () => null);
}

const EditorBackButton: React.FC<{
  onBack: () => void;
  label: string;
}> = ({ onBack, label }) => (
  <div className="tv__editor-bar">
    <button className="tv__back-btn" onClick={onBack} type="button">
      <ArrowLeft size={14} />
      <span>{label}</span>
    </button>
  </div>
);

const SupportedCreateAgentPage: React.FC = () => {
  const { t } = useTranslation('scenes/agents');
  const {
    openHome,
    agentEditorMode,
    editingAgentKey,
    editingAgentId,
    requestCatalogRefresh,
  } = useAgentsStore();
  const notification = useNotification();
  const { hasWorkspace, workspacePath } = useCurrentWorkspace();
  const isEdit = agentEditorMode === 'edit' && Boolean(editingAgentId);

  const [route, setRoute] = useState<AgentAuthoringRoute>('describe');
  const [level, setLevel] = useState<SubagentLevel>('user');
  const [runtimeKey, setRuntimeKey] = useState<string | null>(editingAgentKey);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scenarios, setScenarios] = useState<AgentScenarioId[]>(['code']);
  const [diagnostics, setDiagnostics] = useState<AgentAuthoringDiagnostic[]>([]);
  const [draftPrepared, setDraftPrepared] = useState(false);
  const [readonly, setReadonly] = useState(true);
  const [review, setReview] = useState(false);
  const [toolInfos, setToolInfos] = useState<SubagentEditorToolInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentEditorTab>('name');
  const authoringTemplate = useMemo<AgentAuthoringTemplate>(() => ({
    describeRole: t('agentsOverview.form.template.describeRole'),
    describeResponsibilities: t('agentsOverview.form.template.describeResponsibilities'),
    describeRequirements: t('agentsOverview.form.template.describeRequirements'),
    describeSteps: [
      t('agentsOverview.form.template.describeStep1'),
      t('agentsOverview.form.template.describeStep2'),
      t('agentsOverview.form.template.describeStep3'),
    ],
    materialDescriptionPrefix: t('agentsOverview.form.template.materialDescriptionPrefix'),
    materialRole: t('agentsOverview.form.template.materialRole'),
    materialRules: t('agentsOverview.form.template.materialRules'),
    materialSteps: [
      t('agentsOverview.form.template.materialStep1'),
      t('agentsOverview.form.template.materialStep2'),
      t('agentsOverview.form.template.materialStep3'),
    ],
    materialHeading: t('agentsOverview.form.template.materialHeading'),
  }), [t]);

  useEffect(() => {
    toolAPI.getAllToolsInfo()
      .then((tools) => {
        const normalizedTools = tools
          .map((tool): SubagentEditorToolInfo | null => {
            const name = typeof tool?.name === 'string' ? tool.name : '';
            return name ? { name, isReadonly: Boolean(tool?.is_readonly) } : null;
          })
          .filter((tool): tool is SubagentEditorToolInfo => Boolean(tool));
        setToolInfos(normalizedTools);
      })
      .catch(() => setToolInfos([]));
  }, []);

  useEffect(() => {
    if (!hasWorkspace && level === 'project') {
      setLevel('user');
    }
  }, [hasWorkspace, level]);

  useEffect(() => {
    if (!isEdit || !editingAgentId) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void SubagentAPI.getSubagentDetail({
      subagentKey: editingAgentKey || undefined,
      subagentId: editingAgentId,
      workspacePath: workspacePath || undefined,
    })
      .then((detail) => {
        if (cancelled) return;
        setRuntimeKey(detail.subagentKey);
        setRuntimeId(detail.subagentId);
        setDisplayName(detail.displayName || detail.name);
        setDescription(detail.description);
        setPrompt(detail.prompt);
        setReadonly(detail.readonly);
        setReview(detail.review);
        setLevel(detail.level);
        setSelectedTools(new Set(detail.tools ?? []));
        setScenarios(scenariosFromAllowedParentAgentIds(detail.allowedParentAgentIds ?? []));
        setRoute('manual');
        setDraftPrepared(true);
        setDiagnostics([]);
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editingAgentId, editingAgentKey, isEdit, workspacePath]);

  const diagnosticMessage = useCallback((diagnostic: AgentAuthoringDiagnostic) => (
    t(`agentsOverview.form.diagnostics.${diagnostic.code}`)
  ), [t]);

  const firstDiagnosticFor = useCallback((field: AgentAuthoringDiagnostic['field']) => (
    diagnostics.find((diagnostic) => diagnostic.field === field)
  ), [diagnostics]);

  const handleRouteChange = (nextRoute: AgentAuthoringRoute) => {
    setRoute(nextRoute);
    setDiagnostics([]);
    setDraftPrepared(nextRoute === 'manual');
  };

  const handleOrganizeDraft = () => {
    const result = organizeAgentDraft({
      route,
      displayName,
      sourceText,
      description,
      prompt,
      scenarios,
      template: authoringTemplate,
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    setDisplayName(result.draft.displayName);
    setDescription(result.draft.description);
    setPrompt(result.draft.prompt);
    setScenarios(result.draft.scenarios);
    setDraftPrepared(true);
    notification.success(t('agentsOverview.form.draftPrepared'));
  };

  const toggleScenario = (scenario: AgentScenarioId) => {
    setScenarios((current) => (
      current.includes(scenario)
        ? current.filter((value) => value !== scenario)
        : SCENARIOS.filter((value) => value === scenario || current.includes(value))
    ));
    setDiagnostics((current) => current.filter((item) => item.field !== 'scenarios'));
  };

  const toggleTool = (tool: string) => {
    setSelectedTools((previous) => {
      const next = new Set(previous);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const handleReviewChange = (nextReview: boolean) => {
    setReview(nextReview);
    const next = normalizeReviewModeState({
      review: nextReview,
      readonly,
      selectedTools,
      availableTools: toolInfos,
    });
    setReadonly(next.readonly);
    setSelectedTools(next.selectedTools);
  };

  const handleSubmit = async () => {
    if (!isEdit && route !== 'manual' && !draftPrepared) {
      notification.error(t('agentsOverview.form.prepareFirst'));
      return;
    }
    const result = organizeAgentDraft({
      route: 'manual',
      displayName,
      description,
      prompt,
      scenarios,
      template: authoringTemplate,
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    if (level === 'project' && !workspacePath) {
      notification.error(t('agentsOverview.form.noWorkspace'));
      return;
    }
    if (isEdit && !editingAgentId) return;

    setSubmitting(true);
    try {
      if (isEdit && editingAgentId) {
        await SubagentAPI.updateSubagent({
          subagentKey: runtimeKey || editingAgentKey || undefined,
          subagentId: editingAgentId,
          displayName: result.draft.displayName,
          allowedParentAgentIds: result.draft.allowedParentAgentIds,
          description: result.draft.description,
          prompt: result.draft.prompt,
          readonly,
          review,
          tools: selectedTools.size > 0 ? Array.from(selectedTools) : undefined,
          workspacePath: workspacePath || undefined,
        });
        notification.success(
          t('agentsOverview.form.updateSuccess', { name: result.draft.displayName }),
        );
      } else {
        await SubagentAPI.createSubagent({
          level,
          displayName: result.draft.displayName,
          allowedParentAgentIds: result.draft.allowedParentAgentIds,
          description: result.draft.description,
          prompt: result.draft.prompt,
          readonly,
          review,
          tools: selectedTools.size > 0 ? Array.from(selectedTools) : undefined,
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
        notification.success(
          t('agentsOverview.form.createSuccess', { name: result.draft.displayName }),
        );
      }
      requestCatalogRefresh();
      openHome();
    } catch (error) {
      notification.error(
        `${isEdit
          ? t('agentsOverview.form.updateFailed')
          : t('agentsOverview.form.createFailed')}${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectableTools = filterToolsForReviewMode(toolInfos, review);
  const previewScenarios = useMemo(
    () => scenarios.map((scenario) => t(`agentsOverview.form.scenarios.${scenario}`)),
    [scenarios, t],
  );

  const debugDraft = useMemo(() => ({
    displayName,
    description,
    prompt,
    tools: Array.from(selectedTools),
    readonly,
    review,
  }), [displayName, description, prompt, selectedTools, readonly, review]);

  const debugDraftValid = useMemo(
    () => organizeAgentDraft({
      route: 'manual',
      displayName,
      description,
      prompt,
      scenarios,
      template: authoringTemplate,
    }).isValid,
    [displayName, description, prompt, scenarios, authoringTemplate],
  );

  const debugFingerprint = useMemo(
    () => computeAgentDraftFingerprint(debugDraft),
    [debugDraft],
  );

  const {
    status: debugStatus,
    sessionId: debugSessionId,
    justReplaced: debugJustReplaced,
    error: debugError,
    retry: retryDebugSession,
    acknowledgeMessageSent: acknowledgeDebugMessageSent,
  } = useAgentDebugSession({
    draft: debugDraft,
    isDraftValid: debugDraftValid,
    workspacePath: workspacePath || undefined,
  });

  const debugSession = useFlowChatSessionById(debugSessionId);

  if (isEdit && detailLoading) {
    return (
      <div className="tv">
        <EditorBackButton onBack={openHome} label={t('agentsOverview.backToOverview')} />
        <div className="th__list-body"><div className="th__list-inner">
          <p className="th__title-sub">{t('agentsOverview.form.loadingDetail')}</p>
        </div></div>
      </div>
    );
  }

  if (isEdit && detailError) {
    return (
      <div className="tv">
        <EditorBackButton onBack={openHome} label={t('agentsOverview.backToOverview')} />
        <div className="th__list-body"><div className="th__list-inner">
          <p className="th-create-panel__error">{detailError}</p>
          <Button variant="secondary" size="small" onClick={openHome}>
            {t('agentsOverview.form.cancel')}
          </Button>
        </div></div>
      </div>
    );
  }

  return (
    <div className="tv">
      <EditorBackButton onBack={openHome} label={t('agentsOverview.backToOverview')} />
      <div className="th-create-lab">
        <div className="th-create-lab__chat" data-testid="agent-debug-chat-column">
          <AgentDebugChatPanel
            session={debugSession}
            status={debugStatus}
            draftFingerprint={debugFingerprint}
            justReplaced={debugJustReplaced}
            error={debugError}
            onRetry={retryDebugSession}
            onMessageSent={acknowledgeDebugMessageSent}
          />
        </div>

        <div className="th-create-lab__editor">
          <header className="th-create-lab__sheet">
            <div className="th-create-lab__sheet-heading">
              <h2 className="th__title">
                {t(isEdit ? 'agentsOverview.form.titleEdit' : 'agentsOverview.form.title')}
              </h2>
              <p className="th__title-sub">
                {t(isEdit ? 'agentsOverview.form.subtitleEdit' : 'agentsOverview.form.subtitle')}
              </p>
              <div className="th-create-lab__sheet-name">
                {displayName || t('agentsOverview.form.previewUnnamed')}
              </div>
            </div>
            <div className="th-create-lab__sheet-meta">
              <div className="th-create-lab__sheet-chips">
                {previewScenarios.map((scenario) => (
                  <span key={scenario} className="th-create-lab__sheet-chip">{scenario}</span>
                ))}
              </div>
              <div
                className="th-create-lab__sheet-level"
                title={t('agentsOverview.form.tools')}
              >
                {selectedTools.size}
              </div>
            </div>
          </header>

          <div className="th-create-lab__tabs" role="tablist">
            {(['name', 'prompt', 'tools'] as AgentEditorTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`th-create-lab__tab${activeTab === tab ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab)}
                data-testid={`agent-editor-tab-${tab}`}
              >
                {t(`agentsOverview.debug.tab.${tab}`)}
              </button>
            ))}
          </div>

          <div className="th-create-page__form">
            {!isEdit && (
              <div className="th-authoring-routes" role="tablist" aria-label={t('agentsOverview.form.routeLabel')}>
                {AUTHORING_ROUTES.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={route === id}
                    className={`th-authoring-route${route === id ? ' is-active' : ''}`}
                    onClick={() => handleRouteChange(id)}
                    data-testid={`agent-route-${id}`}
                  >
                    <Icon size={16} />
                    <span>{t(`agentsOverview.form.routes.${id}`)}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              className="th-create-lab__tab-panel"
              role="tabpanel"
              hidden={activeTab !== 'name'}
              data-testid="agent-editor-panel-name"
            >
              <div className="th-create-panel__field">
                <label className="th-create-panel__label" htmlFor="agent-display-name">
                  {t('agentsOverview.form.displayName')}
                </label>
                <Input
                  id="agent-display-name"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setDiagnostics((current) => current.filter((item) => item.field !== 'displayName'));
                    if (route !== 'manual') setDraftPrepared(false);
                  }}
                  placeholder={t('agentsOverview.form.displayNamePlaceholder')}
                  inputSize="small"
                  error={Boolean(firstDiagnosticFor('displayName'))}
                />
                {firstDiagnosticFor('displayName') && (
                  <span className="th-create-panel__error">
                    {diagnosticMessage(firstDiagnosticFor('displayName')!)}
                  </span>
                )}
                {isEdit ? (
                  <div className="th-create-panel__runtime-id">
                    <span>{t('agentsOverview.form.runtimeId')}</span>
                    <code>{runtimeId ?? editingAgentId}</code>
                  </div>
                ) : (
                  <p className="th-create-panel__help">{t('agentsOverview.form.runtimeIdAuto')}</p>
                )}
              </div>

              {!isEdit && route !== 'manual' && (
                <div className="th-create-panel__field">
                  <label className="th-create-panel__label" htmlFor="agent-source-text">
                    {t(`agentsOverview.form.source.${route}.label`)}
                  </label>
                  <Textarea
                    id="agent-source-text"
                    value={sourceText}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      setDraftPrepared(false);
                      setDiagnostics((current) => current.filter((item) => item.field !== 'sourceText'));
                    }}
                    placeholder={t(`agentsOverview.form.source.${route}.placeholder`)}
                    rows={6}
                  />
                  {firstDiagnosticFor('sourceText') && (
                    <span className="th-create-panel__error">
                      {diagnosticMessage(firstDiagnosticFor('sourceText')!)}
                    </span>
                  )}
                  <div className="th-create-panel__organize">
                    <p>{t('agentsOverview.form.localOrganizeHint')}</p>
                    <Button variant="secondary" size="small" onClick={handleOrganizeDraft}>
                      {t('agentsOverview.form.organizeDraft')}
                    </Button>
                  </div>
                </div>
              )}

              <fieldset className="th-create-panel__scenario-field">
                <legend>{t('agentsOverview.form.scenarioLabel')}</legend>
                <p>{t('agentsOverview.form.scenarioHint')}</p>
                <div className="th-create-panel__scenarios">
                  {SCENARIOS.map((scenario) => (
                    <button
                      key={scenario}
                      type="button"
                      aria-pressed={scenarios.includes(scenario)}
                      className={`th-create-panel__scenario${scenarios.includes(scenario) ? ' is-on' : ''}`}
                      onClick={() => toggleScenario(scenario)}
                    >
                      {t(`agentsOverview.form.scenarios.${scenario}`)}
                    </button>
                  ))}
                </div>
                {firstDiagnosticFor('scenarios') && (
                  <span className="th-create-panel__error">
                    {diagnosticMessage(firstDiagnosticFor('scenarios')!)}
                  </span>
                )}
              </fieldset>

              <section className="th-create-panel__configuration">
                <div className="th-create-panel__section-head">
                  <h3>{t('agentsOverview.form.configurationTitle')}</h3>
                  <span>{t('agentsOverview.form.configurationHint')}</span>
                </div>
                <div className="th-create-panel__field">
                  <label className="th-create-panel__label" htmlFor="agent-description">
                    {t('agentsOverview.form.description')}
                  </label>
                  <Input
                    id="agent-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setDiagnostics((current) => current.filter((item) => item.field !== 'description'));
                    }}
                    placeholder={t('agentsOverview.form.descPlaceholder')}
                    inputSize="small"
                    error={Boolean(firstDiagnosticFor('description'))}
                  />
                  {firstDiagnosticFor('description') && (
                    <span className="th-create-panel__error">
                      {diagnosticMessage(firstDiagnosticFor('description')!)}
                    </span>
                  )}
                </div>
              </section>
            </div>

            <div
              className="th-create-lab__tab-panel"
              role="tabpanel"
              hidden={activeTab !== 'prompt'}
              data-testid="agent-editor-panel-prompt"
            >
              <section className="th-create-panel__configuration">
                <div className="th-create-panel__section-head">
                  <h3>{t('agentsOverview.form.configurationTitle')}</h3>
                  <span>{t('agentsOverview.form.configurationHint')}</span>
                </div>
                <div className="th-create-panel__field">
                  <label className="th-create-panel__label" htmlFor="agent-prompt">
                    {t('agentsOverview.form.prompt')}
                  </label>
                  <Textarea
                    id="agent-prompt"
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      setDiagnostics((current) => current.filter((item) => item.field !== 'prompt'));
                    }}
                    placeholder={t('agentsOverview.form.promptPlaceholder')}
                    rows={9}
                  />
                  {firstDiagnosticFor('prompt') && (
                    <span className="th-create-panel__error">
                      {diagnosticMessage(firstDiagnosticFor('prompt')!)}
                    </span>
                  )}
                </div>
              </section>
            </div>

            <div
              className="th-create-lab__tab-panel"
              role="tabpanel"
              hidden={activeTab !== 'tools'}
              data-testid="agent-editor-panel-tools"
            >
              <div className="th-create-panel__field th-create-panel__field--row">
                <div className="th-create-panel__level-group">
                  {(['user', 'project'] as SubagentLevel[]).map((nextLevel) => {
                    const disabled = (nextLevel === 'project' && !hasWorkspace) || isEdit;
                    return (
                      <button
                        key={nextLevel}
                        type="button"
                        disabled={disabled}
                        className={`th-create-panel__level-btn${level === nextLevel ? ' is-active' : ''}`}
                        onClick={() => setLevel(nextLevel)}
                        title={disabled && !isEdit ? t('agentsOverview.form.noWorkspace') : undefined}
                      >
                        {nextLevel === 'user'
                          ? t('agentsOverview.filterUser')
                          : t('agentsOverview.filterProject')}
                      </button>
                    );
                  })}
                </div>
                <div className="th-create-panel__readonly-row">
                  <label className="th-create-panel__label">{t('agentsOverview.form.readonly')}</label>
                  <Switch
                    checked={readonly}
                    disabled={review}
                    onChange={(event) => setReadonly(review ? true : event.target.checked)}
                    size="small"
                  />
                </div>
                <div className="th-create-panel__readonly-row">
                  <label className="th-create-panel__label">{t('agentsOverview.form.review')}</label>
                  <Switch
                    checked={review}
                    onChange={(event) => handleReviewChange(event.target.checked)}
                    size="small"
                  />
                </div>
              </div>

              {selectableTools.length > 0 && (
                <div className="th-create-panel__field">
                  <label className="th-create-panel__label">
                    {t('agentsOverview.form.tools')}
                    <span className="th-create-panel__label-hint">
                      {review
                        ? t('agentsOverview.form.reviewToolsHint')
                        : t('agentsOverview.form.toolsHint', {
                          optionalLabel: t('agentsOverview.form.toolsOptional'),
                        })}
                    </span>
                  </label>
                  <div className="th-create-panel__tools">
                    {selectableTools.map((tool) => (
                      <button
                        key={tool.name}
                        type="button"
                        className={`th-list__tool-item${selectedTools.has(tool.name) ? ' is-on' : ''}`}
                        onClick={() => toggleTool(tool.name)}
                      >
                        <span className="th-list__tool-item-name">{tool.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="th-create-panel__preview" data-testid="agent-draft-preview">
              <span>{t('agentsOverview.form.previewTitle')}</span>
              <strong>{displayName || t('agentsOverview.form.previewUnnamed')}</strong>
              <p>{description || t('agentsOverview.form.previewEmpty')}</p>
              <div>{previewScenarios.join(' · ') || t('agentsOverview.form.previewNoScenario')}</div>
            </aside>

            <div className="th-create-page__actions">
              <Button variant="secondary" size="small" onClick={openHome} disabled={submitting}>
                {t('agentsOverview.form.cancel')}
              </Button>
              <Button variant="primary" size="small" onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? '…'
                  : t(isEdit ? 'agentsOverview.form.save' : 'agentsOverview.form.submit')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface CreateAgentPageProps {
  capabilityService?: CustomizationRuntimeCapabilityReader;
}

const CreateAgentPage: React.FC<CreateAgentPageProps> = ({
  capabilityService = customizationRuntimeCapabilityService,
}) => {
  const { t } = useTranslation('scenes/agents');
  const { openHome } = useAgentsStore();
  const runtimeCapability = capabilityService.getCapability('agent_management');

  if (runtimeCapability.status === 'unsupported') {
    return (
      <div className="tv" data-testid="create-agent-runtime-unsupported">
        <EditorBackButton
          onBack={openHome}
          label={t('agentsOverview.backToOverview')}
        />
        <main className="th__list-body">
          <div className="th__list-inner">
            <section className="th-create-panel__runtime-unsupported">
              <h2>{t('runtimeUnsupported.title')}</h2>
              <p>{t('runtimeUnsupported.description')}</p>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return <SupportedCreateAgentPage />;
};

export default CreateAgentPage;
