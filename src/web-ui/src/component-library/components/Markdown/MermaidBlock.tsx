/**
 * MermaidBlock component
 * Renders Mermaid diagrams in Markdown
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useI18n } from '@/infrastructure/i18n';
import { MermaidService, MERMAID_THEME_CHANGE_EVENT } from '../../../tools/mermaid-editor/services/MermaidService';
import { Loader2, AlertCircle, Code2, Copy, Check } from 'lucide-react';
import { createLogger } from '@/shared/utils/logger';
import './MermaidBlock.scss';

const log = createLogger('MermaidBlock');

const svgCache = new Map<string, string>();

let themeVersion = 0;

const getThemeType = (): 'dark' | 'light' => {
  const themeType = document.documentElement.getAttribute('data-theme-type');
  if (themeType === 'light' || themeType === 'dark') return themeType;
  return 'dark';
};

const getCacheKey = (code: string): string => {
  return `${getThemeType()}:${code.trim()}`;
};

const clearCache = () => {
  svgCache.clear();
  themeVersion++;
  log.debug('Cache cleared', { version: themeVersion });
};

if (typeof window !== 'undefined') {
  window.addEventListener(MERMAID_THEME_CHANGE_EVENT, clearCache);
}

export interface MermaidBlockProps {
  code: string;
  isStreaming?: boolean;
  className?: string;
}

type RenderState = 'streaming' | 'incomplete' | 'loading' | 'rendered' | 'error';

/**
 * FlowChat transcript height contract.
 *
 * A mermaid block is one of the most violent height mutators in a model answer:
 * while the fence is still streaming it renders the raw diagram source (often a
 * screenful of text), then collapses to a one-line spinner, then expands again
 * to an SVG of an entirely unrelated size. Every one of those transitions lands
 * *after* mount, and the virtualized transcript can only see the shrink ones as
 * an unsignalled delta — the path that produces blank tail space and scroll
 * jitter (see
 * `src/web-ui/src/flow_chat/components/modern/FLOWCHAT_SCROLL_STABILITY.md`).
 *
 * The events are dispatched on `window` rather than imported from `flow_chat`
 * so the component-library keeps its dependency direction; the transcript is
 * the only listener and the payload matches `useToolCardHeightContract`.
 */
const FLOWCHAT_COLLAPSE_INTENT_EVENT = 'flowchat:tool-card-collapse-intent';
const FLOWCHAT_HEIGHT_CHANGED_EVENT = 'tool-card-toggle';

/** States that render the full raw diagram source, i.e. the tall ones. */
const SOURCE_TEXT_STATES: ReadonlySet<RenderState> = new Set<RenderState>(['streaming', 'incomplete', 'error']);

const isCodeComplete = (code: string): boolean => {
  const trimmed = code.trim();
  if (!trimmed) return false;
  return /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart)/m.test(trimmed);
};

export const MermaidBlock: React.FC<MermaidBlockProps> = ({
  code,
  isStreaming = false,
  className = ''
}) => {
  const { t } = useI18n('components');
  const cacheKey = getCacheKey(code.trim());
  const cachedSvg = svgCache.get(cacheKey);
  
  const [state, setState] = useState<RenderState>(() => {
    if (cachedSvg) return 'rendered';
    if (isStreaming) return 'streaming';
    if (!code.trim() || !isCodeComplete(code)) return 'incomplete';
    return 'loading';
  });
  const [svgContent, setSvgContent] = useState<string>(cachedSvg || '');
  const [error, setError] = useState<string>('');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [currentThemeVersion, setCurrentThemeVersion] = useState(themeVersion);
  
  const mermaidService = useRef(MermaidService.getInstance());
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCodeRef = useRef<string>('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<RenderState>(state);

  /** Tell the transcript a shrink is coming, while the tall box still exists. */
  const announceCollapseIntent = useCallback(() => {
    const cardHeight = rootRef.current?.getBoundingClientRect().height ?? 0;
    if (!(cardHeight > 0)) return;
    window.dispatchEvent(new CustomEvent(FLOWCHAT_COLLAPSE_INTENT_EVENT, {
      detail: { toolId: null, toolName: 'MermaidBlock', cardHeight, reason: 'auto' },
    }));
  }, []);

  const notifyHeightChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent(FLOWCHAT_HEIGHT_CHANGED_EVENT));
  }, []);

  /**
   * Every render-state change goes through here so a transition that drops the
   * raw source text announces itself before the DOM shrinks. Dispatching after
   * `setState` would be too late: the browser has already clamped `scrollTop`.
   */
  const transitionState = useCallback((nextState: RenderState) => {
    const previousState = stateRef.current;
    if (previousState === nextState) return;
    if (SOURCE_TEXT_STATES.has(previousState) && !SOURCE_TEXT_STATES.has(nextState)) {
      announceCollapseIntent();
    }
    stateRef.current = nextState;
    setState(nextState);
    notifyHeightChanged();
  }, [announceCollapseIntent, notifyHeightChanged]);

  /** Manual source toggle: collapsing hides a full code listing. */
  const showCodeRef = useRef(showCode);
  showCodeRef.current = showCode;
  const toggleShowCode = useCallback(() => {
    if (showCodeRef.current) announceCollapseIntent();
    setShowCode(!showCodeRef.current);
    notifyHeightChanged();
  }, [announceCollapseIntent, notifyHeightChanged]);

  const renderDiagram = useCallback(async (codeToRender: string) => {
    const trimmedCode = codeToRender.trim();
    const key = getCacheKey(trimmedCode);
    
    if (!isCodeComplete(trimmedCode)) {
      transitionState('incomplete');
      return;
    }

    const cached = svgCache.get(key);
    if (cached) {
      setSvgContent(cached);
      transitionState('rendered');
      return;
    }

    transitionState('loading');
    setError('');

    try {
      const svg = await mermaidService.current.renderDiagram(trimmedCode);
      if (currentCodeRef.current === trimmedCode) {
        svgCache.set(key, svg);
        setSvgContent(svg);
        transitionState('rendered');
      }
    } catch (err) {
      if (currentCodeRef.current === trimmedCode) {
        setError(err instanceof Error ? err.message : t('mermaidBlock.renderFailed'));
        transitionState('error');
      }
    }
  }, [t, transitionState]);

  useEffect(() => {
    const trimmedCode = code.trim();
    currentCodeRef.current = trimmedCode;

    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }

    if (isStreaming) {
      transitionState('streaming');
      return;
    }

    if (!trimmedCode || !isCodeComplete(trimmedCode)) {
      transitionState('incomplete');
      return;
    }

    const key = getCacheKey(trimmedCode);
    const cached = svgCache.get(key);
    if (cached) {
      setSvgContent(cached);
      transitionState('rendered');
      return;
    }

    renderTimeoutRef.current = setTimeout(() => {
      renderDiagram(trimmedCode);
    }, 200);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [code, isStreaming, renderDiagram, currentThemeVersion, transitionState]);

  useEffect(() => {
    const handleThemeChange = () => {
      log.debug('Theme changed, triggering re-render');
      setCurrentThemeVersion(themeVersion);
      setSvgContent('');
      transitionState('loading');
    };

    window.addEventListener(MERMAID_THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      window.removeEventListener(MERMAID_THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, [transitionState]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error('Failed to copy code', err);
    }
  }, [code]);

  const renderContent = () => {
    switch (state) {
      case 'streaming':
        return (
          <div className="mermaid-block__streaming">
            <div className="mermaid-block__code-preview">
              <pre className="mermaid-code">
                <code>{code}</code>
                <span className="streaming-cursor">█</span>
              </pre>
            </div>
          </div>
        );

      case 'incomplete':
        return (
          <div className="mermaid-block__incomplete">
            <div className="mermaid-block__code-preview">
              <pre className="mermaid-code">
                <code>{code}</code>
              </pre>
            </div>
            <div className="mermaid-block__hint">
              <AlertCircle size={14} />
              <span>{t('mermaidBlock.codeIncomplete')}</span>
            </div>
          </div>
        );

      case 'loading':
        return (
          <div className="mermaid-block__loading">
            <div className="mermaid-block__loading-indicator">
              <Loader2 size={20} className="spinning" />
              <span>{t('mermaidBlock.rendering')}</span>
            </div>
          </div>
        );

      case 'rendered':
        return (
          <div className="mermaid-block__rendered">
            <div 
              className="mermaid-block__diagram"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            
            <div className="mermaid-block__actions">
              <button
                className="mermaid-icon-btn"
                onClick={toggleShowCode}
                title={showCode ? t('mermaidBlock.hideCode') : t('mermaidBlock.showCode')}
              >
                <Code2 size={14} />
              </button>
              <button
                className={`mermaid-icon-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                title={t('mermaidBlock.copyCode')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {showCode && (
              <div className="mermaid-block__source">
                <pre className="mermaid-code">
                  <code>{code}</code>
                </pre>
              </div>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="mermaid-block__error">
            <div className="mermaid-block__error-message">
              <AlertCircle size={16} />
              <span>{t('mermaidBlock.renderFailed')}: {error}</span>
            </div>
            <div className="mermaid-block__code-preview">
              <pre className="mermaid-code">
                <code>{code}</code>
              </pre>
            </div>
            <div className="mermaid-block__actions">
              <button
                className={`mermaid-icon-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                title={t('mermaidBlock.copyCode')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div ref={rootRef} className={`mermaid-block mermaid-block--${state} ${className}`}>
      {renderContent()}
    </div>
  );
};

export default MermaidBlock;
