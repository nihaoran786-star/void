import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CircleUserRound,
  Crown,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
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
  selectedMemberId?: string | null;
  onSelectedMemberChange?: (memberId: string | null) => void;
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

const MAP_RX = 200;
const MAP_RY = 155;
const MAP_MIN_ZOOM = 0.6;
const MAP_MAX_ZOOM = 1.8;

interface MapCamera {
  x: number;
  y: number;
  k: number;
}

function memberPosition(index: number, count: number) {
  const angle = ((-90 + (360 / count) * index) * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(angle) * MAP_RX),
    y: Math.round(Math.sin(angle) * MAP_RY),
  };
}

function PhaseSegBar({ phases, updated }: { phases: TeamWorkspacePhaseProjection[]; updated: string }) {
  const { t } = useTranslation('flow-chat');
  const done = phases.filter(phase => SUCCESS.has(phase.state.status)).length;
  const current = phases.find(phase => INFO.has(phase.state.status))
    ?? [...phases].reverse().find(phase => SUCCESS.has(phase.state.status))
    ?? phases[0];
  return (
    <section className="team-workspace-panel__map-phases" aria-labelledby="team-workspace-phases" data-map-static>
      <span className="team-workspace-panel__map-phases-cap" id="team-workspace-phases">
        {t('teamWorkspace.phases.title')}
      </span>
      {phases.length === 0 ? (
        <span className="team-workspace-panel__muted">{t('teamWorkspace.phases.empty')}</span>
      ) : (
        <>
          <ol className="team-workspace-panel__map-segbar">
            {phases.map(phase => {
              const statusLabel = t(`teamWorkspace.phaseStatus.${phase.state.status}`);
              return (
                <li key={phase.definition.phaseId} data-tone={statusTone(phase.state.status)}>
                  <span className="sr-only">{phase.definition.displayName} · {statusLabel}</span>
                </li>
              );
            })}
          </ol>
          <span className="team-workspace-panel__map-phases-label">
            <strong>{current?.definition.displayName}</strong>
            {done}/{phases.length}
          </span>
        </>
      )}
      <span className="team-workspace-panel__map-updated">
        {t('teamWorkspace.updatedAt', { value: updated })}
      </span>
    </section>
  );
}

function TeamMapView({
  team,
  members,
  issue,
  reload,
  openMember,
  registerButton,
}: {
  team: TeamWorkspaceTeamProjection;
  members: TeamWorkspaceMemberProjection[];
  issue?: TeamWorkspaceIssue | null;
  reload: () => void;
  openMember: (member: TeamWorkspaceMemberProjection) => void;
  registerButton: (id: string, button: HTMLButtonElement | null) => void;
}) {
  const { t, i18n } = useTranslation('flow-chat');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState<MapCamera>({ x: 0, y: 12, k: 1 });

  const positions = useMemo(
    () => members.map((_, index) => memberPosition(index, members.length)),
    [members],
  );

  const fitCamera = useCallback((): MapCamera => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth || !viewport.clientHeight) {
      return { x: 0, y: 12, k: 1 };
    }
    const k = Math.min(
      1,
      Math.max(
        MAP_MIN_ZOOM,
        Math.min(
          (viewport.clientWidth - 56) / (2 * (MAP_RX + 64)),
          (viewport.clientHeight - 132) / (2 * (MAP_RY + 72)),
        ),
      ),
    );
    return { x: 0, y: 12, k };
  }, []);

  const resetCamera = useCallback(() => {
    setCamera(fitCamera());
  }, [fitCamera]);

  useEffect(() => {
    resetCamera();
  }, [resetCamera, team.teamInstanceId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      setCamera(previous => {
        const k = Math.min(
          MAP_MAX_ZOOM,
          Math.max(MAP_MIN_ZOOM, previous.k * Math.exp(-event.deltaY * 0.0012)),
        );
        const ratio = k / previous.k;
        return {
          k,
          x: px - (px - previous.x) * ratio,
          y: py - (py - previous.y) * ratio,
        };
      });
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, [data-map-static]')) return;
    dragRef.current = { sx: event.clientX, sy: event.clientY, cx: camera.x, cy: camera.y };
    setDragging(true);
    viewportRef.current?.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setCamera(previous => ({
      ...previous,
      x: drag.cx + event.clientX - drag.sx,
      y: drag.cy + event.clientY - drag.sy,
    }));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`;
  const updated = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(team.updatedAt);

  return (
    <div
      ref={viewportRef}
      className={`team-workspace-panel__map${dragging ? ' is-dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="team-workspace-panel__map-grid" style={{ transform }} aria-hidden="true" />
      <section
        className="team-workspace-panel__map-world"
        style={{ transform }}
        aria-labelledby="team-workspace-members"
      >
        <strong id="team-workspace-members" className="sr-only">{t('teamWorkspace.members.title')}</strong>
        <svg className="team-workspace-panel__map-wires" aria-hidden="true">
          {members.map((member, index) => {
            const position = positions[index] ?? { x: 0, y: 0 };
            return (
              <line
                key={member.definition.memberId}
                x1={0}
                y1={0}
                x2={position.x}
                y2={position.y}
                className={INFO.has(member.state.status) ? 'is-hot' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <div className="team-workspace-panel__map-lead">
          <span className="team-workspace-panel__map-lead-orb" aria-hidden="true"><Crown /></span>
          <span className="team-workspace-panel__map-lead-name">{t('teamWorkspace.roles.lead')}</span>
        </div>
        {members.length === 0 ? (
          <p className="team-workspace-panel__map-empty">{t('teamWorkspace.members.empty')}</p>
        ) : members.map((member, index) => {
          const tone = statusTone(member.state.status);
          const position = positions[index] ?? { x: 0, y: 0 };
          return (
            <button
              key={member.definition.memberId}
              ref={button => registerButton(member.definition.memberId, button)}
              type="button"
              className="team-workspace-panel__map-member"
              data-tone={tone}
              style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
              onClick={() => openMember(member)}
              aria-label={t('teamWorkspace.members.open', { name: member.definition.displayName })}
            >
              <span className="team-workspace-panel__map-member-orb" aria-hidden="true">
                {tone === 'info' && (
                  <span className="team-workspace-panel__map-member-ripples"><i /><i /></span>
                )}
                {member.definition.displayName.slice(0, 1)}
                <span className="team-workspace-panel__map-member-dot" />
              </span>
              <span className="team-workspace-panel__map-member-name">{member.definition.displayName}</span>
              <span className="team-workspace-panel__map-member-role">{member.definition.professionalRole}</span>
              <span className="sr-only">{t(`teamWorkspace.memberStatus.${member.state.status}`)}</span>
            </button>
          );
        })}
      </section>
      {issue && (
        <div className="team-workspace-panel__issue team-workspace-panel__issue--map" role="alert" title={issue.message || undefined} data-map-static>
          <span><strong>{t('teamWorkspace.issueTitle')}</strong>{t(issueKey(issue))}</span>
          {issue.retryable && <button type="button" onClick={reload}><RefreshCw />{t('teamWorkspace.actions.retry')}</button>}
        </div>
      )}
      <section className="team-workspace-panel__map-mission" aria-labelledby="team-workspace-overview" data-map-static>
        <small id="team-workspace-overview">{t('teamWorkspace.overview.title')}</small>
        <strong>{team.activeRun?.workflow?.displayName ?? t(team.activeRun ? 'teamWorkspace.overview.workflowUnavailable' : 'teamWorkspace.overview.waiting')}</strong>
        <p>{team.activeRun?.run.objective || team.definition.description}</p>
      </section>
      <div className="team-workspace-panel__map-hud" data-map-static>
        <span>{Math.round(camera.k * 100)}%</span>
        <button type="button" onClick={resetCamera}>{t('teamWorkspace.map.resetView')}</button>
      </div>
      <PhaseSegBar phases={team.phases} updated={updated} />
    </div>
  );
}

export const TeamWorkspacePanel: React.FC<TeamWorkspacePanelProps> = ({
  state,
  isActive = true,
  workspacePath,
  onClose,
  selectedMemberId,
  onSelectedMemberChange,
}) => {
  const { t } = useTranslation('flow-chat');
  const [internalMemberId, setInternalMemberId] = useState<string | null>(null);
  const memberId = selectedMemberId === undefined
    ? internalMemberId
    : selectedMemberId;
  const setMemberId = useCallback((nextMemberId: string | null) => {
    if (selectedMemberId === undefined) setInternalMemberId(nextMemberId);
    onSelectedMemberChange?.(nextMemberId);
  }, [onSelectedMemberChange, selectedMemberId]);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusMemberId = useRef<string | null>(null);
  const team = state.snapshot?.activeTeam ?? null;
  const members = useMemo(() => team?.members.filter(member => (
    member.definition.memberId !== team.definition.leadMemberId
    && member.definition.role !== 'lead'
  )) ?? [], [team]);
  const issue = state.error ?? state.snapshot?.issues[0] ?? team?.issues[0];
  const selectedMember = useMemo(
    () => members.find(member => member.definition.memberId === memberId) ?? null,
    [memberId, members],
  );

  useEffect(() => {
    if (memberId && !selectedMember) setMemberId(null);
  }, [memberId, selectedMember, setMemberId]);

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
          {selectedMember.childSessionId ? (
            <Suspense fallback={<EmptyState icon={<LoaderCircle className="team-workspace-panel__spinner" />} title={t('teamWorkspace.memberConversation.loadingTitle')} description={t('teamWorkspace.memberConversation.loadingDescription')} />}>
              <BtwSessionPanel
                childSessionId={selectedMember.childSessionId}
                parentSessionId={state.snapshot.parentSessionId}
                workspacePath={workspacePath}
                isActive={isActive}
                presentationTitle={selectedMember.definition.displayName}
                showKindBadge={false}
                showHeader={false}
                restoreMissingSessionAs="subagent"
              />
            </Suspense>
          ) : (
            <EmptyState
              icon={<CircleUserRound />}
              title={t('teamWorkspace.memberConversation.notStartedTitle')}
              description={t('teamWorkspace.memberConversation.notStartedDescription')}
            />
          )}
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

  return (
    <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')}>
      <Header team={team} onClose={onClose} />
      <TeamMapView
        team={team}
        members={members}
        issue={issue}
        reload={state.reload}
        openMember={member => setMemberId(member.definition.memberId)}
        registerButton={registerButton}
      />
    </aside>
  );
};

TeamWorkspacePanel.displayName = 'TeamWorkspacePanel';
