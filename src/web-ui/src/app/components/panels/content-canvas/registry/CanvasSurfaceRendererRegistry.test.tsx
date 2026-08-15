import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PanelContent } from '../types';
import {
  CanvasSurfaceRendererRegistry,
} from './CanvasSurfaceRendererRegistry';
import { CanvasSurfaceRenderer } from './CanvasSurfaceRenderer';

describe('CanvasSurfaceRendererRegistry', () => {
  it('resolves a renderer through a registered legacy content alias until disposal', () => {
    const registry = new CanvasSurfaceRendererRegistry();
    const Renderer: React.FC = () => null;
    const registration = registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.renderer.v1',
      legacyContentTypes: ['workspace-media-gallery'],
      Renderer,
    });
    const content: PanelContent = {
      type: 'workspace-media-gallery',
      title: 'Media',
    };

    expect(registration.status).toBe('registered');
    expect(registry.resolve(content)?.Renderer).toBe(Renderer);

    registration.dispose();
    expect(registry.resolve(content)).toBeUndefined();
  });

  it('renders a generic surface by metadata and forwards its active state', () => {
    const registry = new CanvasSurfaceRendererRegistry();
    registry.register({
      surfaceId: 'test-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.surface.renderer.v1',
      Renderer: ({ isActive }) => (
        <output data-testid="test-surface" data-active={String(isActive)} />
      ),
    });
    const content = {
      type: 'canvas-surface',
      title: 'Test surface',
      metadata: { canvasSurfaceId: 'test-surface' },
    } as PanelContent;

    const html = renderToStaticMarkup(
      <CanvasSurfaceRenderer content={content} isActive registry={registry} />,
    );

    expect(html).toContain('data-testid="test-surface"');
    expect(html).toContain('data-active="true"');
  });

  it('forwards the inactive state and renders an explicit fallback for unknown surfaces', () => {
    const registry = new CanvasSurfaceRendererRegistry();
    registry.register({
      surfaceId: 'test-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.surface.renderer.v1',
      Renderer: ({ isActive }) => <output data-active={String(isActive)} />,
    });
    const inactive = renderToStaticMarkup(
      <CanvasSurfaceRenderer
        content={{
          type: 'canvas-surface',
          title: 'Test',
          metadata: { canvasSurfaceId: 'test-surface' },
        } as PanelContent}
        isActive={false}
        registry={registry}
      />,
    );
    const unknown = renderToStaticMarkup(
      <CanvasSurfaceRenderer
        content={{
          type: 'canvas-surface',
          title: 'Unknown',
          metadata: { canvasSurfaceId: 'unknown-surface' },
        } as PanelContent}
        isActive
        registry={registry}
        unavailableFallback={<output data-state="unavailable" />}
      />,
    );

    expect(inactive).toContain('data-active="false"');
    expect(unknown).toContain('data-state="unavailable"');
  });

  it('does not let ordinary Panel metadata spoof a registered surface renderer', () => {
    const registry = new CanvasSurfaceRendererRegistry();
    registry.register({
      surfaceId: 'test-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.surface.renderer.v1',
      legacyContentTypes: ['workspace-media-gallery'],
      Renderer: () => <output data-testid="surface" />,
    });

    expect(registry.resolve({
      type: 'code-editor',
      title: 'Code',
      metadata: { canvasSurfaceId: 'test-surface' },
    } as PanelContent)).toBeUndefined();
    expect(registry.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
      metadata: { canvasSurfaceId: 'other-surface' },
    } as PanelContent)).toBeUndefined();
  });
});
