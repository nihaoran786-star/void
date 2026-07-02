import { searchShortDramaIndex } from './ShortDramaArtifactIndex';
import type {
  ShortDramaArtifactType,
  ShortDramaNaturalLanguageTargetInput,
  ShortDramaNaturalLanguageTargetResult,
  ShortDramaProject,
  ShortDramaSearchIndexQuery,
  ShortDramaStage,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-target-resolver' as const;
const CN_TEN = '\u5341';

const CHINESE_DIGIT_VALUES: Record<string, number> = {
  '\u4e00': 1,
  '\u4e8c': 2,
  '\u4e24': 2,
  '\u4e09': 3,
  '\u56db': 4,
  '\u4e94': 5,
  '\u516d': 6,
  '\u4e03': 7,
  '\u516b': 8,
  '\u4e5d': 9,
  [CN_TEN]: 10,
};

export function resolveShortDramaNaturalLanguageTarget(
  project: ShortDramaProject,
  input: ShortDramaNaturalLanguageTargetInput,
): ShortDramaNaturalLanguageTargetResult {
  const query = createTargetSearchQuery(input);

  if (hasDeicticReference(input.text) && !input.workspace?.activeArtifactId) {
    const contextualTarget = resolveContextualStageEpisodeTarget(project, query);
    if (contextualTarget) {
      return contextualTarget;
    }

    return {
      status: 'needs_context',
      source: SOURCE,
      reason: 'deictic_reference_without_focus',
      query,
    };
  }

  if (input.workspace?.activeArtifactId && hasDeicticReference(input.text)) {
    const focused = searchShortDramaIndex(project, {
      ...query,
      text: undefined,
      limit: 1,
    });
    const candidate = focused.status === 'ready'
      ? focused.results.find(item => item.sourceId === input.workspace?.activeArtifactId)
      : undefined;

    if (candidate) {
      return {
        status: 'ready',
        source: SOURCE,
        query,
        focusedArtifactId: input.workspace.activeArtifactId,
        candidates: [candidate],
      };
    }
  }

  const search = searchShortDramaIndex(project, query);
  if (search.status !== 'ready') {
    return {
      status: 'empty',
      source: SOURCE,
      reason: 'no_matches',
      query,
    };
  }

  return {
    status: 'ready',
    source: SOURCE,
    query,
    candidates: search.results,
  };
}

function resolveContextualStageEpisodeTarget(
  project: ShortDramaProject,
  query: ShortDramaSearchIndexQuery,
): ShortDramaNaturalLanguageTargetResult | undefined {
  if (!query.stage || !query.episodeNumber) {
    return undefined;
  }

  const contextualSearch = searchShortDramaIndex(project, {
    ...query,
    text: undefined,
  });

  if (contextualSearch.status !== 'ready' || contextualSearch.results.length === 0) {
    return undefined;
  }

  return {
    status: 'ready',
    source: SOURCE,
    query,
    candidates: contextualSearch.results,
  };
}

function createTargetSearchQuery(input: ShortDramaNaturalLanguageTargetInput): ShortDramaSearchIndexQuery {
  const text = input.text.trim();
  const stage = inferStage(text, input.workspace?.stage);
  const artifactType = inferArtifactType(text, stage);
  const mediaKind = inferMediaKind(text, artifactType);
  const episodeNumber = inferEpisodeNumber(text)
    ?? (input.workspace?.activeEpisodeId ? parseEpisodeNumberFromId(input.workspace.activeEpisodeId) : undefined);
  const cleanedText = cleanSearchText(text);

  return {
    text: cleanedText || undefined,
    stage,
    episodeNumber,
    artifactType,
    mediaKind,
    includeEmptyMedia: true,
    limit: Math.max(1, input.limit ?? 8),
  };
}

function inferStage(text: string, workspaceStage: ShortDramaStage | undefined): ShortDramaStage | undefined {
  if (/(\u540e\u671f|\u6210\u7247|\u526a\u8f91|\u5b57\u5e55|\u8c03\u8272|\u914d\u97f3)/.test(text)) return 'post';
  if (/(\u89c6\u9891|\u955c\u5934|clip|render)/i.test(text)) return 'video';
  if (/(\u5206\u955c|storyboard)/i.test(text)) return 'storyboards';
  if (/(\u8d44\u4ea7|\u89d2\u8272|\u573a\u666f|\u9053\u5177|\u8857\u5934|\u56fe\u7247|\u56fe|image|location|prop|character)/i.test(text)) return 'assets';
  if (/(\u5267\u672c|\u53f0\u8bcd|\u5267\u60c5|script)/i.test(text)) return 'script';
  return workspaceStage;
}

function inferArtifactType(
  text: string,
  stage: ShortDramaStage | undefined,
): ShortDramaArtifactType | undefined {
  if (stage === 'post' && /(\u6210\u7247|\u540e\u671f|\u526a\u8f91|\u8c03\u8272)/.test(text)) return undefined;
  if (/(\u5973\u4e3b|\u89d2\u8272|character)/i.test(text)) return 'character';
  if (/(\u573a\u666f|\u8857\u5934|\u5730\u70b9|location)/i.test(text)) return 'location';
  if (/(\u9053\u5177|prop)/i.test(text)) return 'prop';
  if (/(\u5b57\u5e55|subtitle)/i.test(text)) return 'subtitle';
  if (/(\u6210\u7247|\u89c6\u9891|\u955c\u5934|clip|render)/i.test(text)) return 'video';
  if (/(\u5206\u955c|storyboard)/i.test(text)) return 'storyboard';
  if (stage === 'script') return 'script';
  return undefined;
}

function inferMediaKind(
  text: string,
  artifactType: ShortDramaArtifactType | undefined,
): ShortDramaSearchIndexQuery['mediaKind'] {
  if (/(\u89c6\u9891|\u6210\u7247|\u955c\u5934|clip|render)/i.test(text)) return 'video';
  if (/(\u97f3\u9891|\u914d\u97f3|\u97f3\u4e50|\u97f3\u6548|voice|music|sfx)/i.test(text)) return 'audio';
  if (/(\u56fe\u7247|\u56fe|\u5206\u955c|\u89d2\u8272|\u573a\u666f|\u9053\u5177|image|storyboard)/i.test(text)) return 'image';
  if (artifactType === 'video' || artifactType === 'subtitle' || artifactType === 'color') return 'video';
  if (artifactType === 'voice' || artifactType === 'music' || artifactType === 'sfx') return 'audio';
  if (artifactType === 'character' || artifactType === 'location' || artifactType === 'prop' || artifactType === 'storyboard') return 'image';
  return undefined;
}

function inferEpisodeNumber(text: string): number | undefined {
  const numeric = /\u7b2c\s*(\d+)\s*\u96c6/.exec(text) ?? /\bEP\s*0*(\d+)\b/i.exec(text) ?? /\bEpisode\s+0*(\d+)\b/i.exec(text);
  if (numeric) return Number(numeric[1]);

  const chinese = /\u7b2c\s*([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u96c6/.exec(text);
  return chinese ? parseChineseNumber(chinese[1]) : undefined;
}

function parseChineseNumber(value: string): number | undefined {
  if (value === CN_TEN) return 10;
  if (value.startsWith(CN_TEN)) {
    return 10 + (CHINESE_DIGIT_VALUES[value.slice(1)] ?? 0);
  }
  if (value.endsWith(CN_TEN)) {
    return (CHINESE_DIGIT_VALUES[value.slice(0, -1)] ?? 0) * 10;
  }
  if (value.includes(CN_TEN)) {
    const [tens, ones] = value.split(CN_TEN);
    return (CHINESE_DIGIT_VALUES[tens] ?? 0) * 10 + (CHINESE_DIGIT_VALUES[ones] ?? 0);
  }
  return CHINESE_DIGIT_VALUES[value];
}

function parseEpisodeNumberFromId(episodeId: string) {
  const match = /episode-(\d+)/i.exec(episodeId);
  return match ? Number(match[1]) : undefined;
}

function hasDeicticReference(text: string) {
  return /(\u8fd9\u4e2a|\u8fd9\u5f20|\u8fd9\u6bb5|\u5f53\u524d|\u8fd9\u91cc)/.test(text);
}

function cleanSearchText(text: string) {
  return text
    .replace(/\u7b2c\s*(?:\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u96c6/g, ' ')
    .replace(/\bEP\s*0*\d+\b/gi, ' ')
    .replace(/\bEpisode\s+0*\d+\b/gi, ' ')
    .replace(/(\u8fd9\u4e2a|\u8fd9\u5f20|\u8fd9\u6bb5|\u5f53\u524d|\u8fd9\u91cc|\u90a3\u5f20|\u90a3\u4e2a|\u4e00\u5f20|\u4e00\u4e2a|\u56fe\u7247|\u89c6\u9891|\u955c\u5934|\u6210\u7247|\u540e\u671f|\u89d2\u8272\u56fe|\u573a\u666f\u56fe|\u9053\u5177\u56fe|\u56fe|\u592a\u6162|\u4e0d\u6ee1\u610f|\u4e0d\u5bf9|\u9700\u8981|\u4fee\u6539|\u4f18\u5316|\u91cd\u65b0|\u786e\u8ba4)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
