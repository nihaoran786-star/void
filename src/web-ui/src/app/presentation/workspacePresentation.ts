export const WORKSPACE_PRESENTATION_STORAGE_KEY = 'void.ui.workspace-presentation';
export const WORKSPACE_PRESENTATION_QUERY_KEY = 'void-ui';

export type WorkspacePresentation = 'classic' | 'minimal';

interface WorkspacePresentationInput {
  configured?: string | null;
  search?: string;
  stored?: string | null;
}

function parseWorkspacePresentation(value: string | null | undefined): WorkspacePresentation | null {
  return value === 'classic' || value === 'minimal' ? value : null;
}

export function resolveWorkspacePresentation({
  configured = null,
  search = '',
  stored = null,
}: WorkspacePresentationInput = {}): WorkspacePresentation {
  const queryValue = parseWorkspacePresentation(
    new URLSearchParams(search).get(WORKSPACE_PRESENTATION_QUERY_KEY),
  );

  return queryValue
    ?? parseWorkspacePresentation(configured)
    ?? parseWorkspacePresentation(stored)
    ?? 'classic';
}

export function readWorkspacePresentation(): WorkspacePresentation {
  if (typeof window === 'undefined') {
    return 'classic';
  }

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(WORKSPACE_PRESENTATION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or restricted webviews.
  }

  return resolveWorkspacePresentation({
    configured: import.meta.env.VITE_VOID_WORKSPACE_PRESENTATION,
    search: window.location.search,
    stored,
  });
}

export function persistWorkspacePresentation(presentation: WorkspacePresentation): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(WORKSPACE_PRESENTATION_STORAGE_KEY, presentation);
  } catch {
    // The query-string override remains available when storage is restricted.
  }
}

export function workspacePresentationClassName(
  presentation: WorkspacePresentation,
): `void-ui--${WorkspacePresentation}` {
  return `void-ui--${presentation}`;
}
