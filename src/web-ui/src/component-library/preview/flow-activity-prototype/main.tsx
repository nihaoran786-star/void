import React from 'react';
import ReactDOM from 'react-dom/client';
import { themeService, voidLightTheme } from '@/infrastructure/theme';
import type { ThemeConfig } from '@/infrastructure/theme';
import { FlowActivityPrototype } from './FlowActivityPrototype';
import '../../../app/styles/index.scss';
import './flow-activity-prototype.css';

document.documentElement.dataset.theme = 'void-light';
document.documentElement.dataset.themeType = 'light';

// The component preview has no config adapter. Reuse ThemeService's existing
// variable projection without persisting or reading the user's app preference.
(themeService as unknown as { injectCSSVariables: (theme: ThemeConfig) => void })
  .injectCSSVariables(voidLightTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FlowActivityPrototype />
  </React.StrictMode>,
);
