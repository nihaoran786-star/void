/**
 * Demo layout
 */

import React from 'react';
import type { ComponentPreview } from '../../types';
import './DemoLayout.css';

interface DemoLayoutProps {
  components: ComponentPreview[];
  containerWidthControl?: boolean;
}

type PreviewWidth = 'wide' | 'medium' | 'narrow';

const previewWidths: Array<{ id: PreviewWidth; label: string; width: string }> = [
  { id: 'wide', label: '桌面宽 · 1120', width: '1120px' },
  { id: 'medium', label: '桌面中 · 820', width: '820px' },
  { id: 'narrow', label: '桌面窄 · 520', width: '520px' },
];

export const DemoLayout: React.FC<DemoLayoutProps> = ({ components, containerWidthControl = false }) => {
  const [previewWidth, setPreviewWidth] = React.useState<PreviewWidth>('wide');
  const activeWidth = previewWidths.find((item) => item.id === previewWidth)?.width;

  return (
    <div className="demo-layout">
      {containerWidthControl && (
        <div className="demo-width-switcher" role="group" aria-label="组件预览容器宽度">
          <span>预览容器</span>
          {previewWidths.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={previewWidth === item.id}
              onClick={() => setPreviewWidth(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {components.map((component) => (
        <div key={component.id} className="demo-card">
          <div className="demo-card-header">
            <h3 className="demo-card-title">{component.name}</h3>
            <p className="demo-card-description">{component.description}</p>
          </div>
          
          <div className="demo-stage">
            <div
              className="demo-stage-container"
              style={containerWidthControl ? { maxWidth: activeWidth } : undefined}
            >
              <component.component />
            </div>
          </div>
          
          <div className="demo-card-footer">
            <span className="demo-id">ID: {component.id}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
