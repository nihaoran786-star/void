import type React from 'react';

import {
  CanvasSurfaceRegistry,
  type CanvasSurfaceRegistration,
  type CanvasSurfaceRegistrationResult,
} from '@/shared/services/canvas';
import type { PanelContent, PanelContentType } from '../types';

export interface CanvasSurfaceRendererProps {
  content: PanelContent;
  isActive: boolean;
}

export interface CanvasSurfaceRendererDefinition extends CanvasSurfaceRegistration {
  legacyContentTypes?: readonly PanelContentType[];
  Renderer: React.ComponentType<CanvasSurfaceRendererProps>;
}

interface RendererAliasEntry {
  surfaceId: string;
  references: number;
}

export class CanvasSurfaceRendererRegistry {
  private readonly definitions = new CanvasSurfaceRegistry<CanvasSurfaceRendererDefinition>();
  private readonly aliases = new Map<PanelContentType, RendererAliasEntry>();

  public register(
    definition: CanvasSurfaceRendererDefinition,
  ): CanvasSurfaceRegistrationResult {
    const aliases = definition.legacyContentTypes ?? [];
    const conflictingAlias = aliases.find(alias => {
      const existing = this.aliases.get(alias);
      return existing && existing.surfaceId !== definition.surfaceId;
    });
    if (conflictingAlias) {
      return {
        status: 'conflict',
        surfaceId: definition.surfaceId,
        reason: `Canvas content alias "${conflictingAlias}" is already registered.`,
        dispose: () => undefined,
      };
    }

    const registration = this.definitions.register(definition);
    if (registration.status === 'conflict') {
      return registration;
    }

    for (const alias of aliases) {
      const existing = this.aliases.get(alias);
      if (existing) {
        existing.references += 1;
      } else {
        this.aliases.set(alias, {
          surfaceId: definition.surfaceId,
          references: 1,
        });
      }
    }

    let disposed = false;
    return {
      ...registration,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        registration.dispose();
        for (const alias of aliases) {
          const current = this.aliases.get(alias);
          if (!current || current.surfaceId !== definition.surfaceId) continue;
          current.references -= 1;
          if (current.references === 0) {
            this.aliases.delete(alias);
          }
        }
      },
    };
  }

  public resolve(content: PanelContent): CanvasSurfaceRendererDefinition | undefined {
    const metadataSurfaceId = content.metadata?.canvasSurfaceId;
    if (content.type === 'canvas-surface') {
      return typeof metadataSurfaceId === 'string'
        ? this.definitions.resolve(metadataSurfaceId)
        : undefined;
    }

    const aliasSurfaceId = this.aliases.get(content.type)?.surfaceId;
    if (!aliasSurfaceId) return undefined;
    if (
      typeof metadataSurfaceId === 'string'
      && metadataSurfaceId !== aliasSurfaceId
    ) {
      return undefined;
    }
    return this.definitions.resolve(aliasSurfaceId);
  }
}

export const canvasSurfaceRendererRegistry = new CanvasSurfaceRendererRegistry();
