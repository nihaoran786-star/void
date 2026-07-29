import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  SlidersHorizontal,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea } from '@/component-library';
import type {
  SkillAuthoringDetail,
  SkillLevel,
} from '@/infrastructure/config/types';
import { useWorkspaceManagerSync } from '@/infrastructure/hooks/useWorkspaceManagerSync';
import {
  existingSkillAuthoringAdapter,
  customizationRuntimeCapabilityService,
  organizeSkillDraft,
  skillScenariosFromAllowedParentAgentIds,
  type SkillAuthoringDiagnostic,
  SkillAuthoringError,
  type SkillAuthoringErrorCode,
  type SkillAuthoringGateway,
  type SkillAuthoringRoute,
  type SkillAuthoringTemplate,
  type SkillScenarioId,
  type CustomizationRuntimeCapabilityReader,
} from '@/shared/services/customization';
import { useNotification } from '@/shared/notification-system';
import { createLogger } from '@/shared/utils/logger';
import './SkillAuthoringPage.scss';

const log = createLogger('SkillAuthoringPage');
const AUTHORING_ROUTES: Array<{
  id: SkillAuthoringRoute;
  icon: LucideIcon;
}> = [
  { id: 'describe', icon: WandSparkles },
  { id: 'material', icon: FileText },
  { id: 'manual', icon: SlidersHorizontal },
];
const SCENARIOS: SkillScenarioId[] = ['code', 'cowork', 'media'];
const EMPTY_PROMPTS = ['', '', ''];

export interface SkillAuthoringPageProps {
  mode: 'create' | 'edit';
  skillKey?: string;
  onBack: () => void;
  onSaved: (detail: SkillAuthoringDetail) => void;
  gateway?: SkillAuthoringGateway;
  capabilityService?: CustomizationRuntimeCapabilityReader;
}

const SkillAuthoringPage: React.FC<SkillAuthoringPageProps> = ({
  mode,
  skillKey,
  onBack,
  onSaved,
  gateway = existingSkillAuthoringAdapter,
  capabilityService = customizationRuntimeCapabilityService,
}) => {
  const { t } = useTranslation('scenes/skills');
  const notification = useNotification();
  const { workspacePath, hasWorkspace, isRemoteWorkspace } = useWorkspaceManagerSync();
  const isEdit = mode === 'edit';
  const managementCapability = capabilityService.getCapability('skill_management');

  const [route, setRoute] = useState<SkillAuthoringRoute>('describe');
  const [level, setLevel] = useState<SkillLevel>('user');
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scenarios, setScenarios] = useState<SkillScenarioId[]>(['code']);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(EMPTY_PROMPTS);
  const [diagnostics, setDiagnostics] = useState<SkillAuthoringDiagnostic[]>([]);
  const [draftPrepared, setDraftPrepared] = useState(false);
  const [detailLoading, setDetailLoading] = useState(isEdit);
  const [detailError, setDetailError] = useState<SkillAuthoringErrorCode | null>(null);
  const [detailRecoveryPath, setDetailRecoveryPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authoringTemplate = useMemo<SkillAuthoringTemplate>(() => ({
    describeDescriptionPrefix: t('authoring.template.describeDescriptionPrefix'),
    describeRole: t('authoring.template.describeRole'),
    describeRulesHeading: t('authoring.template.describeRulesHeading'),
    describeRules: [
      t('authoring.template.describeRule1'),
      t('authoring.template.describeRule2'),
      t('authoring.template.describeRule3'),
    ],
    materialDescriptionPrefix: t('authoring.template.materialDescriptionPrefix'),
    materialRole: t('authoring.template.materialRole'),
    materialRulesHeading: t('authoring.template.materialRulesHeading'),
    materialRules: [
      t('authoring.template.materialRule1'),
      t('authoring.template.materialRule2'),
      t('authoring.template.materialRule3'),
    ],
    materialHeading: t('authoring.template.materialHeading'),
    suggestedPrompts: [
      t('authoring.template.suggestedPrompt1'),
      t('authoring.template.suggestedPrompt2'),
      t('authoring.template.suggestedPrompt3'),
    ],
  }), [t]);

  useEffect(() => {
    if (managementCapability.status === 'unsupported') {
      setDetailLoading(false);
      return;
    }
    if (!isEdit || !skillKey) {
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void gateway.getDetail({
      skillKey,
      workspacePath: skillKey.startsWith('project::')
        ? workspacePath || undefined
        : undefined,
    })
      .then((detail) => {
        if (cancelled) return;
        setRuntimeId(detail.runtimeId);
        setRevision(detail.revision);
        setDisplayName(detail.displayName);
        setDescription(detail.description);
        setInstructions(detail.instructions);
        setScenarios(skillScenariosFromAllowedParentAgentIds(
          detail.allowedParentAgentIds,
        ));
        setSuggestedPrompts([
          ...detail.suggestedPrompts.slice(0, 3),
          ...EMPTY_PROMPTS,
        ].slice(0, 3));
        setLevel(detail.level);
        setRoute('manual');
        setDraftPrepared(true);
      })
      .catch((error) => {
        if (!cancelled) {
          log.error('Failed to load authored Skill detail', error);
          setDetailError(
            error instanceof SkillAuthoringError ? error.code : 'write_failed',
          );
          setDetailRecoveryPath(
            error instanceof SkillAuthoringError
              ? error.recoveryPath ?? null
              : null,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, isEdit, managementCapability.status, skillKey, workspacePath]);

  useEffect(() => {
    if ((!hasWorkspace || isRemoteWorkspace) && level === 'project' && !isEdit) {
      setLevel('user');
    }
  }, [hasWorkspace, isEdit, isRemoteWorkspace, level]);

  const diagnosticMessage = useCallback((diagnostic: SkillAuthoringDiagnostic) => (
    t(`authoring.diagnostics.${diagnostic.code}`)
  ), [t]);
  const firstDiagnosticFor = useCallback((field: SkillAuthoringDiagnostic['field']) => (
    diagnostics.find((diagnostic) => diagnostic.field === field)
  ), [diagnostics]);

  const updateDraftField = (field: SkillAuthoringDiagnostic['field']) => {
    setDiagnostics((current) => current.filter((item) => item.field !== field));
    if (route !== 'manual') setDraftPrepared(false);
  };

  const handleRouteChange = (nextRoute: SkillAuthoringRoute) => {
    setRoute(nextRoute);
    setDiagnostics([]);
    setDraftPrepared(nextRoute === 'manual');
  };

  const toggleScenario = (scenario: SkillScenarioId) => {
    setScenarios((current) => (
      current.includes(scenario)
        ? current.filter((value) => value !== scenario)
        : SCENARIOS.filter((value) => value === scenario || current.includes(value))
    ));
    updateDraftField('scenarios');
  };

  const updateSuggestedPrompt = (index: number, value: string) => {
    setSuggestedPrompts((current) => current.map(
      (prompt, promptIndex) => promptIndex === index ? value : prompt,
    ));
    updateDraftField('suggestedPrompts');
  };

  const handleOrganizeDraft = () => {
    const result = organizeSkillDraft({
      route,
      displayName,
      sourceText,
      description,
      instructions,
      scenarios,
      suggestedPrompts,
      template: authoringTemplate,
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    setDescription(result.draft.description);
    setInstructions(result.draft.instructions);
    setScenarios(result.draft.scenarios);
    setSuggestedPrompts([
      ...result.draft.suggestedPrompts,
      ...EMPTY_PROMPTS,
    ].slice(0, 3));
    setDraftPrepared(true);
    notification.success(t('authoring.draftPrepared'));
  };

  const handleSubmit = async () => {
    if (managementCapability.status === 'unsupported') {
      notification.error(t('authoring.runtimeUnsupported'));
      return;
    }
    if (!isEdit && route !== 'manual' && !draftPrepared) {
      notification.error(t('authoring.prepareFirst'));
      return;
    }
    const result = organizeSkillDraft({
      route: 'manual',
      displayName,
      description,
      instructions,
      scenarios,
      suggestedPrompts,
      template: authoringTemplate,
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    if (level === 'project' && (!workspacePath || isRemoteWorkspace)) {
      notification.error(
        isRemoteWorkspace
          ? t('authoring.remoteProjectUnsupported')
          : t('messages.noWorkspace'),
      );
      return;
    }
    if (isEdit && (!skillKey || !revision)) return;

    setSubmitting(true);
    try {
      const common = {
        displayName: result.draft.displayName,
        description: result.draft.description,
        instructions: result.draft.instructions,
        allowedParentAgentIds: result.draft.allowedParentAgentIds,
        suggestedPrompts: result.draft.suggestedPrompts,
        workspacePath: isEdit && skillKey?.startsWith('project::')
          ? workspacePath || undefined
          : undefined,
      };
      const detail = isEdit
        ? await gateway.update({
          ...common,
          skillKey: skillKey!,
          expectedRevision: revision!,
        })
        : await gateway.create({
          ...common,
          level,
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
      notification.success(t(
        isEdit ? 'authoring.updateSuccess' : 'authoring.createSuccess',
        { name: detail.displayName },
      ));
      onSaved(detail);
    } catch (error) {
      log.error('Failed to save authored Skill', error);
      const errorCode = error instanceof SkillAuthoringError
        ? error.code
        : 'write_failed';
      const localizedError = t(`authoring.errors.${errorCode}`);
      const recoveryPath = error instanceof SkillAuthoringError
        ? error.recoveryPath
        : undefined;
      notification.error(t(
        isEdit ? 'authoring.updateFailed' : 'authoring.createFailed',
        {
          error: recoveryPath
            ? `${localizedError} ${t('authoring.recoveryPath', { path: recoveryPath })}`
            : localizedError,
        },
      ));
    } finally {
      setSubmitting(false);
    }
  };

  if (managementCapability.status === 'unsupported') {
    return (
      <div className="skill-authoring">
        <button type="button" className="skill-authoring__back" onClick={onBack}>
          <ArrowLeft size={14} />
          {t('authoring.back')}
        </button>
        <div
          className="skill-authoring__status"
          data-testid="skill-authoring-runtime-unsupported"
        >
          <p>{t('authoring.runtimeUnsupported')}</p>
        </div>
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="skill-authoring">
        <button type="button" className="skill-authoring__back" onClick={onBack}>
          <ArrowLeft size={14} />
          {t('authoring.back')}
        </button>
        <div className="skill-authoring__status" aria-busy="true">
          {t('authoring.loadingDetail')}
        </div>
      </div>
    );
  }
  if (detailError) {
    return (
      <div className="skill-authoring">
        <button type="button" className="skill-authoring__back" onClick={onBack}>
          <ArrowLeft size={14} />
          {t('authoring.back')}
        </button>
        <div className="skill-authoring__status skill-authoring__status--error">
          <p>{t(`authoring.errors.${detailError}`)}</p>
          {detailRecoveryPath && (
            <p>{t('authoring.recoveryPath', { path: detailRecoveryPath })}</p>
          )}
          <Button variant="secondary" size="small" onClick={onBack}>
            {t('authoring.back')}
          </Button>
        </div>
      </div>
    );
  }

  const previewScenarios = scenarios.map(
    (scenario) => t(`authoring.scenarios.${scenario}`),
  );

  return (
    <div className="skill-authoring">
      <button type="button" className="skill-authoring__back" onClick={onBack}>
        <ArrowLeft size={14} />
        {t('authoring.back')}
      </button>
      <div className="skill-authoring__scroll">
        <div className="skill-authoring__inner">
          <header className="skill-authoring__header">
            <h1>{t(isEdit ? 'authoring.titleEdit' : 'authoring.titleCreate')}</h1>
            <p>{t(isEdit ? 'authoring.subtitleEdit' : 'authoring.subtitleCreate')}</p>
          </header>

          {!isEdit && (
            <div
              className="skill-authoring__routes"
              role="tablist"
              aria-label={t('authoring.routeLabel')}
            >
              {AUTHORING_ROUTES.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={route === id}
                  className={`skill-authoring__route${route === id ? ' is-active' : ''}`}
                  onClick={() => handleRouteChange(id)}
                >
                  <Icon size={16} />
                  {t(`authoring.routes.${id}`)}
                </button>
              ))}
            </div>
          )}

          <div className="skill-authoring__field">
            <label htmlFor="skill-display-name">{t('authoring.displayName')}</label>
            <Input
              id="skill-display-name"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                updateDraftField('displayName');
              }}
              placeholder={t('authoring.displayNamePlaceholder')}
              inputSize="small"
              error={Boolean(firstDiagnosticFor('displayName'))}
            />
            {firstDiagnosticFor('displayName') && (
              <span className="skill-authoring__error">
                {diagnosticMessage(firstDiagnosticFor('displayName')!)}
              </span>
            )}
            <p className="skill-authoring__help">
              {isEdit
                ? t('authoring.runtimeIdValue', { id: runtimeId })
                : t('authoring.runtimeIdAuto')}
            </p>
          </div>

          {!isEdit && route !== 'manual' && (
            <div className="skill-authoring__field">
              <label htmlFor="skill-source-text">
                {t(`authoring.source.${route}.label`)}
              </label>
              <Textarea
                id="skill-source-text"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  updateDraftField('sourceText');
                }}
                placeholder={t(`authoring.source.${route}.placeholder`)}
                rows={7}
              />
              {firstDiagnosticFor('sourceText') && (
                <span className="skill-authoring__error">
                  {diagnosticMessage(firstDiagnosticFor('sourceText')!)}
                </span>
              )}
              <div className="skill-authoring__organize">
                <p>{t('authoring.localOrganizeHint')}</p>
                <Button variant="secondary" size="small" onClick={handleOrganizeDraft}>
                  {t('authoring.organizeDraft')}
                </Button>
              </div>
            </div>
          )}

          <fieldset className="skill-authoring__scenarios">
            <legend>{t('authoring.scenarioLabel')}</legend>
            <p>{t('authoring.scenarioHint')}</p>
            <div>
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario}
                  type="button"
                  aria-pressed={scenarios.includes(scenario)}
                  className={scenarios.includes(scenario) ? 'is-active' : ''}
                  onClick={() => toggleScenario(scenario)}
                >
                  {t(`authoring.scenarios.${scenario}`)}
                </button>
              ))}
            </div>
            {firstDiagnosticFor('scenarios') && (
              <span className="skill-authoring__error">
                {diagnosticMessage(firstDiagnosticFor('scenarios')!)}
              </span>
            )}
          </fieldset>

          <section className="skill-authoring__configuration">
            <div className="skill-authoring__section-head">
              <h2>{t('authoring.configurationTitle')}</h2>
              <span>{t('authoring.configurationHint')}</span>
            </div>
            <div className="skill-authoring__field">
              <label htmlFor="skill-description">{t('authoring.description')}</label>
              <Input
                id="skill-description"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  updateDraftField('description');
                }}
                placeholder={t('authoring.descriptionPlaceholder')}
                inputSize="small"
                error={Boolean(firstDiagnosticFor('description'))}
              />
              {firstDiagnosticFor('description') && (
                <span className="skill-authoring__error">
                  {diagnosticMessage(firstDiagnosticFor('description')!)}
                </span>
              )}
            </div>
            <div className="skill-authoring__field">
              <label htmlFor="skill-instructions">{t('authoring.instructions')}</label>
              <Textarea
                id="skill-instructions"
                value={instructions}
                onChange={(event) => {
                  setInstructions(event.target.value);
                  updateDraftField('instructions');
                }}
                placeholder={t('authoring.instructionsPlaceholder')}
                rows={10}
              />
              {firstDiagnosticFor('instructions') && (
                <span className="skill-authoring__error">
                  {diagnosticMessage(firstDiagnosticFor('instructions')!)}
                </span>
              )}
            </div>
            <div className="skill-authoring__field">
              <label>{t('authoring.suggestedPrompts')}</label>
              <div className="skill-authoring__prompt-list">
                {suggestedPrompts.map((prompt, index) => (
                  <Input
                    key={index}
                    value={prompt}
                    onChange={(event) => updateSuggestedPrompt(index, event.target.value)}
                    placeholder={t('authoring.suggestedPromptPlaceholder', {
                      number: index + 1,
                    })}
                    inputSize="small"
                  />
                ))}
              </div>
              {firstDiagnosticFor('suggestedPrompts') && (
                <span className="skill-authoring__error">
                  {diagnosticMessage(firstDiagnosticFor('suggestedPrompts')!)}
                </span>
              )}
            </div>
          </section>

          <section className="skill-authoring__preview" aria-label={t('authoring.previewTitle')}>
            <span>{t('authoring.previewTitle')}</span>
            <strong>{displayName || t('authoring.previewUnnamed')}</strong>
            <p>{description || t('authoring.previewNoDescription')}</p>
            <div>
              {t('authoring.previewScenarios', {
                scenarios: previewScenarios.join('、') || t('authoring.previewNone'),
              })}
            </div>
            <div>{t('authoring.permissionInherited')}</div>
            <div>{t('authoring.installScope', {
              scope: t(`form.level.${level}`),
            })}</div>
          </section>

          <div className="skill-authoring__level-actions">
            <div className="skill-authoring__levels" aria-label={t('form.level.label')}>
              {(['user', 'project'] as SkillLevel[]).map((nextLevel) => {
                const disabled = isEdit
                  || (nextLevel === 'project' && (!hasWorkspace || isRemoteWorkspace));
                return (
                  <button
                    key={nextLevel}
                    type="button"
                    disabled={disabled}
                    aria-pressed={level === nextLevel}
                    className={level === nextLevel ? 'is-active' : ''}
                    onClick={() => setLevel(nextLevel)}
                  >
                    {t(`form.level.${nextLevel}`)}
                  </button>
                );
              })}
            </div>
            <Button variant="secondary" size="small" onClick={onBack}>
              {t('authoring.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting
                ? t('authoring.saving')
                : t(isEdit ? 'authoring.saveUpdate' : 'authoring.createAction')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillAuthoringPage;
