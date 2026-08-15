export interface CanvasSurfaceRegistration {
  surfaceId: string;
  pluginVersion: string;
  registrationKey: string;
}

export type CanvasSurfaceRegistrationStatus =
  | 'registered'
  | 'already_registered'
  | 'conflict';

export interface CanvasSurfaceRegistrationResult {
  status: CanvasSurfaceRegistrationStatus;
  surfaceId: string;
  dispose: () => void;
  reason?: string;
}

export type CanvasWorkspaceFacts =
  | {
      status: 'ready';
      workspaceId: string;
      workspacePath: string;
      backend: 'local';
    }
  | {
      status: 'ready';
      workspaceId: string;
      workspacePath: string;
      backend: 'remote';
      remoteConnectionId: string;
      remoteHost?: string;
    }
  | {
      status: 'unavailable';
      reason: 'no-workspace' | 'invalid-workspace';
    };

export type CanvasSurfaceSource =
  | 'canvas-control'
  | 'capability-rail'
  | 'session-default'
  | 'background-discovery'
  | 'tool-result'
  | 'restore';

export interface CanvasSurfaceIntent<TInput = unknown> {
  surfaceId: string;
  source: CanvasSurfaceSource;
  input: TInput;
  idempotencyKey: string;
}

export interface CanvasSurfaceOpenRequest<TInput = unknown>
  extends CanvasSurfaceIntent<TInput> {
  workspace: CanvasWorkspaceFacts;
  sourceSessionId?: string;
}

export type CanvasSurfaceInputValidation =
  | { status: 'valid'; value: unknown }
  | { status: 'invalid'; reason: string };

export interface CanvasSurfaceDefinitionContext {
  workspace: Extract<CanvasWorkspaceFacts, { status: 'ready' }>;
  input: unknown;
  source: CanvasSurfaceSource;
  sourceSessionId?: string;
}

export interface CanvasSurfacePresentation {
  title: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export interface CanvasSurfaceDefinition extends CanvasSurfaceRegistration {
  legacyContentType?: string;
  existingInstanceStrategy?: 'focus' | 'update';
  checkWorkspace?: (
    workspace: Extract<CanvasWorkspaceFacts, { status: 'ready' }>,
  ) =>
    | { status: 'available' }
    | { status: 'unavailable' | 'restricted'; reason: string };
  validateInput: (
    input: unknown,
    context: Omit<CanvasSurfaceDefinitionContext, 'input'>,
  ) => CanvasSurfaceInputValidation;
  createInstanceKey: (context: CanvasSurfaceDefinitionContext) => string;
  createPresentation: (context: CanvasSurfaceDefinitionContext) => CanvasSurfacePresentation;
}

export interface CanvasHostInstance {
  instanceId: string;
  instanceKey: string;
  surfaceId: string;
  workspaceId?: string;
  remoteConnectionId?: string;
}

export interface CanvasHostOpenRequest extends CanvasSurfacePresentation {
  surfaceId: string;
  instanceKey: string;
  workspace: Extract<CanvasWorkspaceFacts, { status: 'ready' }>;
  source: CanvasSurfaceSource;
  sourceSessionId?: string;
  legacyContentType?: string;
}

export type CanvasHostMutationResult =
  | { status: 'opened' | 'focused' | 'updated'; instanceId: string }
  | { status: 'error'; error: CanvasSurfaceError };

export interface CanvasHostPort {
  findInstance: (
    instanceKey: string,
    request?: CanvasHostOpenRequest,
  ) => CanvasHostInstance | undefined;
  open: (request: CanvasHostOpenRequest) => Promise<CanvasHostMutationResult>;
  focus: (instanceId: string) => Promise<CanvasHostMutationResult>;
  update: (
    instanceId: string,
    request: CanvasHostOpenRequest,
  ) => Promise<CanvasHostMutationResult>;
}

export interface CanvasSurfaceError {
  code: 'definition-failed' | 'host-failed';
  message: string;
  cause?: unknown;
}

export type CanvasSurfaceOpenResult =
  | { status: 'opened' | 'focused' | 'updated'; instanceId: string }
  | { status: 'unavailable' | 'restricted' | 'incompatible'; reason: string }
  | { status: 'error'; error: CanvasSurfaceError };
