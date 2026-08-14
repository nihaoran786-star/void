import React, { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { BeautifulUiOriginalPreview } from './beautiful-ui-original/BeautifulUiOriginalPreview';
import './flowchat-dynamic-preview.css';

const LOOP_DURATION_MS = 12000;

const originalComponentIds: Record<string, string> = {
  'assistant-stream-text': 'streaming-text',
  'user-message': 'chat-composer',
  'conversation-navigation': 'sidebar-nav',
  'composer-actions': 'prompt-bar',
  'read-file-card': 'context-cards',
  'file-operation-card': 'code-block',
  'search-card': 'search',
  'task-card': 'task-rows',
  'todo-card': 'selection-actions',
  'web-search-card': 'recommendation-card',
  'mcp-tool-card': 'tool-chips',
  'context-compression-card': 'insight-cards',
  'skill-card': 'fine-tune-card',
  'ask-user-card': 'approval-card',
  'reproduction-steps-card': 'loading-state',
  'create-plan-card': 'records-table',
  'git-tool-card': 'diff-table',
  'init-miniapp-card': 'filter-table',
  'model-thinking-card': 'thinking-state',
};

interface AlwaysRunningFlowPreviewProps {
  previewId: string;
}

export const AlwaysRunningFlowPreview: React.FC<AlwaysRunningFlowPreviewProps> = ({ previewId }) => {
  const [cycle, setCycle] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setCycle((value) => value + 1), LOOP_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const restart = () => {
    setCycle((value) => value + 1);
    setIsRunning(true);
  };
  const originalComponentId = originalComponentIds[previewId];

  return (
    <div className={`flow-dynamic-live ${isRunning ? 'is-running' : 'is-paused'}`}>
      <div className="flow-dynamic-live__toolbar">
        <span><Sparkles size={13} />实时循环 <small>第 {cycle + 1} 轮</small></span>
        <div>
          <button type="button" onClick={() => setIsRunning((value) => !value)} aria-label={isRunning ? '暂停自动循环' : '继续自动循环'}>
            {isRunning ? <Pause size={12} /> : <Play size={12} />}{isRunning ? '暂停' : '继续'}
          </button>
          <button type="button" onClick={restart}><RotateCcw size={12} />重播</button>
        </div>
      </div>
      <div className="flow-dynamic-live__progress" aria-hidden="true"><i key={`${cycle}-${isRunning}`} /></div>
      <div className="flow-dynamic-live__stage">
        <BeautifulUiOriginalPreview componentId={originalComponentId} cycle={cycle} />
      </div>
    </div>
  );
};
