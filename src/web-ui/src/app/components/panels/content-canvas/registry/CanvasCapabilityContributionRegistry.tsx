import type React from 'react';

export interface CanvasCapabilityIconProps {
  size?: string | number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export interface CanvasCapabilityContribution {
  capabilityId: string;
  surfaceId: string;
  pluginVersion: string;
  registrationKey: string;
  labelKey: string;
  Icon: React.ComponentType<CanvasCapabilityIconProps>;
  legacyContentTypes?: readonly string[];
  isAvailableForSession?: (session: {
    mode?: string;
    sessionKind?: string;
  }) => boolean;
}

export type CanvasCapabilityContributionRegistrationResult =
  | {
      status: 'registered' | 'already_registered';
      capabilityId: string;
      surfaceId: string;
      dispose: () => void;
    }
  | {
      status: 'conflict';
      capabilityId: string;
      surfaceId: string;
      reason: string;
      dispose: () => void;
    };

interface ContributionEntry {
  contribution: CanvasCapabilityContribution;
  references: number;
}

function hasSameLegacyAliases(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const leftAliases = left ?? [];
  const rightAliases = right ?? [];
  return leftAliases.length === rightAliases.length
    && leftAliases.every(alias => rightAliases.includes(alias));
}

function matchesRegistration(
  entry: ContributionEntry,
  contribution: CanvasCapabilityContribution,
): boolean {
  return entry.contribution.capabilityId === contribution.capabilityId
    && entry.contribution.surfaceId === contribution.surfaceId
    && entry.contribution.pluginVersion === contribution.pluginVersion
    && entry.contribution.registrationKey === contribution.registrationKey
    && entry.contribution.labelKey === contribution.labelKey
    && entry.contribution.Icon === contribution.Icon
    && entry.contribution.isAvailableForSession === contribution.isAvailableForSession
    && hasSameLegacyAliases(
      entry.contribution.legacyContentTypes,
      contribution.legacyContentTypes,
    );
}

export class CanvasCapabilityContributionRegistry {
  private readonly byCapabilityId = new Map<string, ContributionEntry>();
  private readonly bySurfaceId = new Map<string, ContributionEntry>();
  private readonly byLegacyContentType = new Map<string, ContributionEntry>();

  public register(
    contribution: CanvasCapabilityContribution,
  ): CanvasCapabilityContributionRegistrationResult {
    const capabilityEntry = this.byCapabilityId.get(contribution.capabilityId);
    const surfaceEntry = this.bySurfaceId.get(contribution.surfaceId);
    const conflictingLegacyType = contribution.legacyContentTypes?.find(type => {
      const entry = this.byLegacyContentType.get(type);
      return entry && entry !== capabilityEntry && entry !== surfaceEntry;
    });
    if (conflictingLegacyType) {
      return {
        status: 'conflict',
        capabilityId: contribution.capabilityId,
        surfaceId: contribution.surfaceId,
        reason: `Canvas content alias "${conflictingLegacyType}" is already registered.`,
        dispose: () => undefined,
      };
    }
    const existing = capabilityEntry ?? surfaceEntry;
    if (existing) {
      if (
        capabilityEntry !== surfaceEntry
        || !matchesRegistration(existing, contribution)
      ) {
        return {
          status: 'conflict',
          capabilityId: contribution.capabilityId,
          surfaceId: contribution.surfaceId,
          reason: capabilityEntry
            ? `Canvas capability "${contribution.capabilityId}" is already registered.`
            : `Canvas surface "${contribution.surfaceId}" already has a capability contribution.`,
          dispose: () => undefined,
        };
      }

      existing.references += 1;
      return this.createRegistrationResult('already_registered', existing);
    }

    const entry: ContributionEntry = {
      contribution,
      references: 1,
    };
    this.byCapabilityId.set(contribution.capabilityId, entry);
    this.bySurfaceId.set(contribution.surfaceId, entry);
    for (const type of contribution.legacyContentTypes ?? []) {
      this.byLegacyContentType.set(type, entry);
    }
    return this.createRegistrationResult('registered', entry);
  }

  public resolveByCapabilityId(
    capabilityId: string,
  ): CanvasCapabilityContribution | undefined {
    return this.byCapabilityId.get(capabilityId)?.contribution;
  }

  public resolveBySurfaceId(
    surfaceId: string,
  ): CanvasCapabilityContribution | undefined {
    return this.bySurfaceId.get(surfaceId)?.contribution;
  }

  public resolveByLegacyContentType(
    contentType: string,
  ): CanvasCapabilityContribution | undefined {
    return this.byLegacyContentType.get(contentType)?.contribution;
  }

  private createRegistrationResult(
    status: 'registered' | 'already_registered',
    entry: ContributionEntry,
  ): CanvasCapabilityContributionRegistrationResult {
    let disposed = false;
    return {
      status,
      capabilityId: entry.contribution.capabilityId,
      surfaceId: entry.contribution.surfaceId,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (
          this.byCapabilityId.get(entry.contribution.capabilityId) !== entry
          || this.bySurfaceId.get(entry.contribution.surfaceId) !== entry
        ) {
          return;
        }
        entry.references -= 1;
        if (entry.references === 0) {
          this.byCapabilityId.delete(entry.contribution.capabilityId);
          this.bySurfaceId.delete(entry.contribution.surfaceId);
          for (const type of entry.contribution.legacyContentTypes ?? []) {
            if (this.byLegacyContentType.get(type) === entry) {
              this.byLegacyContentType.delete(type);
            }
          }
        }
      },
    };
  }
}

export const canvasCapabilityContributionRegistry = (
  new CanvasCapabilityContributionRegistry()
);
