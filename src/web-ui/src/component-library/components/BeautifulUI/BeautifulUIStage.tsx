import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './BeautifulUIStage.scss';

export type BeautifulUIStageMode = 'preview' | 'inline' | 'icon' | 'surface';

interface BeautifulUIStageProps {
  children: React.ReactNode;
  mode?: BeautifulUIStageMode;
  theme?: 'light' | 'dark';
  className?: string;
}

const tailwindPropertyDefaults = `
  @layer base {
    :where(
      .beautiful-ui-original-root,
      .beautiful-ui-original-root *,
      .beautiful-ui-original-root::before,
      .beautiful-ui-original-root::after,
      .beautiful-ui-original-root *::before,
      .beautiful-ui-original-root *::after
    ) {
      --tw-translate-x: 0;
      --tw-translate-y: 0;
      --tw-translate-z: 0;
      --tw-space-x-reverse: 0;
      --tw-divide-y-reverse: 0;
      --tw-border-style: solid;
      --tw-shadow: 0 0 #0000;
      --tw-shadow-alpha: 100%;
      --tw-inset-shadow: 0 0 #0000;
      --tw-inset-shadow-alpha: 100%;
      --tw-ring-shadow: 0 0 #0000;
      --tw-inset-ring-shadow: 0 0 #0000;
      --tw-ring-offset-width: 0px;
      --tw-ring-offset-color: #fff;
      --tw-ring-offset-shadow: 0 0 #0000;
      --tw-drop-shadow-alpha: 100%;
    }
  }
`;

const stageStyles = `
  @import url('/beautiful-ui-original/site.css');
  ${tailwindPropertyDefaults}

  .beautiful-ui-original-root {
    --canvas: #f1f2f3;
    --ink: #1f2124;
    position: relative;
    color: var(--ink);
    background: transparent;
  }

  .beautiful-ui-original-root.dark {
    --canvas: #1c1d1f;
    --ink: #f2f3f4;
  }

  .beautiful-ui-original-root[data-mode='preview'] {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 300px;
    padding: 32px;
    overflow: hidden;
    background: var(--canvas);
  }

  .beautiful-ui-original-root[data-mode='inline'],
  .beautiful-ui-original-root[data-mode='icon'] {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    min-width: 0;
  }

  .beautiful-ui-original-root[data-mode='surface'] {
    display: block;
    width: 100%;
    min-width: 0;
  }

  @media (max-width: 640px) {
    .beautiful-ui-original-root[data-mode='preview'] {
      min-height: 260px;
      padding: 20px;
    }
  }
`;

export const BeautifulUIStage: React.FC<BeautifulUIStageProps> = ({
  children,
  mode = 'preview',
  theme = 'light',
  className = '',
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadowRoot.replaceChildren();

    const style = document.createElement('style');
    style.textContent = stageStyles;

    const root = document.createElement('div');
    root.className = [
      theme === 'dark' ? 'dark' : '',
      'primitive-showcase',
      '__className_f367f3',
      '__variable_f367f3',
      '__variable_3c557b',
      'beautiful-ui-original-root',
    ].filter(Boolean).join(' ');
    root.dataset.mode = mode;
    shadowRoot.append(style, root);
    setPortalRoot(root);

    return () => {
      setPortalRoot(null);
      shadowRoot.replaceChildren();
    };
  }, [mode, theme]);

  return (
    <div
      ref={hostRef}
      className={`beautiful-ui-stage beautiful-ui-stage--${mode} ${className}`.trim()}
    >
      {portalRoot ? createPortal(children, portalRoot) : null}
    </div>
  );
};
