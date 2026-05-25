import { openRightPanelPreview } from './PreviewService';

export type AutoPreviewCandidateSource = 'assistant-message' | 'terminal-output';
export type AutoPreviewConfidence = 'high' | 'medium';

export interface AutoPreviewCandidate {
  kind: 'url';
  url: string;
  source: AutoPreviewCandidateSource;
  sessionId: string;
  workspaceKey?: string;
  turnId?: string;
  confidence: AutoPreviewConfidence;
  isStale?: boolean;
}

export type AutoPreviewDecision =
  | { status: 'accepted'; candidate: AutoPreviewCandidate }
  | {
      status: 'ignored';
      reason: 'unsupported' | 'duplicate' | 'stale' | 'disabled' | 'low-confidence';
      candidate?: AutoPreviewCandidate;
    }
  | { status: 'error'; error: string; candidate?: AutoPreviewCandidate };

interface DetectAutoPreviewCandidatesInput {
  text: string;
  source: AutoPreviewCandidateSource;
  sessionId: string;
  workspaceKey?: string;
  turnId?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function normalizeSupportedUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(TRAILING_PUNCTUATION, '');
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

export function detectAutoPreviewCandidates(input: DetectAutoPreviewCandidatesInput): AutoPreviewCandidate[] {
  const supportedUrls = Array.from(input.text.matchAll(URL_PATTERN))
    .map((match) => normalizeSupportedUrl(match[0]))
    .filter((url): url is string => Boolean(url));

  const latestUrl = supportedUrls.at(-1);
  if (!latestUrl) {
    return [];
  }

  return [
    {
      kind: 'url',
      url: latestUrl,
      source: input.source,
      sessionId: input.sessionId,
      turnId: input.turnId,
      workspaceKey: input.workspaceKey,
      confidence: 'high',
    },
  ];
}

function buildCandidateKey(candidate: AutoPreviewCandidate): string {
  return [
    candidate.sessionId,
    candidate.turnId || 'no-turn',
    candidate.source,
    candidate.url,
  ].join(':');
}

export function createAutoPreviewOrchestrator() {
  const openedCandidateKeys = new Set<string>();

  return {
    maybeOpen(candidate: AutoPreviewCandidate): AutoPreviewDecision {
      if (candidate.isStale) {
        return { status: 'ignored', reason: 'stale', candidate };
      }

      if (candidate.confidence !== 'high') {
        return { status: 'ignored', reason: 'low-confidence', candidate };
      }

      const candidateKey = buildCandidateKey(candidate);
      if (openedCandidateKeys.has(candidateKey)) {
        return { status: 'ignored', reason: 'duplicate', candidate };
      }

      try {
        const result = openRightPanelPreview({
          url: candidate.url,
          source: 'manual',
          workspaceKey: candidate.workspaceKey,
          title: 'Preview',
        });

        if (result.status === 'unsupported') {
          return { status: 'ignored', reason: 'unsupported', candidate };
        }

        openedCandidateKeys.add(candidateKey);
        return { status: 'accepted', candidate };
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          candidate,
        };
      }
    },
  };
}

export const autoPreviewOrchestrator = createAutoPreviewOrchestrator();
