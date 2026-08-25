/**
 * Task queue for the Infinite Canvas panel (P4 W8, plan §2.6).
 *
 * The list is a pure projection of the canvas document — see
 * `collectGenerationTasks`. This component subscribes to nothing: no event
 * bus, no window listener, no timer. That is deliberate, and it is what keeps
 * it out of the collapsed-tool event-name trap (a deferred tool arrives with
 * `toolName: 'CallDeferredTool'`, so filtering by the original tool name finds
 * nothing). Projecting the document sidesteps the question entirely.
 *
 * The honest word about "stop waiting": there is no way to cancel a media job
 * on the backend. The button stops the CARD from waiting — it does not stop
 * the remote task, and the quota is spent either way. The copy says so, and it
 * must keep saying so; writing "cancelled" here would be a lie.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { InfiniteCanvasGenerationTask } from './infiniteCanvasPanelModel';

export interface InfiniteCanvasTaskQueuePanelProps {
  tasks: readonly InfiniteCanvasGenerationTask[];
  onRetry: (nodeId: string) => void;
  onRetryAllFailed: () => void;
  onStopWaiting: (operationId: string) => void;
  onLocate: (nodeId: string) => void;
}

export const InfiniteCanvasTaskQueuePanel: React.FC<InfiniteCanvasTaskQueuePanelProps> = ({
  tasks,
  onRetry,
  onRetryAllFailed,
  onStopWaiting,
  onLocate,
}) => {
  const { t } = useI18n('components');
  const [expanded, setExpanded] = React.useState(false);

  const pending = tasks.filter(task => task.status === 'pending');
  const failed = tasks.filter(task => task.status === 'failed');

  // Nothing running and nothing broken: the queue is not a thing on screen.
  if (tasks.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="infinite-canvas-tasks__pill"
        data-canvas-tasks="collapsed"
        data-canvas-tasks-pending={pending.length}
        data-canvas-tasks-failed={failed.length}
        onClick={() => setExpanded(true)}
      >
        {t('infiniteCanvas.tasks.pill', {
          pending: pending.length,
          failed: failed.length,
        })}
      </button>
    );
  }

  return (
    <div
      className="infinite-canvas-tasks"
      data-canvas-tasks="expanded"
      data-canvas-tasks-pending={pending.length}
      data-canvas-tasks-failed={failed.length}
      aria-label={t('infiniteCanvas.tasks.title')}
    >
      <div className="infinite-canvas-tasks__header">
        <h4>{t('infiniteCanvas.tasks.title')}</h4>
        <button
          type="button"
          className="infinite-canvas-tasks__close"
          data-canvas-tasks-action="collapse"
          onClick={() => setExpanded(false)}
        >
          {t('infiniteCanvas.tasks.collapse')}
        </button>
      </div>
      <p className="infinite-canvas-tasks__counts">
        {t('infiniteCanvas.tasks.counts', {
          pending: pending.length,
          failed: failed.length,
        })}
      </p>
      {failed.length > 1 ? (
        <button
          type="button"
          className="infinite-canvas-tasks__retry-all"
          data-canvas-tasks-action="retry-all"
          onClick={onRetryAllFailed}
        >
          {t('infiniteCanvas.tasks.retryAll')}
        </button>
      ) : null}
      <ul className="infinite-canvas-tasks__list">
        {tasks.map(task => (
          <li
            key={task.operationId}
            className="infinite-canvas-tasks__row"
            data-canvas-task-node={task.nodeId}
            data-canvas-task-status={task.status}
            data-canvas-task-error={task.errorKind}
          >
            <span className="infinite-canvas-tasks__label">
              {task.promptLine || t('infiniteCanvas.tasks.noPrompt')}
            </span>
            <span className="infinite-canvas-tasks__status">
              {task.status === 'pending'
                ? t(task.mediaKind === 'video'
                  ? 'infiniteCanvas.video.pending'
                  : 'infiniteCanvas.generation.pending')
                : t(task.errorKind === 'cancelled'
                  ? 'infiniteCanvas.tasks.stoppedWaiting'
                  : `infiniteCanvas.generation.errorKind.${task.errorKind ?? 'backend'}`)}
            </span>
            <span className="infinite-canvas-tasks__actions">
              {task.status === 'failed' ? (
                <button
                  type="button"
                  className="infinite-canvas-tasks__action"
                  data-canvas-task-action="retry"
                  onClick={() => onRetry(task.nodeId)}
                >
                  {t('infiniteCanvas.generation.retry')}
                </button>
              ) : (
                <button
                  type="button"
                  className="infinite-canvas-tasks__action"
                  data-canvas-task-action="stop-waiting"
                  title={t('infiniteCanvas.tasks.stopWaitingHint')}
                  onClick={() => onStopWaiting(task.operationId)}
                >
                  {t('infiniteCanvas.tasks.stopWaiting')}
                </button>
              )}
              <button
                type="button"
                className="infinite-canvas-tasks__action"
                data-canvas-task-action="locate"
                onClick={() => onLocate(task.nodeId)}
              >
                {t('infiniteCanvas.tasks.locate')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="infinite-canvas-tasks__footnote">
        {t('infiniteCanvas.tasks.stopWaitingHint')}
      </p>
    </div>
  );
};

InfiniteCanvasTaskQueuePanel.displayName = 'InfiniteCanvasTaskQueuePanel';
