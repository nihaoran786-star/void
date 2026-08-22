import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CircleUserRound,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import type { TeamDelegatedTask } from '@/shared/services/customization/TeamRuntimeGateway';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceIssue,
  TeamWorkspaceMemberProjection,
  TeamWorkspacePhaseProjection,
  TeamWorkspaceTeamProjection,
} from '../types';
import {
  teamLinkPath,
  teamNodePort,
  teamTopologyLayout,
} from './teamTopologyLayout';
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

/**
 * The four words this surface is allowed to say about any piece of work.
 * Stored statuses keep their full vocabulary; this is display only.
 */
type TeamDisplayStatus = 'notStarted' | 'inProgress' | 'done' | 'error';

/** Statuses that mean "someone is working on it right now". */
const RUNNING = new Set(['provisioning', 'queued', 'running']);
/** Work has started but is parked on something; still "in progress" to a reader. */
const PENDING_ATTENTION = new Set(['waiting_user', 'waiting', 'blocked']);
const FINISHED = new Set(['completed', 'skipped', 'archived']);
const BROKEN = new Set(['failed', 'cancelled', 'interrupted', 'unavailable']);

function displayStatus(status: string): TeamDisplayStatus {
  if (RUNNING.has(status) || PENDING_ATTENTION.has(status)) return 'inProgress';
  if (FINISHED.has(status)) return 'done';
  if (BROKEN.has(status)) return 'error';
  // `idle` / `pending` / `ready` / `created` / `not_started` all read the same
  // to a beginner: nothing has happened yet.
  return 'notStarted';
}

const issueKey = (issue: TeamWorkspaceIssue) => `teamWorkspace.issues.${issue.code}`;

/** FNV-1a hash — stable identity -> hue assignment. */
function hashIdentity(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveInitial(name: string, identity: string): string {
  const source = name.trim() || identity.trim();
  const first = Array.from(source)[0];
  return first ? first.toLocaleUpperCase() : '·';
}

/**
 * Static identity mark: a deterministic colour block behind the first letter of
 * the name, matching the AGENT surface avatar. No portrait, no animation.
 */
function TeamMark({ identity, name }: { identity: string; name: string }) {
  const accent = useMemo(
    () => `oklch(0.62 0.11 ${hashIdentity(identity) % 360})`,
    [identity],
  );
  const initial = useMemo(() => resolveInitial(name, identity), [identity, name]);
  return (
    <span
      className="team-workspace-panel__mark"
      style={{ '--team-mark-accent': accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** One dot plus one word — the only status channel on this surface. */
function StatusLine({ status }: { status: TeamDisplayStatus }) {
  const { t } = useTranslation('flow-chat');
  return (
    <span className="team-workspace-panel__node-status" data-status={status}>
      {t(`teamWorkspace.status.${status}`)}
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

const MAP_MIN_ZOOM = 0.6;
const MAP_MAX_ZOOM = 1.8;
/** How far an automatic fit may enlarge a small roster. */
const MAP_FIT_MAX_ZOOM = 1.35;

interface MapCamera {
  x: number;
  y: number;
  k: number;
}

function sortedDelegatedTasks(
  member: TeamWorkspaceMemberProjection,
): TeamDelegatedTask[] {
  return [...member.delegation.tasks].sort((left, right) => (
    left.depth - right.depth
    || left.createdAt - right.createdAt
    || left.taskId.localeCompare(right.taskId)
  ));
}

function PhaseSegBar({ phases }: { phases: TeamWorkspacePhaseProjection[] }) {
  const { t } = useTranslation('flow-chat');
  const done = phases.filter(
    phase => displayStatus(phase.state.status) === 'done',
  ).length;
  const current = phases.find(
    phase => displayStatus(phase.state.status) === 'inProgress',
  )
    ?? [...phases].reverse().find(
      phase => displayStatus(phase.state.status) === 'done',
    )
    ?? phases[0];
  const progress = phases.length > 0 ? Math.round((done / phases.length) * 100) : 0;
  return (
    <section className="team-workspace-panel__map-phases" aria-labelledby="team-workspace-phases" data-map-static>
      <span className="team-workspace-panel__map-phases-cap" id="team-workspace-phases">
        {t('teamWorkspace.phases.title')}
      </span>
      {phases.length === 0 ? (
        <span className="team-workspace-panel__muted">{t('teamWorkspace.phases.empty')}</span>
      ) : (
        <>
          <span className="team-workspace-panel__map-phases-track" aria-hidden="true">
            <span className="team-workspace-panel__map-phases-fill" style={{ width: `${progress}%` }} />
          </span>
          <span className="team-workspace-panel__map-phases-label">
            <strong>{current?.definition.displayName}</strong>
            {done}/{phases.length}
            <span className="sr-only">
              {phases.map(phase => (
                `${phase.definition.displayName} ${t(`teamWorkspace.status.${displayStatus(phase.state.status)}`)}`
              )).join(' · ')}
            </span>
          </span>
        </>
      )}
    </section>
  );
}

function TeamMapView({
  team,
  members,
  issue,
  teamStatus,
  reload,
  openMember,
  openWorker,
  registerButton,
}: {
  team: TeamWorkspaceTeamProjection;
  members: TeamWorkspaceMemberProjection[];
  issue?: TeamWorkspaceIssue | null;
  teamStatus: TeamDisplayStatus;
  reload: () => void;
  openMember: (member: TeamWorkspaceMemberProjection) => void;
  openWorker: (member: TeamWorkspaceMemberProjection, task: TeamDelegatedTask) => void;
  registerButton: (id: string, button: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation('flow-chat');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState<MapCamera>({ x: 0, y: 0, k: 1 });
  const [expandedMemberIds, setExpandedMemberIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const memberTasks = useMemo(
    () => new Map(members.map(member => [
      member.definition.memberId,
      sortedDelegatedTasks(member),
    ])),
    [members],
  );
  const layout = useMemo(
    () => teamTopologyLayout(members.map(member => ({
      memberId: member.definition.memberId,
      workerCount: memberTasks.get(member.definition.memberId)?.length ?? 0,
      isExpanded: expandedMemberIds.has(member.definition.memberId),
    }))),
    [expandedMemberIds, members, memberTasks],
  );

  const toggleMemberWorkers = useCallback((memberId: string) => {
    setExpandedMemberIds(current => {
      const next = new Set(current);
      if (!next.delete(memberId)) next.add(memberId);
      return next;
    });
  }, []);

  const fitCamera = useCallback((): MapCamera => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth || !viewport.clientHeight) {
      return { x: 0, y: 0, k: 1 };
    }
    // Fitting may scale up as well as down: a small roster in a tall window
    // should fill it rather than float in the middle of empty canvas.
    const k = Math.min(
      MAP_FIT_MAX_ZOOM,
      Math.max(
        MAP_MIN_ZOOM,
        Math.min(
          (viewport.clientWidth - 40) / layout.width,
          (viewport.clientHeight - 108) / layout.height,
        ),
      ),
    );
    return { x: 0, y: 0, k };
  }, [layout.height, layout.width]);

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

  return (
    <div
      ref={viewportRef}
      className={`team-workspace-panel__map${dragging ? ' is-dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="team-workspace-panel__map-topbar" data-map-static data-team-drag>
        <span className="team-workspace-panel__map-topbar-title">
          {t('teamWorkspace.members.title')} · {members.length + 1}
        </span>
      </div>
      <section
        className="team-workspace-panel__map-world"
        style={{ transform, '--map-camera-zoom': camera.k } as React.CSSProperties}
        aria-labelledby="team-workspace-members"
      >
        <strong id="team-workspace-members" className="sr-only">{t('teamWorkspace.members.title')}</strong>
        <svg className="team-workspace-panel__map-wires" aria-hidden="true">
          {members.map((member, index) => {
            const node = layout.members[index];
            if (!node) return null;
            return (
              <React.Fragment key={member.definition.memberId}>
                <path
                  d={teamLinkPath(
                    teamNodePort(layout.lead, 'right'),
                    teamNodePort(node, 'left'),
                  )}
                  vectorEffect="non-scaling-stroke"
                />
                {node.workers.map((worker, workerIndex) => (
                  <path
                    key={`${member.definition.memberId}:${workerIndex}`}
                    d={teamLinkPath(
                      teamNodePort(node, 'right'),
                      teamNodePort(worker, 'left'),
                    )}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </React.Fragment>
            );
          })}
        </svg>

        <span
          className="team-workspace-panel__node team-workspace-panel__node--lead"
          data-testid="team-lead-node"
          style={{
            transform: `translate(${layout.lead.x}px, ${layout.lead.y}px)`,
            width: `${layout.lead.width}px`,
            height: `${layout.lead.height}px`,
          }}
        >
          <span className="team-workspace-panel__node-body">
            <TeamMark
              identity={team.teamDefinitionId}
              name={team.definition.displayName}
            />
            <span className="team-workspace-panel__node-text">
              <span className="team-workspace-panel__node-name">
                {team.definition.displayName}
              </span>
              <span className="team-workspace-panel__node-role">
                {t('teamWorkspace.roles.lead')}
              </span>
              <StatusLine status={teamStatus} />
            </span>
          </span>
        </span>

        {members.length === 0 ? (
          <p className="team-workspace-panel__map-empty">{t('teamWorkspace.members.empty')}</p>
        ) : members.map((member, index) => {
          const node = layout.members[index];
          if (!node) return null;
          const memberId = member.definition.memberId;
          const tasks = memberTasks.get(memberId) ?? [];
          const isExpanded = expandedMemberIds.has(memberId);
          return (
            <React.Fragment key={memberId}>
              <span
                className="team-workspace-panel__node"
                data-testid="team-member-node"
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                }}
              >
                <button
                  ref={button => registerButton(memberId, button)}
                  type="button"
                  className="team-workspace-panel__node-body"
                  onClick={() => openMember(member)}
                  aria-label={t('teamWorkspace.members.open', { name: member.definition.displayName })}
                >
                  <TeamMark identity={memberId} name={member.definition.displayName} />
                  <span className="team-workspace-panel__node-text">
                    <span className="team-workspace-panel__node-name">
                      {member.definition.displayName}
                    </span>
                    <span className="team-workspace-panel__node-role">
                      {member.definition.professionalRole}
                    </span>
                    <StatusLine status={displayStatus(member.state.status)} />
                  </span>
                </button>
                {tasks.length > 0 && (
                  <button
                    type="button"
                    className="team-workspace-panel__node-expander"
                    aria-expanded={isExpanded}
                    onClick={() => toggleMemberWorkers(memberId)}
                    aria-label={t('teamWorkspace.delegation.toggle', {
                      name: member.definition.displayName,
                      count: tasks.length,
                    })}
                  >
                    {isExpanded ? '−' : '+'}{tasks.length}
                  </button>
                )}
                {member.delegation.status !== 'ready' && (
                  <span
                    className="team-workspace-panel__node-delegation"
                    data-state={member.delegation.status}
                    role={member.delegation.status === 'error' ? 'alert' : 'status'}
                  >
                    {t(`teamWorkspace.delegation.${member.delegation.status}`)}
                  </span>
                )}
              </span>
              {isExpanded && tasks.map((task, taskIndex) => {
                const worker = node.workers[taskIndex];
                if (!worker) return null;
                return (
                  <span
                    key={task.taskId}
                    className="team-workspace-panel__node team-workspace-panel__node--worker"
                    data-depth={task.depth}
                    style={{
                      transform: `translate(${worker.x}px, ${worker.y}px)`,
                      width: `${worker.width}px`,
                      height: `${worker.height}px`,
                    }}
                  >
                    <button
                      ref={button => registerButton(`task:${task.taskId}`, button)}
                      type="button"
                      className="team-workspace-panel__node-body"
                      disabled={!task.childSessionId}
                      onClick={() => openWorker(member, task)}
                      aria-label={t('teamWorkspace.delegation.open', { name: task.owner })}
                      title={task.objective}
                    >
                      <span className="team-workspace-panel__node-text">
                        <span className="team-workspace-panel__node-name">{task.owner}</span>
                        <span className="team-workspace-panel__node-role">{task.objective}</span>
                      </span>
                      <span className="sr-only">
                        {t(`teamWorkspace.status.${displayStatus(task.status)}`)}
                      </span>
                    </button>
                  </span>
                );
              })}
            </React.Fragment>
          );
        })}
      </section>
      {issue && (
        <div className="team-workspace-panel__issue team-workspace-panel__issue--map" role="alert" title={issue.message || undefined} data-map-static>
          <span><strong>{t('teamWorkspace.issueTitle')}</strong>{t(issueKey(issue))}</span>
          {issue.retryable && <button type="button" onClick={reload}><RefreshCw />{t('teamWorkspace.actions.retry')}</button>}
        </div>
      )}
      <div className="team-workspace-panel__map-hud" data-map-static>
        <button type="button" onClick={resetCamera} aria-label={t('teamWorkspace.map.resetView')}>
          <RotateCcw aria-hidden="true" />
        </button>
      </div>
      <PhaseSegBar phases={team.phases} />
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
  const selectedTask = useMemo(
    () => selectedMember?.delegation.tasks.find(task => task.taskId === selectedTaskId) ?? null,
    [selectedMember, selectedTaskId],
  );
  const isTeamRunning = useMemo(
    () => RUNNING.has(team?.activeRun?.status ?? '')
      || members.some(member => RUNNING.has(member.state.status)),
    [members, team],
  );

  useEffect(() => {
    if (memberId && !selectedMember) setMemberId(null);
  }, [memberId, selectedMember, setMemberId]);

  useEffect(() => {
    if (selectedTaskId && !selectedTask) setSelectedTaskId(null);
  }, [selectedTask, selectedTaskId]);

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
    pendingFocusMemberId.current = selectedTaskId ? `task:${selectedTaskId}` : memberId;
    setSelectedTaskId(null);
    setMemberId(null);
  };

  const openMember = (member: TeamWorkspaceMemberProjection) => {
    setSelectedTaskId(null);
    setMemberId(member.definition.memberId);
  };

  const openWorker = (
    member: TeamWorkspaceMemberProjection,
    task: TeamDelegatedTask,
  ) => {
    if (!task.childSessionId) return;
    setMemberId(member.definition.memberId);
    setSelectedTaskId(task.taskId);
  };

  if (selectedMember && team && state.snapshot) {
    return (
      <aside className="team-workspace-panel team-workspace-panel--conversation" aria-label={t('teamWorkspace.ariaLabel')} data-running={isTeamRunning || undefined}>
        {onClose && (
          <button type="button" className="team-workspace-panel__icon-button team-workspace-panel__icon-button--floating" onClick={onClose} aria-label={t('teamWorkspace.actions.close')}>
            <X aria-hidden="true" />
          </button>
        )}
        <div className="team-workspace-panel__strip" data-team-drag>
          <button
            type="button"
            className="team-workspace-panel__strip-back"
            onClick={returnToTeam}
            aria-label={t('teamWorkspace.actions.backToTeam')}
          >
            <ArrowLeft aria-hidden="true" />
            {t('teamWorkspace.actions.backToTeam')}
          </button>
          <span className="team-workspace-panel__strip-tabs" role="group" aria-label={t('teamWorkspace.members.title')}>
            {members.map(member => (
              <button
                key={member.definition.memberId}
                type="button"
                className="team-workspace-panel__member-tab"
                data-active={member.definition.memberId === selectedMember.definition.memberId || undefined}
                onClick={() => openMember(member)}
                aria-label={t('teamWorkspace.members.open', { name: member.definition.displayName })}
                aria-current={member.definition.memberId === selectedMember.definition.memberId ? 'true' : undefined}
                title={member.definition.displayName}
              >
                {member.definition.displayName}
              </button>
            ))}
            {selectedMember.delegation.tasks.filter(task => task.childSessionId).map(task => (
              <button
                key={task.taskId}
                type="button"
                className="team-workspace-panel__member-tab team-workspace-panel__member-tab--worker"
                data-active={task.taskId === selectedTask?.taskId || undefined}
                onClick={() => openWorker(selectedMember, task)}
                aria-label={t('teamWorkspace.delegation.open', { name: task.owner })}
                aria-current={task.taskId === selectedTask?.taskId ? 'true' : undefined}
                title={task.objective}
              >
                {task.owner}
              </button>
            ))}
          </span>
        </div>
        <div className="team-workspace-panel__conversation">
          {(selectedTask?.childSessionId ?? selectedMember.childSessionId) ? (
            <Suspense fallback={<EmptyState icon={<LoaderCircle className="team-workspace-panel__spinner" />} title={t('teamWorkspace.memberConversation.loadingTitle')} description={t('teamWorkspace.memberConversation.loadingDescription')} />}>
              <BtwSessionPanel
                childSessionId={selectedTask?.childSessionId ?? selectedMember.childSessionId!}
                parentSessionId={selectedTask?.parentSessionId ?? state.snapshot.parentSessionId}
                workspacePath={workspacePath}
                isActive={isActive}
                presentationTitle={selectedTask?.owner ?? selectedMember.definition.displayName}
                showKindBadge={false}
                showHeader={false}
                restoreMissingSessionAs="subagent"
              />
            </Suspense>
          ) : (
            <EmptyState
              icon={<CircleUserRound />}
              title={t(
                selectedMember.state.status === 'failed'
                  ? 'teamWorkspace.memberConversation.failedTitle'
                  : 'teamWorkspace.memberConversation.notStartedTitle',
              )}
              description={t(
                selectedMember.state.status === 'failed'
                  ? 'teamWorkspace.memberConversation.failedDescription'
                  : 'teamWorkspace.memberConversation.notStartedDescription',
              )}
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

  const teamStatus = displayStatus(team.activeRun?.status ?? team.lifecycle);
  return (
    <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')} data-running={isTeamRunning || undefined}>
      <span className="sr-only">{team.definition.displayName}</span>
      <span className="sr-only" role="status">{t(`teamWorkspace.status.${teamStatus}`)}</span>
      {onClose && (
        <button type="button" className="team-workspace-panel__icon-button team-workspace-panel__icon-button--floating" onClick={onClose} aria-label={t('teamWorkspace.actions.close')}>
          <X aria-hidden="true" />
        </button>
      )}
      <TeamMapView
        team={team}
        members={members}
        issue={issue}
        teamStatus={teamStatus}
        reload={state.reload}
        openMember={openMember}
        openWorker={openWorker}
        registerButton={registerButton}
      />
    </aside>
  );
};

TeamWorkspacePanel.displayName = 'TeamWorkspacePanel';
