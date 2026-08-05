import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BadgeCheck,
  CircleUserRound,
  Crown,
  GitBranch,
  GitFork,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import type { TeamMemberRole, TeamWorkflowPhaseKind } from '@/infrastructure/config/types';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceIssue,
  TeamWorkspaceMemberProjection,
  TeamWorkspacePhaseProjection,
  TeamWorkspaceTeamProjection,
} from '../types';
import './TeamWorkspacePanel.scss';

const BtwSessionPanel = React.lazy(() =>
  import('@/flow_chat/components/btw/BtwSessionPanel').then(module => ({
    default: module.BtwSessionPanel,
  })),
);

export interface TeamWorkspacePanelProps {
  state: ActiveTeamWorkspaceState;
  isActive?: boolean;
  workspacePath?: string;
  onClose?: () => void;
}

const SUCCESS = new Set(['ready', 'completed']);
const INFO = new Set(['provisioning', 'queued', 'running']);
const WARNING = new Set(['waiting_user', 'waiting', 'blocked', 'interrupted']);
const ERROR = new Set(['unavailable', 'failed', 'cancelled']);

function statusTone(status: string) {
  if (SUCCESS.has(status)) return 'success';
  if (INFO.has(status)) return 'info';
  if (WARNING.has(status)) return 'warning';
  if (ERROR.has(status)) return 'error';
  return 'neutral';
}

function RoleIcon({ role }: { role: TeamMemberRole }) {
  if (role === 'lead') return <Crown aria-hidden="true" />;
  if (role === 'quality_gate') return <ShieldCheck aria-hidden="true" />;
  return <CircleUserRound aria-hidden="true" />;
}

function PhaseIcon({ kind }: { kind: TeamWorkflowPhaseKind }) {
  if (kind === 'parallel') return <GitFork aria-hidden="true" />;
  if (kind === 'decision') return <GitBranch aria-hidden="true" />;
  if (kind === 'review') return <BadgeCheck aria-hidden="true" />;
  return <ListChecks aria-hidden="true" />;
}

const issueKey = (issue: TeamWorkspaceIssue) => `teamWorkspace.issues.${issue.code}`;

function Status({
  namespace,
  value,
  live = false,
}: {
  namespace: string;
  value: string;
  live?: boolean;
}) {
  const { t } = useTranslation('flow-chat');
  return (
    <span
      className="team-workspace-panel__status"
      data-tone={statusTone(value)}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
    >
      <i aria-hidden="true" />
      {t(`teamWorkspace.${namespace}.${value}`)}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="team-workspace-panel__empty">
      <span className="team-workspace-panel__empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function Header({ team, onClose }: { team: TeamWorkspaceTeamProjection; onClose?: () => void }) {
  const { t } = useTranslation('flow-chat');
  const runStatus = team.activeRun?.status;
  return (
    <header className="team-workspace-panel__header">
      <span className="team-workspace-panel__team-icon" aria-hidden="true"><UsersRound /></span>
      <span className="team-workspace-panel__identity">
        <strong>{team.definition.displayName}</strong>
        {runStatus
          ? <Status namespace="runStatus" value={runStatus} live />
          : <Status namespace="lifecycle" value={team.lifecycle} live />}
      </span>
      {onClose && (
        <button type="button" className="team-workspace-panel__icon-button" onClick={onClose} aria-label={t('teamWorkspace.actions.close')}>
          <X aria-hidden="true" />
        </button>
      )}
    </header>
  );
}

function MemberList({
  members,
  openMember,
  registerButton,
}: {
  members: TeamWorkspaceMemberProjection[];
  openMember: (member: TeamWorkspaceMemberProjection) => void;
  registerButton: (id: string, button: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation('flow-chat');
  return (
    <section aria-labelledby="team-workspace-members">
      <div className="team-workspace-panel__section-title">
        <strong id="team-workspace-members">{t('teamWorkspace.members.title')}</strong>
        <span>{t('teamWorkspace.members.count', { count: members.length })}</span>
      </div>
      {members.length === 0 ? <p className="team-workspace-panel__muted">{t('teamWorkspace.members.empty')}</p> : (
        <div className="team-workspace-panel__list">
          {members.map(member => {
            const canOpen = Boolean(member.childSessionId);
            return (
              <button
                key={member.definition.memberId}
                ref={button => registerButton(member.definition.memberId, button)}
                type="button"
                className="team-workspace-panel__member"
                disabled={!canOpen}
                onClick={() => openMember(member)}
                aria-label={t(canOpen ? 'teamWorkspace.members.open' : 'teamWorkspace.members.unavailable', { name: member.definition.displayName })}
              >
                <span className="team-workspace-panel__role" data-role={member.definition.role}><RoleIcon role={member.definition.role} /></span>
                <span className="team-workspace-panel__member-copy">
                  <span><strong>{member.definition.displayName}</strong><small>{t(`teamWorkspace.roles.${member.definition.role}`)}</small></span>
                  <em>{member.definition.professionalRole}</em>
                </span>
                <Status namespace="memberStatus" value={member.state.status} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PhaseList({ phases }: { phases: TeamWorkspacePhaseProjection[] }) {
  const { t } = useTranslation('flow-chat');
  return (
    <section aria-labelledby="team-workspace-phases">
      <div className="team-workspace-panel__section-title">
        <strong id="team-workspace-phases">{t('teamWorkspace.phases.title')}</strong>
        <span>{t('teamWorkspace.phases.count', { count: phases.length })}</span>
      </div>
      {phases.length === 0 ? <p className="team-workspace-panel__muted">{t('teamWorkspace.phases.empty')}</p> : (
        <ol className="team-workspace-panel__phases">
          {phases.map(phase => (
            <li key={phase.definition.phaseId}>
              <span className="team-workspace-panel__phase-icon"><PhaseIcon kind={phase.definition.kind} /></span>
              <span className="team-workspace-panel__phase-copy">
                <strong>{phase.definition.displayName}</strong>
                <small>{t(`teamWorkspace.phaseKinds.${phase.definition.kind}`)}</small>
              </span>
              <Status namespace="phaseStatus" value={phase.state.status} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export const TeamWorkspacePanel: React.FC<TeamWorkspacePanelProps> = ({
  state,
  isActive = true,
  workspacePath,
  onClose,
}) => {
  const { t, i18n } = useTranslation('flow-chat');
  const [memberId, setMemberId] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusMemberId = useRef<string | null>(null);
  const team = state.snapshot?.activeTeam ?? null;
  const issue = state.error ?? state.snapshot?.issues[0] ?? team?.issues[0];
  const selectedMember = useMemo(
    () => team?.members.find(member => member.definition.memberId === memberId && member.childSessionId) ?? null,
    [memberId, team],
  );

  useEffect(() => {
    if (memberId && !selectedMember) setMemberId(null);
  }, [memberId, selectedMember]);

  useEffect(() => {
    if (memberId || !pendingFocusMemberId.current) return;
    const id = pendingFocusMemberId.current;
    pendingFocusMemberId.current = null;
    buttonRefs.current.get(id)?.focus();
  }, [memberId]);

  const registerButton = useCallback((id: string, button: HTMLButtonElement | null) => {
    if (button) buttonRefs.current.set(id, button);
    else buttonRefs.current.delete(id);
  }, []);

  const returnToTeam = () => {
    pendingFocusMemberId.current = memberId;
    setMemberId(null);
  };

  if (selectedMember && team && state.snapshot) {
    return (
      <aside className="team-workspace-panel team-workspace-panel--conversation" aria-label={t('teamWorkspace.ariaLabel')}>
        <div className="team-workspace-panel__conversation-header">
          <button type="button" className="team-workspace-panel__back" onClick={returnToTeam}>
            <ArrowLeft aria-hidden="true" />{t('teamWorkspace.actions.backToTeam')}
          </button>
          <span>{selectedMember.definition.displayName}</span>
        </div>
        <div className="team-workspace-panel__conversation">
          <Suspense fallback={<EmptyState icon={<LoaderCircle className="team-workspace-panel__spinner" />} title={t('teamWorkspace.memberConversation.loadingTitle')} description={t('teamWorkspace.memberConversation.loadingDescription')} />}>
            <BtwSessionPanel
              childSessionId={selectedMember.childSessionId}
              parentSessionId={state.snapshot.parentSessionId}
              workspacePath={workspacePath}
              isActive={isActive}
              presentationTitle={selectedMember.definition.displayName}
              showKindBadge={false}
            />
          </Suspense>
        </div>
      </aside>
    );
  }

  const closeButton = onClose && (
    <button type="button" className="team-workspace-panel__icon-button team-workspace-panel__icon-button--floating" onClick={onClose} aria-label={t('teamWorkspace.actions.close')}>
      <X aria-hidden="true" />
    </button>
  );
  if (state.status === 'disabled') return <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>{closeButton}<EmptyState icon={<UsersRound />} title={t('teamWorkspace.states.disabledTitle')} description={t('teamWorkspace.states.disabledDescription')} /></aside>;
  if (state.status === 'unsupported') return <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>{closeButton}<EmptyState icon={<ShieldCheck />} title={t('teamWorkspace.states.unsupportedTitle')} description={t('teamWorkspace.states.unsupportedDescription')} /></aside>;
  if (state.status === 'loading') return <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>{closeButton}<EmptyState icon={<LoaderCircle className="team-workspace-panel__spinner" />} title={t('teamWorkspace.states.loadingTitle')} description={t('teamWorkspace.states.loadingDescription')} /></aside>;
  if (!team && (state.status === 'error' || issue)) {
    return (
      <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>{closeButton}<EmptyState
        icon={<ShieldCheck />}
        title={t('teamWorkspace.states.errorTitle')}
        description={issue ? t(issueKey(issue)) : t('teamWorkspace.states.errorDescription')}
        action={issue?.retryable ? <button type="button" className="team-workspace-panel__retry" onClick={state.reload}><RefreshCw />{t('teamWorkspace.actions.retry')}</button> : undefined}
      /></aside>
    );
  }
  if (!team) return <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>{closeButton}<EmptyState icon={<UsersRound />} title={t('teamWorkspace.states.emptyTitle')} description={t('teamWorkspace.states.emptyDescription')} /></aside>;

  const updated = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(team.updatedAt);
  return (
    <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>
      <Header team={team} onClose={onClose} />
      <div className="team-workspace-panel__scroll">
        {issue && (
          <div className="team-workspace-panel__issue" role="alert" title={issue.message || undefined}>
            <span><strong>{t('teamWorkspace.issueTitle')}</strong>{t(issueKey(issue))}</span>
            {issue.retryable && <button type="button" onClick={state.reload}><RefreshCw />{t('teamWorkspace.actions.retry')}</button>}
          </div>
        )}
        <section className="team-workspace-panel__overview" aria-labelledby="team-workspace-overview">
          <small id="team-workspace-overview">{t('teamWorkspace.overview.title')}</small>
          <strong>{team.activeRun?.workflow?.displayName ?? t(team.activeRun ? 'teamWorkspace.overview.workflowUnavailable' : 'teamWorkspace.overview.waiting')}</strong>
          <p>{team.activeRun?.run.objective || team.definition.description}</p>
        </section>
        <MemberList
          members={team.members}
          openMember={member => setMemberId(member.definition.memberId)}
          registerButton={registerButton}
        />
        <PhaseList phases={team.phases} />
        <p className="team-workspace-panel__updated">{t('teamWorkspace.updatedAt', { value: updated })}</p>
      </div>
    </aside>
  );
};

TeamWorkspacePanel.displayName = 'TeamWorkspacePanel';
