import { api } from '@/infrastructure/api';
import type {
  AttachTeamRuntimeInput,
  ControlTeamRuntimeRunInput,
  GetTeamRuntimeInput,
  ListTeamRuntimeInput,
  MessageTeamRuntimeInput,
  ObserveTeamRuntimeInput,
  RecoverTeamRuntimeInput,
  TeamRuntimeGateway,
  TeamRuntimeList,
  TeamRuntimeMutationResponse,
  TeamRuntimeRecord,
} from '../TeamRuntimeGateway';

type RunCommand =
  | 'team_runtime_pause'
  | 'team_runtime_resume'
  | 'team_runtime_stop';

export class DesktopTeamRuntimeAdapter implements TeamRuntimeGateway {
  async list(input: ListTeamRuntimeInput): Promise<TeamRuntimeList> {
    return api.invoke<TeamRuntimeList>('team_runtime_list', {
      request: {
        parentSessionId: input.parentSessionId,
      },
    });
  }

  async get(input: GetTeamRuntimeInput): Promise<TeamRuntimeRecord | null> {
    return api.invoke<TeamRuntimeRecord | null>('team_runtime_get', {
      request: {
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
      },
    });
  }

  async attach(
    input: AttachTeamRuntimeInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return api.invoke<TeamRuntimeMutationResponse>('team_runtime_attach', {
      request: {
        operationId: input.operationId,
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
        teamDefinitionId: input.teamDefinitionId,
        teamDefinitionRevision: input.teamDefinitionRevision,
        creationSource: input.creationSource,
      },
    });
  }

  async observe(
    input: ObserveTeamRuntimeInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return api.invoke<TeamRuntimeMutationResponse>('team_runtime_observe', {
      request: {
        operationId: input.operationId,
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
      },
    });
  }

  async message(
    input: MessageTeamRuntimeInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return api.invoke<TeamRuntimeMutationResponse>('team_runtime_message', {
      request: {
        operationId: input.operationId,
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
        teamRunId: input.teamRunId,
        memberId: input.memberId,
        message: input.message,
      },
    });
  }

  async pause(
    input: ControlTeamRuntimeRunInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return this.runMutation('team_runtime_pause', input);
  }

  async resume(
    input: ControlTeamRuntimeRunInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return this.runMutation('team_runtime_resume', input);
  }

  async stop(
    input: ControlTeamRuntimeRunInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return this.runMutation('team_runtime_stop', input);
  }

  async recover(
    input: RecoverTeamRuntimeInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return api.invoke<TeamRuntimeMutationResponse>('team_runtime_recover', {
      request: {
        operationId: input.operationId,
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
      },
    });
  }

  private async runMutation(
    command: RunCommand,
    input: ControlTeamRuntimeRunInput,
  ): Promise<TeamRuntimeMutationResponse> {
    return api.invoke<TeamRuntimeMutationResponse>(command, {
      request: {
        operationId: input.operationId,
        parentSessionId: input.parentSessionId,
        teamInstanceId: input.teamInstanceId,
        teamRunId: input.teamRunId,
      },
    });
  }
}

export const desktopTeamRuntimeAdapter = new DesktopTeamRuntimeAdapter();
