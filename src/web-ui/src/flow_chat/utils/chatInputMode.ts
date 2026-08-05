export function resolveEffectiveChatInputMode(params: {
  isNewSessionDraft: boolean;
  isAssistantWorkspace: boolean;
  draftMode: string;
  reducerMode: string;
  sessionMode?: string | null;
}): string {
  if (params.isNewSessionDraft) {
    return params.draftMode;
  }

  if (params.isAssistantWorkspace) {
    return 'Claw';
  }

  return params.sessionMode?.trim() || params.reducerMode;
}

export function resolveWorkspaceChatInputMode(params: {
  currentMode: string;
  isAssistantWorkspace: boolean;
  sessionMode?: string | null;
}): string | null {
  const normalizedSessionMode = params.sessionMode?.trim();

  if (params.isAssistantWorkspace) {
    return params.currentMode === 'Claw' ? null : 'Claw';
  }

  if (normalizedSessionMode?.toLowerCase() === 'claw') {
    return null;
  }

  if (normalizedSessionMode && normalizedSessionMode !== params.currentMode) {
    return normalizedSessionMode;
  }

  if (!normalizedSessionMode && params.currentMode === 'Claw') {
    return 'agentic';
  }

  return null;
}
