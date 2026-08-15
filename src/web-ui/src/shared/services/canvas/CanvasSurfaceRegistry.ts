import type {
  CanvasSurfaceDefinition,
  CanvasSurfaceRegistration,
  CanvasSurfaceRegistrationResult,
} from './CanvasSurfaceContracts';

interface RegistryEntry<TDefinition> {
  definition: TDefinition;
  references: number;
}

export class CanvasSurfaceRegistry<
  TDefinition extends CanvasSurfaceRegistration = CanvasSurfaceRegistration,
> {
  private readonly entries = new Map<string, RegistryEntry<TDefinition>>();

  public register(definition: TDefinition): CanvasSurfaceRegistrationResult {
    const existing = this.entries.get(definition.surfaceId);
    if (existing) {
      if (
        existing.definition.pluginVersion !== definition.pluginVersion
        || existing.definition.registrationKey !== definition.registrationKey
      ) {
        return {
          status: 'conflict',
          surfaceId: definition.surfaceId,
          reason: `Canvas surface "${definition.surfaceId}" is already registered by another definition.`,
          dispose: () => undefined,
        };
      }

      existing.references += 1;
      return this.createRegistrationResult('already_registered', definition.surfaceId, existing);
    }

    const entry: RegistryEntry<TDefinition> = {
      definition,
      references: 1,
    };
    this.entries.set(definition.surfaceId, entry);
    return this.createRegistrationResult('registered', definition.surfaceId, entry);
  }

  public resolve(surfaceId: string): TDefinition | undefined {
    return this.entries.get(surfaceId)?.definition;
  }

  private createRegistrationResult(
    status: Exclude<CanvasSurfaceRegistrationResult['status'], 'conflict'>,
    surfaceId: string,
    entry: RegistryEntry<TDefinition>,
  ): CanvasSurfaceRegistrationResult {
    let disposed = false;
    return {
      status,
      surfaceId,
      dispose: () => {
        if (disposed) return;
        disposed = true;

        const current = this.entries.get(surfaceId);
        if (current !== entry) return;

        current.references -= 1;
        if (current.references === 0) {
          this.entries.delete(surfaceId);
        }
      },
    };
  }
}

export const canvasSurfaceRegistry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
