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
const MAP_ORBIT_SQUASH = 0.78;

interface MapCamera {
  x: number;
  y: number;
  k: number;
}

// Nodes render at a constant screen size (semantic zoom): the orbit grows with
// headcount so adjacent nodes keep clearance even when the camera zooms out.
function memberOrbitRadius(count: number) {
  if (count <= 4) return 150;
  if (count <= 6) return 180;
  return 205;
}

function memberPosition(index: number, count: number) {
  const radius = memberOrbitRadius(count);
  const angle = ((-90 + (360 / count) * index) * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius * MAP_ORBIT_SQUASH),
  };
}

interface DelegatedTaskNode {
  member: TeamWorkspaceMemberProjection;
  task: TeamDelegatedTask;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
}

function delegatedTaskLayout(
  members: TeamWorkspaceMemberProjection[],
  positions: Array<{ x: number; y: number }>,
): DelegatedTaskNode[] {
  const nodes: DelegatedTaskNode[] = [];
  members.forEach((member, memberIndex) => {
    const memberPositionValue = positions[memberIndex] ?? { x: 0, y: 0 };
    const length = Math.hypot(memberPositionValue.x, memberPositionValue.y) || 1;
    const outward = { x: memberPositionValue.x / length, y: memberPositionValue.y / length };
    const tangent = { x: -outward.y, y: outward.x };
    const memberTasks = [...member.delegation.tasks].sort((left, right) => (
      left.depth - right.depth
      || left.createdAt - right.createdAt
      || left.taskId.localeCompare(right.taskId)
    ));
    const positioned = new Map<string, DelegatedTaskNode>();
    memberTasks.forEach(task => {
      const parent = task.parentTaskId ? positioned.get(task.parentTaskId) : undefined;
      const siblings = memberTasks.filter(candidate => candidate.parentTaskId === task.parentTaskId);
      const siblingIndex = siblings.findIndex(candidate => candidate.taskId === task.taskId);
      const siblingOffset = (siblingIndex - (siblings.length - 1) / 2) * 38;
      const anchor = parent ?? {
        x: memberPositionValue.x,
        y: memberPositionValue.y,
      };
      const node: DelegatedTaskNode = {
        member,
        task,
        parentX: anchor.x,
        parentY: anchor.y,
        x: Math.round(anchor.x + outward.x * 70 + tangent.x * siblingOffset),
        y: Math.round(anchor.y + outward.y * 70 + tangent.y * siblingOffset),
      };
      positioned.set(task.taskId, node);
      nodes.push(node);
    });
  });
  return nodes;
}

function PhaseSegBar({ phases }: { phases: TeamWorkspacePhaseProjection[] }) {
  const { t } = useTranslation('flow-chat');
  const done = phases.filter(phase => SUCCESS.has(phase.state.status)).length;
  const current = phases.find(phase => INFO.has(phase.state.status))
    ?? [...phases].reverse().find(phase => SUCCESS.has(phase.state.status))
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
                `${phase.definition.displayName} ${t(`teamWorkspace.phaseStatus.${phase.state.status}`)}`
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
  running,
  reload,
  openMember,
  openWorker,
  registerButton,
}: {
  team: TeamWorkspaceTeamProjection;
  members: TeamWorkspaceMemberProjection[];
  issue?: TeamWorkspaceIssue | null;
  running: boolean;
  reload: () => void;
  openMember: (member: TeamWorkspaceMemberProjection) => void;
  openWorker: (member: TeamWorkspaceMemberProjection, task: TeamDelegatedTask) => void;
  registerButton: (id: string, button: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation('flow-chat');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState<MapCamera>({ x: 0, y: 12, k: 1 });

  const positions = useMemo(
    () => members.map((_, index) => memberPosition(index, members.length)),
    [members],
  );
  const delegatedNodes = useMemo(
    () => delegatedTaskLayout(members, positions),
    [members, positions],
  );

  const fitCamera = useCallback((): MapCamera => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth || !viewport.clientHeight) {
      return { x: 0, y: 12, k: 1 };
    }
    const radius = memberOrbitRadius(members.length);
    const k = Math.min(
      1,
      Math.max(
        MAP_MIN_ZOOM,
        Math.min(
          (viewport.clientWidth - 48) / (2 * (radius + 60)),
          (viewport.clientHeight - 140) / (2 * (radius * MAP_ORBIT_SQUASH + 66)),
        ),
      ),
    );
    return { x: 0, y: 12, k };
  }, [members.length]);

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
      <div className="team-workspace-panel__map-grid" style={{ transform }} aria-hidden="true" />
      <div className="team-workspace-panel__map-topbar" data-map-static data-team-drag>
        <span className="team-workspace-panel__map-topbar-title">
          {t('teamWorkspace.members.title')} · {members.length + delegatedNodes.length + 1}
        </span>
        {running && (
          <span className="team-workspace-panel__map-topbar-live">{t('teamWorkspace.runStatus.running')}</span>
        )}
      </div>
      <section
        className="team-workspace-panel__map-world"
        style={{ transform, '--map-camera-zoom': camera.k } as React.CSSProperties}
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
          {delegatedNodes.map(node => (
            <line
              key={`${node.member.definition.memberId}:${node.task.taskId}`}
              x1={node.parentX}
              y1={node.parentY}
              x2={node.x}
              y2={node.y}
              className={`is-worker${INFO.has(node.task.status) ? ' is-hot' : ''}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div
          className="team-workspace-panel__map-lead"
          style={{ transform: 'scale(calc(1 / var(--map-camera-zoom, 1)))' }}
        >
          <span className="team-workspace-panel__map-lead-point" aria-hidden="true" />
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
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(calc(1 / var(--map-camera-zoom, 1)))`,
              }}
              onClick={() => openMember(member)}
              aria-label={t('teamWorkspace.members.open', { name: member.definition.displayName })}
            >
              <span className="team-workspace-panel__map-member-point" aria-hidden="true">
                {tone === 'info' && (
                  <span className="team-workspace-panel__map-member-ripples"><i /><i /></span>
                )}
              </span>
              <span className="team-workspace-panel__map-member-name">{member.definition.displayName}</span>
              <span className="team-workspace-panel__map-member-role">{member.definition.professionalRole}</span>
              <span className="sr-only">{t(`teamWorkspace.memberStatus.${member.state.status}`)}</span>
            </button>
          );
        })}
        {delegatedNodes.map(node => {
          const tone = statusTone(node.task.status);
          const canOpen = Boolean(node.task.childSessionId);
          return (
            <button
              key={`${node.member.definition.memberId}:${node.task.taskId}`}
              ref={button => registerButton(`task:${node.task.taskId}`, button)}
              type="button"
              className="team-workspace-panel__map-worker"
              data-tone={tone}
              data-depth={node.task.depth}
              disabled={!canOpen}
              style={{
                transform: `translate(${node.x}px, ${node.y}px) scale(calc(1 / var(--map-camera-zoom, 1)))`,
              }}
              onClick={() => openWorker(node.member, node.task)}
              aria-label={t('teamWorkspace.delegation.open', { name: node.task.owner })}
              title={node.task.objective}
            >
              <span className="team-workspace-panel__map-worker-point" aria-hidden="true" />
              <span className="team-workspace-panel__map-worker-name">{node.task.owner}</span>
              <span className="team-workspace-panel__map-worker-objective">{node.task.objective}</span>
              <span className="sr-only">{t(`teamWorkspace.delegation.status.${node.task.status}`)}</span>
            </button>
          );
        })}
        {members.map((member, index) => {
          if (member.delegation.status === 'ready') return null;
          const position = positions[index] ?? { x: 0, y: 0 };
          return (
            <span
              key={`${member.definition.memberId}:delegation-state`}
              className="team-workspace-panel__map-delegation-state"
              data-state={member.delegation.status}
              style={{ transform: `translate(${position.x}px, ${position.y + 42}px) scale(calc(1 / var(--map-camera-zoom, 1)))` }}
              role={member.delegation.status === 'error' ? 'alert' : 'status'}
            >
              {t(`teamWorkspace.delegation.${member.delegation.status}`)}
            </span>
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
    () => INFO.has(team?.activeRun?.status ?? '')
      || members.some(member => INFO.has(member.state.status)),
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
            title={t('teamWorkspace.actions.backToTeam')}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <span className="team-workspace-panel__strip-tabs" role="group" aria-label={t('teamWorkspace.members.title')}>
            {members.map(member => (
              <button
                key={member.definition.memberId}
                type="button"
                className="team-workspace-panel__member-tab"
                data-active={member.definition.memberId === selectedMember.definition.memberId || undefined}
                data-tone={statusTone(member.state.status)}
                onClick={() => openMember(member)}
                aria-label={t('teamWorkspace.members.open', { name: member.definition.displayName })}
                aria-current={member.definition.memberId === selectedMember.definition.memberId ? 'true' : undefined}
                title={member.definition.displayName}
              >
                {member.definition.displayName.slice(0, 2)}
              </button>
            ))}
            {selectedMember.delegation.tasks.filter(task => task.childSessionId).map(task => (
              <button
                key={task.taskId}
                type="button"
                className="team-workspace-panel__member-tab team-workspace-panel__member-tab--worker"
                data-active={task.taskId === selectedTask?.taskId || undefined}
                data-tone={statusTone(task.status)}
                onClick={() => openWorker(selectedMember, task)}
                aria-label={t('teamWorkspace.delegation.open', { name: task.owner })}
                aria-current={task.taskId === selectedTask?.taskId ? 'true' : undefined}
                title={task.objective}
              >
                {task.owner.slice(0, 2)}
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

  const teamStatusValue = team.activeRun?.status ?? team.lifecycle;
  const teamStatusNamespace = team.activeRun?.status ? 'runStatus' : 'lifecycle';
  return (
    <aside className="team-workspace-panel" aria-label={t('teamWorkspace.ariaLabel')} data-running={isTeamRunning || undefined}>
      <span className="sr-only">{team.definition.displayName}</span>
      <span className="sr-only" role="status">{t(`teamWorkspace.${teamStatusNamespace}.${teamStatusValue}`)}</span>
      {onClose && (
        <button type="button" className="team-workspace-panel__icon-button team-workspace-panel__icon-button--floating" onClick={onClose} aria-label={t('teamWorkspace.actions.close')}>
          <X aria-hidden="true" />
        </button>
      )}
      <TeamMapView
        team={team}
        members={members}
        issue={issue}
        running={isTeamRunning}
        reload={state.reload}
        openMember={openMember}
        openWorker={openWorker}
        registerButton={registerButton}
      />
    </aside>
  );
};

TeamWorkspacePanel.displayName = 'TeamWorkspacePanel';
