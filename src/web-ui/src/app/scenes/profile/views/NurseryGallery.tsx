import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart2,
  Bot,
  ChevronRight,
  MessageSquarePlus,
  Settings,
  Star,
  Wrench,
} from 'lucide-react';
import {
  DirectoryTopBar,
  GalleryEmpty,
  GalleryGrid,
  GalleryLayout,
  GalleryZone,
} from '@/app/components';
import { Badge, Button, confirmDanger } from '@/component-library';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { useApp } from '@/app/hooks/useApp';
import { useSceneStore } from '@/app/stores/sceneStore';
import { flowChatManager } from '@/flow_chat/services/FlowChatManager';
import type { WorkspaceInfo } from '@/shared/types';
import { configAPI } from '@/infrastructure/api/service-api/ConfigAPI';
import { configManager } from '@/infrastructure/config/services/ConfigManager';
import type { AIModelConfig } from '@/infrastructure/config/types';
import { createLogger } from '@/shared/utils/logger';
import AssistantCard from './AssistantCard';
import AssistantQuickInput from './AssistantQuickInput';
import { useNurseryStore } from '../nurseryStore';
import { estimateTokens, formatTokenCount } from './useTokenEstimate';

const log = createLogger('NurseryGallery');

interface TemplateStats {
  primaryModelName: string;
  fastModelName: string;
  enabledToolCount: number;
}

/**
 * Staff HQ presentation of the assistant gallery:
 * chief assistant hero + person-card grid + one quiet foundation row.
 */
const NurseryGallery: React.FC = () => {
  const { t } = useTranslation('scenes/profile');
  const { t: tAgents } = useTranslation('scenes/agents');
  const { assistantWorkspacesList, createAssistantWorkspace, setActiveWorkspace, deleteAssistantWorkspace } = useWorkspaceContext();
  const openScene = useSceneStore(s => s.openScene);
  const { switchLeftPanelTab } = useApp();
  const { openTemplate, openAssistant } = useNurseryStore();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [templateStats, setTemplateStats] = useState<TemplateStats | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [allModels, funcModels, modeConf] = await Promise.all([
          configManager.getConfig<AIModelConfig[]>('ai.models').catch(() => [] as AIModelConfig[]),
          configManager.getConfig<Record<string, string>>('ai.func_agent_models').catch(() => ({} as Record<string, string>)),
          configAPI.getAgentProfileConfig('agentic').catch(() => null),
        ]);
        const models = allModels ?? [];
        const fm = funcModels ?? {};

        const resolveModelName = (slotId: string, fallback: string): string => {
          const id = fm[slotId] ?? '';
          if (!id || id === slotId) return fallback;
          const found = models.find((m) => m.id === id && m.enabled);
          return found?.name ?? fallback;
        };

        setTemplateStats({
          primaryModelName: resolveModelName('primary', t('nursery.template.stats.primaryDefault')),
          fastModelName: resolveModelName('fast', t('nursery.template.stats.fastDefault')),
          enabledToolCount: modeConf?.enabled_tools?.length ?? 0,
        });
      } catch (e) {
        log.error('Failed to load template stats', e);
      }
    })();
  }, [t]);

  const tokenBreakdown = useMemo(
    () => (templateStats ? estimateTokens('', templateStats.enabledToolCount, 0, 0) : null),
    [templateStats],
  );

  const handleCreateAssistant = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const newWorkspace = await createAssistantWorkspace();
      openAssistant(newWorkspace.id);
    } catch (e) {
      log.error('Failed to create assistant workspace', e);
    } finally {
      setCreating(false);
    }
  }, [creating, createAssistantWorkspace, openAssistant]);

  // Primary assistant (no assistantId) fronts the page; the rest fill the grid.
  const primaryWorkspace = useMemo(
    () => assistantWorkspacesList.find(w => !w.assistantId) ?? null,
    [assistantWorkspacesList],
  );

  const secondaryWorkspaces = useMemo(
    () => assistantWorkspacesList.filter(w => w.assistantId),
    [assistantWorkspacesList],
  );

  const handleDeleteRequest = useCallback(async (workspace: WorkspaceInfo) => {
    if (deleting) return;
    const identity = workspace.identity;
    const name = identity?.name?.trim() || workspace.name || t('nursery.card.unnamed');
    const ok = await confirmDanger(
      t('nursery.card.deleteConfirmTitle'),
      t('nursery.card.deleteConfirmMessage', { name }),
      {
        confirmText: t('nursery.card.deleteConfirm'),
        cancelText: t('nursery.card.deleteCancel'),
      },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAssistantWorkspace(workspace.id);
    } catch (e) {
      log.error('Failed to delete assistant workspace', e);
    } finally {
      setDeleting(false);
    }
  }, [deleting, deleteAssistantWorkspace, t]);

  const handleNewAssistantSession = useCallback(
    async (workspace: WorkspaceInfo) => {
      openScene('session');
      switchLeftPanelTab('sessions');
      try {
        await flowChatManager.createChatSession({ workspacePath: workspace.rootPath }, 'Claw');
        await setActiveWorkspace(workspace.id);
      } catch (e) {
        log.error('Failed to create assistant session from gallery', e);
      }
    },
    [openScene, setActiveWorkspace, switchLeftPanelTab],
  );

  const renderHero = (workspace: WorkspaceInfo) => {
    const identity = workspace.identity;
    const name = identity?.name?.trim() || workspace.name || t('nursery.card.unnamed');
    const emoji = identity?.emoji?.trim() ?? '';
    const creature = identity?.creature?.trim() || '';
    const modelPrimary = identity?.modelPrimary?.trim() || '';
    const modelFast = identity?.modelFast?.trim() || '';

    return (
      <section className="assistant-hq-hero" aria-label={name}>
        <div className="assistant-hq-hero__head">
          <div className="assistant-hq-hero__avatar" aria-hidden>
            {emoji ? (
              <span className="assistant-hq-hero__emoji">{emoji}</span>
            ) : (
              <Bot className="assistant-hq-hero__avatar-icon" size={26} strokeWidth={1.5} />
            )}
          </div>
          <div className="assistant-hq-hero__id">
            <div className="assistant-hq-hero__name-row">
              <span className="assistant-hq-hero__name">{name}</span>
              <span className="assistant-hq-hero__badge">{t('nursery.card.primaryBadge')}</span>
            </div>
            <div className="assistant-hq-hero__chips">
              {creature && <Badge variant="neutral">{creature}</Badge>}
              {modelPrimary && <Badge variant="accent">{modelPrimary}</Badge>}
              {modelFast && modelFast !== modelPrimary && <Badge variant="neutral">{modelFast}</Badge>}
            </div>
          </div>
          <div className="assistant-hq-hero__actions">
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={() => openAssistant(workspace.id)}
            >
              <Settings size={13} aria-hidden />
              {t('nursery.hq.configure')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => { void handleNewAssistantSession(workspace); }}
            >
              <MessageSquarePlus size={13} aria-hidden />
              {t('nursery.card.newSession')}
            </Button>
          </div>
        </div>
        <AssistantQuickInput
          workspacePath={workspace.rootPath}
          workspaceId={workspace.id}
          assistantName={name}
        />
      </section>
    );
  };

  return (
    <GalleryLayout className="assistant-hq">
      <DirectoryTopBar
        title={t('nursery.gallery.title')}
        count={assistantWorkspacesList.length}
        mission={tAgents('missions.assistant')}
        primary={{
          label: t('nursery.gallery.newAssistant'),
          onClick: () => { void handleCreateAssistant(); },
          disabled: creating,
        }}
      />

      <div className="gallery-zones">
        {primaryWorkspace && renderHero(primaryWorkspace)}

        <GalleryZone
          id="assistant-hq-zone"
          title={t('nursery.gallery.assistantsTitle')}
          subtitle={t('nursery.gallery.assistantsSubtitle')}
          tools={(
            <span className="gallery-zone-count">{secondaryWorkspaces.length}</span>
          )}
        >
          {secondaryWorkspaces.length === 0 ? (
            <GalleryEmpty
              icon={<Bot size={32} strokeWidth={1.5} />}
              message={t('nursery.hq.empty')}
            />
          ) : (
            <GalleryGrid minCardWidth={280}>
              {secondaryWorkspaces.map((workspace, i) => (
                <AssistantCard
                  key={workspace.id}
                  workspace={workspace}
                  onClick={() => openAssistant(workspace.id)}
                  onNewSession={() => { void handleNewAssistantSession(workspace); }}
                  onDelete={() => { void handleDeleteRequest(workspace); }}
                  style={{ '--card-index': i } as React.CSSProperties}
                />
              ))}
            </GalleryGrid>
          )}
        </GalleryZone>

        {/* Team foundation: one quiet wide row into the template page */}
        <button
          type="button"
          className="assistant-hq-foundation"
          onClick={openTemplate}
          aria-label={t('nursery.hq.foundationTitle')}
        >
          <div className="assistant-hq-foundation__text">
            <span className="assistant-hq-foundation__title">{t('nursery.hq.foundationTitle')}</span>
            <span className="assistant-hq-foundation__subtitle">{t('nursery.template.subtitle')}</span>
          </div>
          {templateStats && tokenBreakdown && (
            <div className="assistant-hq-foundation__stats">
              <span className="assistant-hq-foundation__stat">
                <Star size={11} strokeWidth={2} aria-hidden />
                {templateStats.primaryModelName}
              </span>
              {templateStats.fastModelName !== templateStats.primaryModelName && (
                <span className="assistant-hq-foundation__stat">
                  <Star size={11} strokeWidth={1.5} aria-hidden style={{ opacity: 0.7 }} />
                  {templateStats.fastModelName}
                </span>
              )}
              <span className="assistant-hq-foundation__stat">
                <Wrench size={11} strokeWidth={2} aria-hidden />
                {t('nursery.template.stats.tools', { count: templateStats.enabledToolCount })}
              </span>
              <span className="assistant-hq-foundation__stat">
                <BarChart2 size={11} strokeWidth={2} aria-hidden />
                ~{formatTokenCount(tokenBreakdown.total)} tok · {tokenBreakdown.percentage}
              </span>
            </div>
          )}
          <ChevronRight size={15} strokeWidth={1.8} className="assistant-hq-foundation__go" aria-hidden />
        </button>
      </div>
    </GalleryLayout>
  );
};

export default NurseryGallery;
