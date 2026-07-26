import type { ContextItem } from '@/shared/types/context';
import {
  getSkillPromptReferenceMatches,
} from './skillPromptReference';

export const COMPOSER_PRESENTATION_VERSION = 1 as const;

export type ComposerPresentationSegment =
  | { type: 'text'; text: string }
  | { type: 'context'; context: ContextItem }
  | { type: 'skill'; name: string };

export interface ComposerPresentation {
  version: typeof COMPOSER_PRESENTATION_VERSION;
  segments: ComposerPresentationSegment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getContextPresentationLabel(context: ContextItem): string {
  switch (context.type) {
    case 'file': return context.fileName;
    case 'directory': return context.directoryName;
    case 'code-snippet': return `${context.fileName}:${context.startLine}-${context.endLine}`;
    case 'pull-request': return context.label;
    case 'image': return context.imageName;
    case 'media-reference': return context.mediaName;
    case 'session-reference': return context.sessionTitle || context.sessionId;
    case 'terminal-command': return context.command;
    case 'git-ref': return context.refValue;
    case 'url': return context.title || context.url;
    case 'mermaid-node': return context.nodeText;
    case 'mermaid-diagram': return context.diagramTitle || 'Mermaid diagram';
    case 'web-element': return context.tagName;
  }
}

export function getContextPresentationToken(context: ContextItem): string {
  switch (context.type) {
    case 'file': return `#file:${context.fileName}`;
    case 'directory': return `#dir:${context.directoryName}`;
    case 'code-snippet': return `#code:${context.fileName}:${context.startLine}-${context.endLine}`;
    case 'pull-request': return `#pr:${context.label.replace(/\s+/g, '_')}`;
    case 'image': return `#img:${context.imageName}`;
    case 'media-reference': return `#media:${context.mediaName}`;
    case 'session-reference': return `#session:${context.sessionTitle || context.sessionId}`;
    case 'terminal-command': return `#cmd:${context.command}`;
    case 'git-ref': return `#git:${context.refValue}`;
    case 'url': return `#link:${context.title || context.url}`;
    case 'mermaid-node': return `#chart:${context.nodeText}`;
    case 'mermaid-diagram': return `#mermaid:${context.diagramTitle || 'Mermaid diagram'}`;
    case 'web-element': return `#element:${context.tagName}`;
  }
}

function sanitizeContext(context: ContextItem): ContextItem {
  const clone = { ...context } as ContextItem & Record<string, unknown>;
  if (clone.type === 'image') {
    delete clone.dataUrl;
    delete clone.thumbnailUrl;
  } else if (clone.type === 'media-reference') {
    delete clone.previewUrl;
    delete clone.thumbnailUrl;
  }
  return clone;
}

function isContextItem(value: unknown): value is ContextItem {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.timestamp !== 'number') {
    return false;
  }
  switch (value.type) {
    case 'file': return typeof value.filePath === 'string' && typeof value.fileName === 'string';
    case 'directory': return typeof value.directoryPath === 'string' && typeof value.directoryName === 'string' && typeof value.recursive === 'boolean';
    case 'code-snippet': return typeof value.filePath === 'string' && typeof value.fileName === 'string' && typeof value.startLine === 'number' && typeof value.endLine === 'number' && typeof value.selectedText === 'string';
    case 'pull-request': return typeof value.label === 'string' && typeof value.section === 'string' && typeof value.content === 'string';
    case 'image': return typeof value.imagePath === 'string' && typeof value.imageName === 'string' && typeof value.mimeType === 'string' && typeof value.fileSize === 'number' && typeof value.source === 'string' && typeof value.isLocal === 'boolean';
    case 'media-reference': return typeof value.kind === 'string' && typeof value.mediaPath === 'string' && typeof value.mediaName === 'string';
    case 'session-reference': return typeof value.sessionId === 'string' && typeof value.sessionTitle === 'string';
    case 'terminal-command': return typeof value.command === 'string';
    case 'git-ref': return typeof value.refType === 'string' && typeof value.refValue === 'string';
    case 'url': return typeof value.url === 'string';
    case 'mermaid-node': return typeof value.nodeId === 'string' && typeof value.nodeText === 'string' && typeof value.nodeType === 'string';
    case 'mermaid-diagram': return typeof value.diagramCode === 'string';
    case 'web-element': return typeof value.tagName === 'string' && typeof value.path === 'string' && isRecord(value.attributes) && typeof value.textContent === 'string' && typeof value.outerHTML === 'string';
    default: return false;
  }
}

export function createComposerPresentation(
  value: string,
  contexts: readonly ContextItem[],
): ComposerPresentation {
  const matches: Array<{
    start: number;
    end: number;
    segment: Exclude<ComposerPresentationSegment, { type: 'text' }>;
  }> = [];
  const unusedContexts = new Set(contexts);
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  const longestTokensFirst = [...contexts].sort(
    (left, right) =>
      getContextPresentationToken(right).length - getContextPresentationToken(left).length,
  );
  for (const context of longestTokensFirst) {
    const token = getContextPresentationToken(context);
    let cursor = 0;
    while (cursor < value.length) {
      const start = value.indexOf(token, cursor);
      if (start < 0) break;
      const end = start + token.length;
      if (occupiedRanges.some(range => start < range.end && end > range.start)) {
        cursor = end;
        continue;
      }
      matches.push({
        start,
        end,
        segment: { type: 'context', context: sanitizeContext(context) },
      });
      occupiedRanges.push({ start, end });
      unusedContexts.delete(context);
      break;
    }
  }
  for (const match of getSkillPromptReferenceMatches(value)) {
    matches.push({
      start: match.start,
      end: match.end,
      segment: { type: 'skill', name: match.name },
    });
  }
  matches.sort((a, b) => a.start - b.start || a.end - b.end);

  const segments: ComposerPresentationSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) segments.push({ type: 'text', text: value.slice(cursor, match.start) });
    segments.push(match.segment);
    cursor = match.end;
  }
  if (cursor < value.length) segments.push({ type: 'text', text: value.slice(cursor) });

  // Image-strip and externally supplied contexts may not have an inline token.
  for (const context of unusedContexts) {
    segments.push({ type: 'context', context: sanitizeContext(context) });
  }
  return { version: COMPOSER_PRESENTATION_VERSION, segments };
}

export function parseComposerPresentation(value: unknown): ComposerPresentation | null {
  if (!isRecord(value) || value.version !== COMPOSER_PRESENTATION_VERSION || !Array.isArray(value.segments)) {
    return null;
  }
  const segments: ComposerPresentationSegment[] = [];
  for (const segment of value.segments) {
    if (!isRecord(segment)) return null;
    if (segment.type === 'text' && typeof segment.text === 'string') {
      segments.push({ type: 'text', text: segment.text });
    } else if (segment.type === 'skill' && typeof segment.name === 'string' && segment.name.trim()) {
      segments.push({ type: 'skill', name: segment.name });
    } else if (segment.type === 'context' && isContextItem(segment.context)) {
      segments.push({ type: 'context', context: sanitizeContext(segment.context) });
    } else {
      return null;
    }
  }
  return { version: COMPOSER_PRESENTATION_VERSION, segments };
}

export function getComposerPresentationContexts(presentation: ComposerPresentation): ContextItem[] {
  return presentation.segments
    .filter((segment): segment is Extract<ComposerPresentationSegment, { type: 'context' }> => segment.type === 'context')
    .map(segment => segment.context);
}

export function composerPresentationToValue(presentation: ComposerPresentation): string {
  return presentation.segments.map(segment => {
    if (segment.type === 'text') return segment.text;
    if (segment.type === 'skill') return `[[void-skill:${encodeURIComponent(segment.name)}]]`;
    return getContextPresentationToken(segment.context);
  }).join('');
}

export function composerPresentationToAccessibleText(presentation: ComposerPresentation): string {
  return presentation.segments.map(segment => {
    if (segment.type === 'text') return segment.text;
    if (segment.type === 'skill') return `[Skill: ${segment.name}]`;
    const label = getContextPresentationLabel(segment.context);
    return segment.context.type === 'session-reference'
      ? `[Session: ${label}]`
      : `[${segment.context.type}: ${label}]`;
  }).join('').replace(/[ \t]+\n/g, '\n').trim();
}
